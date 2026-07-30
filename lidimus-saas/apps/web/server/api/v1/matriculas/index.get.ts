import { z } from 'zod'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { jobs } from '@lidimus/db'
import { useDb } from '../../../lib/db'
import { requireApiKey } from '../../../lib/requireApiKey'
import { defineRotaApi, erroApi } from '../../../lib/v1/erroApi'
import { serializarJob } from '../../../lib/v1/serializarJob'

// GET /api/v1/matriculas — análises da organização, da mais recente para a mais
// antiga.
//
// Paginação por cursor, não por offset: a lista cresce pela frente justamente
// enquanto o cliente pagina (ele está enviando análises), e offset nessa situação
// repete e pula registros. O cursor é opaco de propósito — é `created_at|id` em
// base64url, e o cliente só precisa devolvê-lo como veio.
const querySchema = z.object({
  limite: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['queued', 'processing', 'done', 'error']).optional(),
  cursor: z.string().optional(),
})

// `pending` é o estado de instantes entre o débito e o enfileiramento; para quem
// consulta de fora, é fila.
const STATUS_INTERNOS = {
  queued: ['pending', 'queued'],
  processing: ['processing'],
  done: ['done'],
  error: ['error'],
} as const

function lerCursor(cursor: string): { criadoEm: Date; id: string } {
  const [data, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
  const criadoEm = new Date(data ?? '')
  if (!id || Number.isNaN(criadoEm.getTime())) {
    throw erroApi(400, 'requisicao_invalida', 'Cursor inválido. Use o valor de "proximoCursor" como veio na resposta anterior.')
  }
  return { criadoEm, id }
}

function escreverCursor(criadoEm: Date, id: string): string {
  return Buffer.from(`${criadoEm.toISOString()}|${id}`, 'utf8').toString('base64url')
}

export default defineRotaApi(async (event) => {
  const { orgId } = await requireApiKey(event)
  const db = useDb()

  const query = querySchema.safeParse(getQuery(event))
  if (!query.success) {
    throw erroApi(
      400,
      'requisicao_invalida',
      'Parâmetros inválidos. "limite" vai de 1 a 100 e "status" aceita queued, processing, done ou error.',
    )
  }
  const { limite, status, cursor } = query.data

  const filtros = [eq(jobs.orgId, orgId), eq(jobs.type, 'matricula' as const)]

  if (status) {
    filtros.push(inArray(jobs.status, [...STATUS_INTERNOS[status]]))
  }

  if (cursor) {
    const { criadoEm, id } = lerCursor(cursor)
    // Comparação de tupla: sem o desempate por id, duas análises criadas no mesmo
    // instante fariam a página seguinte pular uma delas.
    filtros.push(sql`(${jobs.createdAt}, ${jobs.id}) < (${criadoEm.toISOString()}::timestamp, ${id}::uuid)`)
  }

  // Pede um a mais que o limite para saber se existe página seguinte sem precisar
  // de um count() sobre a tabela inteira.
  const linhas = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      stage: jobs.stage,
      inputMeta: jobs.inputMeta,
      // `result` fica de fora da consulta, não só da resposta: não faz sentido
      // trazer do Postgres um JSON grande por linha para descartar depois.
      errorMessage: jobs.errorMessage,
      createdAt: jobs.createdAt,
      completedAt: jobs.completedAt,
    })
    .from(jobs)
    .where(and(...filtros))
    .orderBy(desc(jobs.createdAt), desc(jobs.id))
    .limit(limite + 1)

  const temMais = linhas.length > limite
  const pagina = temMais ? linhas.slice(0, limite) : linhas
  const ultimo = pagina.at(-1)

  return {
    itens: pagina.map((job) => serializarJob(job, { incluirResultado: false })),
    proximoCursor: temMais && ultimo ? escreverCursor(ultimo.createdAt, ultimo.id) : null,
  }
})
