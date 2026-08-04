-- Entitlement da exportação em Word.
--
-- Os cards do Profissional, do Escritório e do Enterprise vendem "White-label e
-- DOCX" desde a 0018 — e a 0018 tirou a promessa do Croqui justamente para que
-- ela virasse diferencial do Profissional para cima. Mas isso era copy de
-- vitrine: quando a exportação passou a existir de fato, qualquer plano baixava
-- o arquivo. Esta migration transforma a promessa em dado.
--
-- `features.docx` é entitlement, no mesmo espírito de `features.api` da 0019 e
-- de `features.ferramentas` da 0013: quem decide acesso é o dado, nunca uma
-- comparação por nome de plano no código. Ausência da chave vale como false —
-- Croqui e Essencial ficam de fora sem precisar de linha explícita, e um plano
-- novo nasce sem DOCX por padrão.
--
-- Note que isto NÃO usa `ferramentas`: exportar não é uma ferramenta nova, é uma
-- forma de levar embora o parecer que a matrícula já produziu. Quem não tem
-- matrícula no plano nunca chega a ter o que exportar.

-- Pelos ids fixos, nunca por nome: `name` é editável no painel e um rename de
-- vitrine não pode desligar o acesso de quem paga por ele.
UPDATE "plans"
	SET "features" = jsonb_set(COALESCE("features", '{}'::jsonb), '{docx}', 'true')
	WHERE "id" IN (
		'a1000000-0000-4000-8000-000000000002',  -- Profissional
		'a1000000-0000-4000-8000-000000000003',  -- Escritório
		'a1000000-0000-4000-8000-000000000005'   -- Enterprise
	);
