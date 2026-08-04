import { sql } from 'drizzle-orm'
import { useDb } from '../../lib/db'
import { requirePlatformAdmin } from '../../lib/requirePlatformAdmin'

// Visão de clientes: organização + dono + plano/status da assinatura mais
// recente + saldo de créditos + último job
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

  return rows
})
