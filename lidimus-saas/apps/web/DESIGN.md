---
name: Lidimus
description: Inteligência documental jurídica e técnica — o documento oficial da era digital
colors:
  verde-registro: "#0C5C3C"
  verde-profundo: "#00482A"
  verde-selo: "#E4F3EA"
  tinta: "#171C19"
  tinta-suave: "#4E5852"
  papel: "#F8FBF9"
  bancada: "#F1F4F2"
  filete: "#D3D9D6"
  carimbo: "#C92F33"
  carimbo-tinta: "#A51E24"
  carimbo-selo: "#FFEDEB"
  ocre-aviso: "#8A5F18"
  ocre-selo: "#FAF1DF"
  verde-traco: "#8FC3A8"
  verde-suave-escuro: "#BFD9CC"
  verde-claro-escuro: "#D3E8DC"
  cinza-rodape: "#B5BCB8"
typography:
  display:
    fontFamily: "Besley, Georgia, serif"
    fontSize: "clamp(2.25rem, 5vw, 4rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Besley, Georgia, serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
  doc-id:
    fontFamily: "Fragment Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  xs: "2px"
  sm: "4px"
  md: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  2xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.verde-registro}"
    textColor: "{colors.papel}"
    rounded: "{rounded.sm}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.verde-profundo}"
    textColor: "{colors.papel}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.tinta}"
    rounded: "{rounded.sm}"
    padding: "11px 24px"
  input:
    backgroundColor: "#FFFFFF"
    textColor: "{colors.tinta}"
    rounded: "{rounded.sm}"
    padding: "12px 14px"
  badge-risco:
    backgroundColor: "{colors.carimbo-selo}"
    textColor: "{colors.carimbo-tinta}"
    rounded: "{rounded.xs}"
    padding: "4px 10px"
  badge-aviso:
    backgroundColor: "{colors.ocre-selo}"
    textColor: "{colors.ocre-aviso}"
    rounded: "{rounded.xs}"
    padding: "4px 10px"
  badge-ok:
    backgroundColor: "{colors.verde-selo}"
    textColor: "{colors.verde-profundo}"
    rounded: "{rounded.xs}"
    padding: "4px 10px"
---

# Design System: Lidimus

## 1. Overview

**Creative North Star: "A Prancha Viva"**

O Lidimus é o documento oficial da era digital. A identidade vem do objeto físico do ofício — a certidão, o selo, o carimbo, a prancha de engenharia com seu bloco de identificação — reinterpretado de forma contemporânea, nunca nostálgica. Cada tela de relatório é tratada como uma prancha: papel claro, filetes finos e precisos, um bloco-carimbo com número, data e responsável. A confiança nasce da linguagem gráfica que advogados, engenheiros e cartórios já reconhecem como oficial.

A personalidade é **sóbria, premium e discreta**: a autoridade silenciosa de uma banca de elite, não o barulho de uma startup. O sistema rejeita explicitamente (do PRODUCT.md): a **ferramenta técnica intimidadora** (terminal, densidade hostil, jargão de máquina) e o **legaltech corporativo frio** (azul-marinho institucional, stock photos, tom impessoal). Rejeita também a própria identidade-rascunho anterior: o fundo creme-pergaminho, as fontes IBM Plex e a gramática de eyebrows numerados são proibidos.

**Key Characteristics:**
- Tema claro, papel neutro tingido ao verde da marca (nunca ao creme)
- Verde-registro como cor de marca: Committed na landing (30–60% da superfície), Restrained no app (≤10%)
- Vermelho-carimbo com significado semântico exclusivo: risco jurídico
- Filetes de 1px e blocos de identificação como gramática estrutural
- Cantos discretos (2–8px): retangular como um documento, nunca pill
- Denso o suficiente para trabalho, legível o suficiente para imprimir

## 2. Colors: A Paleta do Registro

Verde de papel de segurança e livro-razão, tinta quase-preta, e o vermelho da almofada de carimbo — cada cor vem de um objeto real do ofício.

