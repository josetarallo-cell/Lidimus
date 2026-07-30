-- Alinha a vitrine do /conta/assinatura com o comparativo da landing.
--
-- O que muda de fato na comunicação:
--   * Detector de conteúdo oculto sai da lista de diferenciais do Profissional.
--     Ele nunca foi um diferencial: está em FERRAMENTAS_SEM_PLANO
--     (apps/web/server/lib/planAccess.ts) e roda até sem assinatura. Anunciá-lo
--     como exclusivo de plano pago era promessa invertida.
--   * White-label sobe do Escritório para o Profissional, e o SLA desce do
--     Escritório para o Enterprise.
--   * SSO sai do Enterprise.
--
-- Só `features` muda: preço, créditos e teto de usuários seguem intactos.
UPDATE "plans" SET "features" = '{"resumo": "Croqui, memorial descritivo e exportação em DOCX. A análise de matrícula não entra na franquia — é comprada avulsa, quando precisar.", "specs": ["20 croquis / mês", "1 usuário", "Detector de prompts", "Matrícula avulsa a partir de R$ 89"], "ferramentas": ["croqui", "kml", "injection"], "destaque": false}'
WHERE "id" = 'a1000000-0000-4000-8000-000000000001';--> statement-breakpoint

UPDATE "plans" SET "features" = '{"resumo": "Análise jurídica completa, cadeia dominial e relatório em PDF.", "specs": ["5 matrículas / mês", "40 croquis / mês", "1 usuário", "Detector de prompts", "Matrícula extra: R$ 39"], "ferramentas": ["matricula", "croqui", "kml", "injection"], "destaque": false}'
WHERE "id" = 'a1000000-0000-4000-8000-000000000004';--> statement-breakpoint

UPDATE "plans" SET "features" = '{"resumo": "Relatório com a sua marca (white-label) e exportação em DOCX.", "specs": ["15 matrículas / mês", "40 croquis / mês", "Até 3 usuários", "Detector de prompts", "White-label e DOCX", "Matrícula extra: R$ 29"], "ferramentas": ["matricula", "croqui", "kml", "injection"], "destaque": true}'
WHERE "id" = 'a1000000-0000-4000-8000-000000000002';--> statement-breakpoint

UPDATE "plans" SET "features" = '{"resumo": "Acesso à API e suporte prioritário.", "specs": ["50 matrículas / mês", "60 croquis / mês", "Até 10 usuários", "Detector de prompts", "White-label e DOCX", "Acesso à API", "Matrícula extra: R$ 19"], "ferramentas": ["matricula", "croqui", "kml", "injection"], "destaque": false}'
WHERE "id" = 'a1000000-0000-4000-8000-000000000003';--> statement-breakpoint

UPDATE "plans" SET "features" = '{"resumo": "Integrações dedicadas, contrato anual, SLA e suporte jurídico dedicado.", "specs": ["Volume de matrículas sob contrato", "Croquis sob contrato", "Usuários sob contrato", "Detector de prompts", "White-label e DOCX", "Acesso à API", "Jurídico dedicado e SLA"], "ferramentas": ["matricula", "croqui", "kml", "injection"], "destaque": false, "sobContrato": true}'
WHERE "id" = 'a1000000-0000-4000-8000-000000000005';
