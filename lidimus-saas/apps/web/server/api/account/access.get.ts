import { useDb } from '../../lib/db'
import { requireAuth } from '../../lib/requireAuth'
import { resolverOrgAtivaDoUsuario } from '../../lib/orgAtiva'
import {
  ferramentasDoPlano,
  avulsosDisponiveis,
  planoLiberaApi,
  planoLiberaDocx,
} from '../../lib/planAccess'

// Nível de acesso da organização: o que a franquia do plano libera e quantas
// análises avulsas ainda restam. A UI usa isso só para não oferecer o que vai
// levar 403 — quem decide é o servidor, na criação do job.
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = useDb()

  const orgId = await resolverOrgAtivaDoUsuario(db, user.id, user.name)
  const [ferramentas, avulsos, api, docx] = await Promise.all([
    ferramentasDoPlano(db, orgId),
    avulsosDisponiveis(db, orgId),
    planoLiberaApi(db, orgId),
    planoLiberaDocx(db, orgId),
  ])

  return {
    ferramentas,
    avulsosMatricula: avulsos,
    // Atalho do caso que a UI mais consulta: dá para abrir a análise agora?
    podeMatricula: ferramentas.includes('matricula') || avulsos > 0,
    // O menu da conta usa isto para esconder Conta → API de quem não tem o
    // recurso no plano. Emitir chave ainda exige ser o proprietário — quem
    // decide isso é o endpoint, não a tela.
    api,
    // O parecer esconde "Exportar DOCX" de quem não tem o recurso, para não
    // oferecer o que vai levar 403. Quem decide continua sendo a rota.
    docx,
  }
})
