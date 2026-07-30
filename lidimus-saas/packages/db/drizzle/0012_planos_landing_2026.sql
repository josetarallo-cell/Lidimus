-- Tabela de planos alinhada à página pública e ao relatório de precificação
-- (docs/relatorio-precificacao.md, v1.0 · jul/2026 — §2 preços, §3 margens).
--
-- Preço, franquia e nº de usuários vêm da §2 do relatório, que é o que a landing
-- anuncia. A franquia é publicada em matrículas e croquis, mas o consumo aqui é
-- medido em créditos: a conversão usa a calibragem de packages/db/src/credits.ts
-- (matrícula = 83 + 8/pág; croqui = 12 + 3/pág), com documento de referência no
-- teto da faixa típica do relatório — matrícula de 20 páginas (243 créditos) e
-- croqui no cap de 15 páginas da §4.4 (57 créditos). A referência é alta de
-- propósito: a franquia anunciada tem de ser entregue também no documento longo,
-- não só no curto.
--
--   Croqui        20 croquis                     = 1.140  → 1.150
--   Essencial      5 matrículas + 40 croquis     = 3.495  → 3.500
--   Profissional  15 matrículas + 30 croquis (*) = 5.355  → 5.400
--   Escritório    50 matrículas + 60 croquis (*) = 15.570 → 15.600
--
-- (*) "croquis ilimitados" não tem representação em um saldo finito de créditos.
--     O volume usado aqui é o mesmo que o relatório assume na análise de margem
--     da §3.1 (custo variável de R$ 55 no Profissional e R$ 170 no Escritório).
--
-- Margem no uso pleno da franquia, com o custo variável típico do relatório
-- (R$ 1,57/matrícula, R$ 0,33/croqui), impostos de 16% e gateway 3,99% + R$ 0,39:
--   Croqui R$ 17 (57%) · Essencial R$ 136 (69%) · Profissional R$ 364 (73%).
--
-- As linhas existentes são atualizadas no lugar, nunca recriadas: assinaturas
-- ativas referenciam esses ids. O valor que o assinante antigo paga continua
-- vindo do Stripe (subscription.get.ts lê o preço da assinatura) — esta tabela
-- governa a vitrine, o checkout novo e a concessão de créditos por ciclo.
INSERT INTO "plans" ("id", "name", "monthly_price_cents", "annual_price_cents", "credits_per_cycle", "max_users", "features") VALUES
	(
		'a1000000-0000-4000-8000-000000000001',
		'Croqui',
		2990,
		29900,
		1150,
		1,
		'{"resumo": "Croqui, memorial descritivo e exportação em DOCX. A análise de matrícula é comprada à parte, em créditos avulsos.", "specs": ["20 croquis / mês", "1 usuário", "Matrícula avulsa a partir de R$ 89"], "destaque": false}'
	),
	(
		'a1000000-0000-4000-8000-000000000004',
		'Essencial',
		19700,
		197000,
		3500,
		1,
		'{"resumo": "Análise jurídica completa, cadeia dominial e relatório em PDF.", "specs": ["5 matrículas / mês", "40 croquis / mês", "1 usuário", "Matrícula extra: R$ 39"], "destaque": false}'
	),
	(
		'a1000000-0000-4000-8000-000000000002',
		'Profissional',
		49700,
		497000,
		5400,
		3,
		'{"resumo": "Marca própria no relatório, Detector de conteúdo oculto e histórico completo.", "specs": ["15 matrículas / mês", "Croquis ilimitados", "Até 3 usuários", "Matrícula extra: R$ 29"], "destaque": true}'
	),
	(
		'a1000000-0000-4000-8000-000000000003',
		'Escritório',
		129700,
		1297000,
		15600,
		10,
		'{"resumo": "Acesso à API, white-label, SLA e suporte prioritário.", "specs": ["50 matrículas / mês", "Croquis ilimitados", "Até 10 usuários", "Matrícula extra: R$ 19"], "destaque": false}'
	)
ON CONFLICT ("id") DO UPDATE SET
	"name" = EXCLUDED."name",
	"monthly_price_cents" = EXCLUDED."monthly_price_cents",
	"annual_price_cents" = EXCLUDED."annual_price_cents",
	"credits_per_cycle" = EXCLUDED."credits_per_cycle",
	"max_users" = EXCLUDED."max_users",
	"features" = EXCLUDED."features";