### Primary
- **Verde-registro** (#0C5C3C · canônico `oklch(0.42 0.09 160)`): a cor da marca. Ações primárias, seleção ativa, links, o losango-vértice. Na landing pode carregar seções inteiras; no app aparece em ≤10% de qualquer tela. Contraste 7.72:1 sobre papel — vale para texto.
- **Verde-profundo** (#00482A · `oklch(0.35 0.09 160)`): estado hover/active do verde-registro.
- **Verde-selo** (#E4F3EA · `oklch(0.95 0.02 160)`): fundo de linha selecionada, badge de sucesso, destaques calmos.

### Secondary
- **Vermelho-carimbo** (#C92F33 · `oklch(0.55 0.19 25)`): exclusivamente risco jurídico — ônus, penhoras, indisponibilidades, erros de sistema. 5.12:1 sobre papel.
- **Carimbo-tinta** (#A51E24 · `oklch(0.47 0.17 25)`): texto sobre fundo carimbo-selo (6.60:1).
- **Carimbo-selo** (#FFEDEB · `oklch(0.96 0.02 25)`): fundo de callout/badge de risco.

### Tertiary
- **Ocre-aviso** (#8A5F18 · `oklch(0.52 0.1 75)`): avisos intermediários — cláusulas que merecem atenção sem serem impeditivas. 5.02:1 sobre ocre-selo. Herdeiro dessaturado do âmbar antigo.
- **Ocre-selo** (#FAF1DF · `oklch(0.96 0.025 85)`): fundo de badge/callout de aviso.

### Neutral
- **Tinta** (#171C19 · `oklch(0.22 0.01 160)`): todo o texto principal. 16.57:1 sobre papel.
- **Tinta-suave** (#4E5852 · `oklch(0.45 0.015 160)`): texto secundário, metadados, placeholders. 7.09:1 — nunca mais claro que isso.
- **Papel** (#F8FBF9 · `oklch(0.985 0.003 160)`): fundo do corpo. Off-white tingido ao verde da marca, não ao creme.
- **Bancada** (#F1F4F2 · `oklch(0.965 0.005 160)`): segunda camada neutra — sidebars, cabeçalhos de tabela, painéis.
- **Filete** (#D3D9D6 · `oklch(0.88 0.008 160)`): bordas de 1px, réguas de tabela, molduras de prancha.

### Sobre superfícies escuras (verde-profundo e tinta)
Rampa inversa para texto e grafismo sobre fundos escuros — landing (seções verde-profundo, rodapé), croqui/mapa do memorial:
- **Verde-traço** (#8FC3A8): traços de polígono, marcadores de vértice e rótulos mono do croqui/mapa sobre verde-profundo.
- **Verde-suave-escuro** (#BFD9CC): texto de apoio sobre verde-profundo.
- **Verde-claro-escuro** (#D3E8DC): texto destacado sobre verde-profundo (parágrafo do CTA final).
- **Cinza-rodapé** (#B5BCB8): texto e links secundários sobre tinta (rodapé da landing).

### Named Rules
**A Regra do Carimbo.** O vermelho aparece somente onde existe risco jurídico real ou falha. Nunca decorativo, nunca em ícones neutros, nunca em contadores. Sua raridade É o alarme: se uma tela tem três vermelhos, dois estão errados.

**A Regra do Papel Limpo.** O fundo do corpo é sempre papel (#F8FBF9). A faixa creme/pergaminho (OKLCH L 0.84–0.97 com matiz 40–100) é proibida em qualquer superfície — foi o vício da identidade anterior.

## 3. Typography

**Display Font:** Besley (com Georgia, serif)
**Body Font:** Hanken Grotesk (com system-ui, sans-serif)
**Label/Mono Font:** Fragment Mono (com ui-monospace, monospace) — uso restrito

**Character:** Besley é um revival de Clarendon — a letra da imprensa oficial, do carimbo e do livro de registro — e dá gravidade documental aos títulos. Hanken Grotesk é a grotesca humanista discreta que carrega a UI sem chamar atenção. O par contrasta em eixo (slab-serif × grotesca), nunca compete.

### Hierarchy
- **Display** (600, clamp(2.25rem, 5vw, 4rem), 1.08): heros da landing apenas. Nunca dentro do app.
- **Headline** (600, 1.75rem, 1.2): título de página e de relatório ("Matrícula nº 48.221"). Besley.
- **Title** (600, 1.125rem, 1.35): cabeçalhos de seção e de painel. Hanken Grotesk.
- **Body** (400, 1rem, 1.6): texto corrido, máximo 72ch. Hanken Grotesk.
- **Label** (500, 0.8125rem, 1.4): rótulos de formulário, cabeçalhos de tabela, botões pequenos. Caixa normal — uppercase apenas no bloco-carimbo.
- **Doc-id** (400, 0.8125rem, tabular): Fragment Mono para identificadores documentais — nº de matrícula, protocolo, coordenadas UTM, hash.

### Named Rules
**A Regra do Numerador.** Fragment Mono aparece apenas em identificadores que um profissional conferiria dígito a dígito (matrícula, protocolo, coordenada, hash). Mono em rótulos, eyebrows ou navegação é proibido — é o figurino de "ferramenta técnica" que o PRODUCT.md veta.

**A Regra da Escala Fixa.** No app, tamanhos em rem fixos (ratio ~1.2); clamp() fluido existe só na landing. Um h1 que encolhe dentro de um painel é bug, não responsividade.

## 4. Elevation

Plano por padrão, como papel sobre a mesa. A profundidade vem de filetes de 1px e da camada tonal bancada-sobre-papel, não de sombras. Sombra existe apenas quando um elemento realmente flutua acima do documento: dropdown, modal, toast.

### Shadow Vocabulary
- **Flutuante** (`box-shadow: 0 4px 16px -4px rgba(23, 28, 25, 0.16)`): dropdowns, popovers, date-pickers.
- **Sobreposto** (`box-shadow: 0 24px 48px -16px rgba(23, 28, 25, 0.28)`): modais e painéis laterais, sempre com backdrop `rgba(23, 28, 25, 0.5)`.

### Named Rules
**A Regra do Papel Sobre a Mesa.** Superfícies em repouso são planas com filete de 1px. Se um card estático tem sombra, a sombra está errada.

## 5. Components

A gramática compartilhada: cantos retos-discretos (2–8px), filetes de 1px, estados completos (default, hover, focus, active, disabled, loading, error). Botão pill é proibido — documento não tem cantos redondos.

### Buttons
- **Shape:** cantos discretos (4px), altura 44px, padding 12px 24px, Hanken Grotesk 600 0.9375rem.
- **Primary:** verde-registro (#0C5C3C) com texto papel; hover verde-profundo (#00482A); focus-visible com anel `outline: 2px solid #0C5C3C; outline-offset: 2px`.
- **Secondary:** transparente com borda 1px tinta (#171C19); hover preenche tinta com texto papel.
- **Destructive:** carimbo (#C92F33) apenas para ações que destroem dados; hover carimbo-tinta.
- **Disabled:** bancada (#F1F4F2) com texto tinta-suave a 60%; cursor not-allowed.
- **Loading:** spinner de 16px no lugar do label, largura travada para não saltar.

### Chips / Badges de status
- **Style:** selo retangular (2px), padding 4px 10px, Label 500, sem borda.
- **Estados de análise:** processando = bancada + tinta-suave; concluído = verde-selo + verde-profundo; risco/erro = carimbo-selo + carimbo-tinta; aviso = ocre-selo + ocre-aviso.

### Cards / Containers
- **Corner Style:** 8px em painéis, 4px em elementos internos.
- **Background:** papel para conteúdo, bancada para áreas de apoio (nunca card dentro de card).
- **Shadow Strategy:** nenhuma em repouso (Regra do Papel Sobre a Mesa).
- **Border:** filete 1px (#D3D9D6) sempre presente — a moldura é a identidade.
- **Internal Padding:** 24px (lg); 16px (md) em densidade de tabela.

### Inputs / Fields
- **Style:** fundo branco (#FFFFFF), borda 1px filete, 4px de raio, padding 12px 14px, texto tinta.
- **Placeholder:** tinta-suave (#4E5852) — 7:1, nunca cinza-claro.
- **Focus:** borda verde-registro + anel `box-shadow: 0 0 0 3px #E4F3EA`.
- **Error:** borda carimbo (#C92F33) + mensagem em carimbo-tinta abaixo, nunca só cor.
- **Disabled:** fundo bancada, texto tinta-suave.

### Navigation
- **App:** barra superior em papel com filete inferior; links em tinta-suave, ativo em tinta com sublinhado de 2px verde-registro; foco visível sempre. Mobile: colapsa em menu de painel lateral (sobreposto).
- **Landing:** mesma barra, logo com losango-vértice à esquerda, CTA primary à direita.

### Bloco-Carimbo (componente-assinatura)
O rodapé/cabeçalho de identificação de todo relatório, herdado da legenda de prancha técnica: moldura de filete 1px dividida em células — losango-vértice, "LIDIMUS", tipo de análise, nº do documento em Fragment Mono, data e hora, status. Labels em uppercase 0.6875rem tracking 0.08em (o único uppercase permitido no sistema). É a assinatura visual do produto: aparece no relatório na tela, no PDF impresso e, em miniatura, nos cards do dashboard.

## 6. Do's and Don'ts

### Do:
- **Do** usar tinta (#171C19) para texto corrido e tinta-suave (#4E5852) como piso absoluto de contraste (7:1).
- **Do** reservar vermelho-carimbo exclusivamente a risco jurídico e falha (A Regra do Carimbo).
- **Do** emoldurar relatórios com filetes 1px e o bloco-carimbo — a prancha é a identidade.
- **Do** manter o app Restrained (verde ≤10%) e a landing Committed (verde 30–60%).
- **Do** dar a todo interativo os 7 estados: default, hover, focus, active, disabled, loading, error.
- **Do** usar skeleton em carregamento e estados vazios que ensinam o fluxo ("Envie uma certidão para gerar seu primeiro parecer").
- **Do** motion 150–250ms, ease-out, só para mudança de estado; alternativa via `prefers-reduced-motion`.

### Don't:
- **Don't** usar fundo creme/pergaminho em nenhuma superfície — a identidade anterior não é cânone (A Regra do Papel Limpo).
- **Don't** usar IBM Plex (Sans/Mono/Serif), Spectral ou Inter — fontes da identidade-rascunho e defaults de IA.
- **Don't** usar eyebrows mono uppercase acima de seções nem numeração 01/02/03 como scaffolding — a gramática antiga está morta.
- **Don't** parecer "ferramenta técnica intimidadora": mono decorativo, tema terminal, jargão de máquina (OCR, worker, fila) exposto na UI.
- **Don't** parecer "legaltech corporativo frio": azul-marinho institucional, stock photos, tom de grande consultoria.
- **Don't** usar botão pill, border-left colorido como accent, gradient text, glassmorphism ou card dentro de card.
- **Don't** usar sombra em superfície estática — profundidade é filete e camada tonal.
- **Don't** deixar o verde invadir a semântica: sucesso usa verde-selo/verde-profundo, mas gráficos e dados pedem a rampa neutra primeiro.
