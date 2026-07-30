-- Fecha as duas contradições que a vitrine ainda tinha com o comparativo:
--
--   1. DOCX sai do Croqui. Ele passou a ser diferencial do Profissional para
--      cima, então prometê-lo no plano de entrada era a mesma página dizendo
--      duas coisas.
--   2. SLA deixa de valer para o Escritório: o suporte dele é "Prioritário", e
--      "Prioritário + SLA" passa a ser do Enterprise.
--
-- A linha de suporte entra nas specs de todos os planos — antes só existia no
-- comparativo da landing, e o card não dizia nada sobre atendimento.
UPDATE "plans" SET "features" = '{"resumo": "Croqui e memorial descritivo. A análise de matrícula não entra na franquia — é comprada avulsa, quando precisar.", "specs": ["20 croquis / mês", "1 usuário", "Detector de prompts", "Suporte: base de conhecimento", "Matrícula avulsa a partir de R$ 89"], "ferramentas": ["croqui", "kml", "injection"], "destaque": false}'
WHERE "id" = 'a1000000-0000-4000-8000-000000000001';--> statement-breakpoint

UPDATE "plans" SET "features" = '{"resumo": "Análise jurídica completa, cadeia dominial e relatório em PDF.", "specs": ["5 matrículas / mês", "40 croquis / mês", "1 usuário", "Detector de prompts", "Suporte por e-mail", "Matrícula extra: R$ 39"], "ferramentas": ["matricula", "croqui", "kml", "injection"], "destaque": false}'
WHERE "id" = 'a1000000-0000-4000-8000-000000000004';--> statement-breakpoint

UPDATE "plans" SET "features" = '{"resumo": "Relatório com a sua marca (white-label) e exportação em DOCX.", "specs": ["15 matrículas / mês", "40 croquis / mês", "Até 3 usuários", "Detector de prompts", "White-label e DOCX", "Suporte por e-mail prioritário", "Matrícula extra: R$ 29"], "ferramentas": ["matricula", "croqui", "kml", "injection"], "destaque": true}'
WHERE "id" = 'a1000000-0000-4000-8000-000000000002';--> statement-breakpoint

UPDATE "plans" SET "features" = '{"resumo": "Acesso à API e suporte prioritário.", "specs": ["50 matrículas / mês", "60 croquis / mês", "Até 10 usuários", "Detector de prompts", "White-label e DOCX", "Acesso à API", "Suporte prioritário", "Matrícula extra: R$ 19"], "ferramentas": ["matricula", "croqui", "kml", "injection"], "destaque": false}'
WHERE "id" = 'a1000000-0000-4000-8000-000000000003';--> statement-breakpoint

UPDATE "plans" SET "features" = '{"resumo": "Integrações dedicadas, contrato anual, SLA e suporte jurídico dedicado.", "specs": ["Volume de matrículas sob contrato", "Croquis sob contrato", "Usuários sob contrato", "Detector de prompts", "White-label e DOCX", "Acesso à API", "Jurídico dedicado e SLA", "Suporte prioritário + SLA"], "ferramentas": ["matricula", "croqui", "kml", "injection"], "destaque": false, "sobContrato": true}'
WHERE "id" = 'a1000000-0000-4000-8000-000000000005';
