# Product

## Register

product

## Users

Profissionais brasileiros que trabalham com documentos críticos e não podem errar:

- **Advogados(as)** — due diligence imobiliária, pareceres de matrícula antes de negociações.
- **Engenheiros(as) e arquitetos(as)** — memoriais descritivos, georreferenciamento, correção de matrículas antigas com descrição imprecisa.
- **Cartórios e registros de imóveis** — qualificação registral, verificação de integridade de documentos recebidos.

Contexto de uso: sessão de trabalho concentrada, geralmente em desktop, sob prazo e sob risco jurídico. Perfil de tecnicidade variado — do engenheiro fluente em GIS ao escrevente de cartório que nunca abriu um terminal. O trabalho a fazer: transformar um documento bruto (certidão de matrícula, KML, PDF suspeito) em uma conclusão profissional confiável, em minutos em vez de dias.

## Product Purpose

Lidimus é um SaaS de inteligência documental jurídica e técnica com três ferramentas:

1. **Leitor de Matrículas** — upload da certidão → parecer estruturado (cadeia dominial, ônus, gravames, penhoras, indisponibilidades, alertas de risco) com indicação do registro/averbação de origem de cada apontamento.
2. **Memorial Descritivo** — upload de KML do Google Earth → memorial técnico-jurídico pronto para o registro de imóveis (vértices, azimutes, distâncias, confrontações).
3. **Detector de Prompt Injection** — varredura de PDFs em busca de instruções ocultas (texto branco, fontes minúsculas, metadados).

Modelo de negócio: créditos por análise, planos Croqui / Essencial / Profissional / Escritório (+ Enterprise sob contrato), com análise avulsa para quem não assina — preços e franquias em docs/relatorio-precificacao.md. A conta é da organização, não da pessoa: Profissional comporta 3 usuários e Escritório 10, convidados por e-mail pelo proprietário em Conta → Equipe, compartilhando a mesma bolsa de créditos e o mesmo histórico de análises. Cada convidado entra como Membro (cria análises) ou Somente consulta, e o proprietário dá a cada um o cargo que quiser — escrevente, corretor, secretário. Planos, assinatura e compra de crédito ficam só com o proprietário. O Enterprise é negociado caso a caso: aparece na vitrine sem preço, com "Falar com o comercial" no lugar do botão de assinar, e é aplicado pelo painel admin. Sucesso = o profissional confia no relatório o suficiente para fundamentar uma decisão real (assinar um parecer, protocolar um memorial, aceitar um documento).

## Brand Personality

**Sóbrio, premium, discreto** — a autoridade silenciosa de uma banca de elite; transmite que é caro porque vale. Direção visual confirmada: **"norma técnica viva"** — a identidade nasce do objeto físico do ofício (certidão, selo, carimbo, prancha de engenharia), reinterpretado de forma contemporânea, nunca nostálgica. Voz em pt-BR profissional, direta, sem hype de IA e sem juridiquês desnecessário. O produto afirma ("Ônus identificado · Hipoteca · R.4"), não enfeita. O sistema visual completo está em DESIGN.md ("A Prancha Viva").

## Anti-references

- **Ferramenta técnica intimidadora** — visual de terminal/dev tool, densidade hostil, jargão de máquina. O escrevente de cartório precisa se sentir em casa.
- **Legaltech corporativo frio** — azul-marinho institucional, fotos de stock, tom impessoal de grande consultoria.
- A landing atual (creme/pergaminho editorial) **não é cânone** — é um rascunho a ser substituído, não um sistema a preservar.

## Design Principles

1. **O relatório é o produto.** O parecer, o memorial e o laudo de varredura são onde a confiança se ganha ou se perde. Essas telas merecem o maior investimento de craft — hierarquia impecável, rastreabilidade de cada conclusão até o registro/averbação de origem.
2. **Rigor visível, máquina invisível.** Mostrar de onde veio cada apontamento; nunca expor OCR, filas, workers ou estágios internos como jargão cru na interface.
3. **Familiaridade conquistada.** Affordances padrão, vocabulário de componentes consistente, nada de reinvenção decorativa. A ferramenta desaparece na tarefa.
4. **Desenhado para o menos técnico da sala.** Se o fluxo funciona para o escrevente do cartório, funciona para todos. Linguagem simples, estados vazios que ensinam, erros que dizem o que fazer.
5. **Uma identidade, duas superfícies.** Quando a nova identidade for definida, landing e app falam a mesma língua visual — sem o abismo atual entre landing com marca e app genérico.

## Accessibility & Inclusion

WCAG 2.1 AA: contraste ≥ 4.5:1 em texto corrido (inclusive placeholders), foco visível em todos os interativos, alternativa para `prefers-reduced-motion`, alvos de toque adequados. Interface 100% em pt-BR. Público inclui profissionais de idade e proficiência digital variadas — legibilidade acima de elegância.
