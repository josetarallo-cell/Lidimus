import { sql } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { requirePlatformAdmin } from '../../lib/requirePlatformAdmin'
import { CORTESIAS_POR_ORG } from '../../lib/planAccess'

// Visão de clientes: organização + dono + plano/status da assinatura mais
// recente + saldo de créditos + análises de cortesia + último job
export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event)
  const db = useDb()

  const rows = await db.execute(sql`
    select
      o.id,
      o.name,
      o.is_personal,
      u.email as owner_email,
      o.created_at,
      coalesce((select sum(ct.delta) from credit_transactions ct where ct.org_id = o.id), 0)::int as balance,
      o.cortesias_extra,
      -- Mesma regra de planAccess.jobDeCortesia: falha não conta como usada.
      (
        select count(*) from jobs j2
        where j2.org_id = o.id
          and j2.type = 'matricula'
          and j2.status <> 'error'
          and j2.input_meta->>'viaCortesia' = 'true'
      )::int as cortesias_usadas,
      (select max(j.created_at) from jobs j where j.org_id = o.id) as last_job_at,
      s.id as subscription_id,
      s.status as subscription_status,
      p.name as plan_name
    from organizations o
    join users u on u.id = o.owner_id
    left join lateral (
      select * from subscriptions s2 where s2.org_id = o.id order by s2.created_at desc limit 1
    ) s on true
    left join plans p on p.id = s.plan_id
    order by o.created_at desc
  `)

  // O teto padrão vem de planAccess para não existir um "1" escrito na tela do
  // admin e outro no servidor. O teto por IP não entra: ele depende de quem
  // está conectando naquele momento, não da organização.
  return rows.map((r) => ({
    ...r,
    cortesias_disponiveis: Math.max(
      0,
      CORTESIAS_POR_ORG + Number(r.cortesias_extra ?? 0) - Number(r.cortesias_usadas ?? 0),
    ),
  }))
})
