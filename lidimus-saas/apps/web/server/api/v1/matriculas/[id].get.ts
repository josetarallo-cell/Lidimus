import { useDb } from '../../../lib/db'
import { requireApiKey } from '../../../lib/requireApiKey'
import { getJobForOrg } from '../../../lib/getJobForOrg'
import { defineRotaApi, erroApi } from '../../../lib/v1/erroApi'
import { serializarJob } from '../../../lib/v1/serializarJob'

// GET /api/v1/matriculas/{id} — estado e resultado de uma análise.
//
// É o endpoint de polling: o cliente chama até `status` virar "done" ou "error".
// Uma análise de matrícula leva minutos (ocr → juridico → doc), então intervalo
// de 10 a 30 segundos é o razoável — está na documentação.
export default defineRotaApi(async (event) => {
  const { orgId } = await requireApiKey(event)
  const db = useDb()

  const id = getRouterParam(event, 'id')
  if (!id) throw erroApi(400, 'requisicao_invalida', 'Informe o id da análise na URL.')

  // 404 e nunca 403 quando o job é de outra organização: responder "sem
  // permissão" confirmaria que aquele id existe.
  const job = await getJobForOrg(db, id, orgId, 'matricula')
  if (!job) throw erroApi(404, 'nao_encontrado', 'Análise não encontrada.')

  return serializarJob(job)
})
