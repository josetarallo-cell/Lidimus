-- Plano Enterprise, o quinto da tabela do relatório de precificação (§2).
--
-- Ele existe no banco por um motivo prático: sem uma linha em `plans`, um
-- cliente Enterprise não tem `max_users` nem `features.ferramentas`, e cairia no
-- piso de quem não assina nada — um contrato de seis dígitos com acesso de
-- plano gratuito.
--
-- Preço zero é literal: Enterprise não tem preço de tabela, é negociado. Por
-- isso `features.sobContrato` — o checkout e a troca de plano recusam planos com
-- essa marca, e a vitrine mostra "Fale com o comercial" no lugar do valor. Sem
-- essa trava, bastaria enviar este `planId` para o checkout e sair com uma
-- assinatura de R$ 0,00 e a franquia inteira.
--
-- Os números abaixo são o contrato-padrão, ponto de partida da negociação:
-- 50 usuários e 40.000 créditos/mês (≈2,5× o Escritório). Contrato maior é
-- ajustado na própria linha da organização — créditos por ajuste administrativo,
-- e teto de usuários editando este plano ou criando outro.
INSERT INTO "plans" ("id", "name", "monthly_price_cents", "annual_price_cents", "credits_per_cycle", "max_users", "features")
VALUES (
	'a1000000-0000-4000-8000-000000000005',
	'Enterprise',
	0,
	0,
	40000,
	50,
	'{"resumo": "Volume sob contrato, SSO, integração dedicada e jurídico de plantão.", "specs": ["Volume de matrículas sob contrato", "Croquis sob contrato", "Usuários sob contrato", "SSO, API e integração dedicada"], "ferramentas": ["matricula", "croqui", "kml", "injection"], "destaque": false, "sobContrato": true}'
)
ON CONFLICT ("id") DO UPDATE SET
	"name" = EXCLUDED."name",
	"credits_per_cycle" = EXCLUDED."credits_per_cycle",
	"max_users" = EXCLUDED."max_users",
	"features" = EXCLUDED."features";
