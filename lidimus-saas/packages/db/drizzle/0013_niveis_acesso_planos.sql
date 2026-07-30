-- Níveis de acesso por plano, e a quantidade real de croquis onde a tabela dizia
-- "ilimitado".
--
-- 1) `features.ferramentas` passa a ser a fonte da verdade do que cada plano
--    libera. A análise de matrícula começa no Essencial — a franquia do plano
--    Croqui não a inclui. Quem não tem assinatura ativa cai no piso declarado em
--    apps/web/server/lib/planAccess.ts, que é o mesmo conjunto do Croqui: sem
--    assinatura ninguém pode ter mais acesso do que o plano de entrada.
--    Fora da franquia ainda existe o caminho avulso: uma compra avulsa (o Pix de
--    R$ 89 do relatório §4.2) libera uma análise, como a landing anuncia. Toda a
--    checagem é feita no servidor, na criação do job; a UI só reflete o que o
--    servidor já decidiu.
--
-- 2) "Croquis ilimitados" sai da vitrine: o consumo é debitado de um saldo finito
--    de créditos, então "ilimitado" nunca foi verdade. Entram os volumes que a
--    migration 0012 usou para dimensionar a franquia — e que o relatório usa na
--    margem da §3.1: 60 croquis no Escritório (já cabem nos 15.600 créditos) e
--    30 no Profissional. Só que 30 ficaria ABAIXO dos 40 do Essencial, ou seja,
--    o plano mais caro entregaria menos croquis que o mais barato. O Profissional
--    vai então a 40 croquis, empatando com o Essencial (o que ele vende a mais é
--    matrícula, usuários e recursos), e os créditos sobem junto para manter a
--    identidade franquia = créditos:
--      15 × 243 + 40 × 57 = 5.925 → 5.900 créditos/mês
--    No uso pleno isso custa 15×R$1,57 + 40×R$0,33 = R$36,75 sobre R$497 de
--    receita — a margem segue em ~73%, dentro do modelo do relatório.
UPDATE "plans" SET "features" = '{"resumo": "Croqui, memorial descritivo e exportação em DOCX. A análise de matrícula não entra na franquia — é comprada avulsa, quando precisar.", "specs": ["20 croquis / mês", "1 usuário", "Matrícula avulsa a partir de R$ 89"], "ferramentas": ["croqui", "kml", "injection"], "destaque": false}'
WHERE "id" = 'a1000000-0000-4000-8000-000000000001';--> statement-breakpoint

UPDATE "plans" SET "features" = '{"resumo": "Análise jurídica completa, cadeia dominial e relatório em PDF.", "specs": ["5 matrículas / mês", "40 croquis / mês", "1 usuário", "Matrícula extra: R$ 39"], "ferramentas": ["matricula", "croqui", "kml", "injection"], "destaque": false}'
WHERE "id" = 'a1000000-0000-4000-8000-000000000004';--> statement-breakpoint

UPDATE "plans" SET
	"credits_per_cycle" = 5900,
	"features" = '{"resumo": "Marca própria no relatório, Detector de conteúdo oculto e histórico completo.", "specs": ["15 matrículas / mês", "40 croquis / mês", "Até 3 usuários", "Matrícula extra: R$ 29"], "ferramentas": ["matricula", "croqui", "kml", "injection"], "destaque": true}'
WHERE "id" = 'a1000000-0000-4000-8000-000000000002';--> statement-breakpoint

UPDATE "plans" SET "features" = '{"resumo": "Acesso à API, white-label, SLA e suporte prioritário.", "specs": ["50 matrículas / mês", "60 croquis / mês", "Até 10 usuários", "Matrícula extra: R$ 19"], "ferramentas": ["matricula", "croqui", "kml", "injection"], "destaque": false}'
WHERE "id" = 'a1000000-0000-4000-8000-000000000003';
