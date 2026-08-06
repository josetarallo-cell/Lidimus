import { useDb } from '../../lib/db'
import { requireAuth } from '../../lib/requireAuth'
import { resolverOrgAtivaDoUsuario } from '../../lib/orgAtiva'
import {
  ferramentasDoPlano,
  avulsosDisponiveis,
  cortesiasDisponiveis,
  planoLiberaApi,
  planoLiberaDocx,
} from '../../lib/planAccess'
import { ipDoCliente } from '../../lib/ipDoCliente'

// Nível de acesso da organização: o que a franquia do plano libera, quantas
// análises avulsas ainda restam e se a análise de cortesia continua de pé. A UI
// usa isso só para não oferecer o que vai levar 403 — quem decide é o servidor,
// na criação do job.
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const orgId = await resolverOrgAtivaDoUsuario(db, user.id, user.name)
  // O mesmo IP que a criação do job vai usar: perguntado daqui, o teto por
  // endereço aparece na tela como ausência da oferta, e não como recusa depois
  // de escolher o arquivo.
  const ip = ipDoCliente(event)
  const [ferramentas, avulsos, cortesias, api, docx] = await Promise.all([
    ferramentasDoPlano(db, orgId),
    avulsosDisponiveis(db, orgId),
    cortesiasDisponiveis(db, orgId, ip),
    planoLiberaApi(db, orgId),
    planoLiberaDocx(db, orgId),
  ])

  return {
    ferramentas,
    avulsosMatricula: avulsos,
    cortesiasMatricula: cortesias,
    // Atalho do caso que a UI mais consulta: dá para abrir a análise agora?
    podeMatricula: ferramentas.includes('matricula') || avulsos > 0 || cortesias > 0,
    // O menu da conta usa isto para esconder Conta → API de quem não tem o
    // recurso no plano. Emitir chave ainda exige ser o proprietário — quem
    // decide isso é o endpoint, não a tela.
    api,
    // O parecer esconde "Exportar DOCX" de quem não tem o recurso, para não
    // oferecer o que vai levar 403. Quem decide continua sendo a rota.
    docx,
  }
})
