---
name: Lidimus
description: Inteligência documental jurídica e técnica — o cartaz oficial da era digital
colors:
  ground: "#F3F2F2"
  surface: "#EAE9E9"
  ink: "#201E1D"
  folha: "#FFFFFF"
  accent: "#EC3013"
  accent-100: "#FFF2EF"
  accent-300: "#FFC4B8"
  accent-400: "#FF9783"
  accent-600: "#DD2B0F"
  accent-700: "#AE1800"
  accent-800: "#7C1405"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(2.6rem, 5.4vw, 4.6rem)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 2.6vw, 2.1rem)"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 800
    lineHeight: 1.1
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  condensed:
    fontFamily: "Archivo Narrow, Archivo, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.06em"
  doc-id:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  xs: "0px"
  sm: "0px"
  md: "0px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ground}"
    rounded: "{rounded.md}"
    padding: "9px 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-600}"
    textColor: "{colors.ground}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "9px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  badge-risco:
    backgroundColor: "{colors.accent-100}"
    textColor: "{colors.accent-800}"
    rounded: "{rounded.xs}"
    padding: "4px 10px"
  selo-risco:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ground}"
    rounded: "{rounded.xs}"
    padding: "4px 10px"
---

<!-- Nota de transição: este documento descreve o sistema Modernista ("O Cartaz
     Oficial"), adotado primeiro na landing (pages/index.vue, tokens --color-* no
     escopo .lp). O restante do app (dashboard, matrículas, kml, injection, conta,
     admin) ainda usa a identidade anterior "A Prancha Viva" (verde, tokens --ld-*
     em assets/css/lidimus.css) e será migrado incrementalmente para esta direção.
     Enquanto a migração não conclui, divergências apontadas pelo impeccable nessas
     telas são esperadas — medem a distância até o alvo aqui documentado. -->

# Design System: Lidimus

## 1. Overview

**Creative North Star: "O Cartaz Oficial"**

O Lidimus é o documento oficial da era digital — e o sistema veste esse papel como um **cartaz modernista**: plano, arquitetural, composto inteiramente em Archivo, um vermelho quase-mono sobre branco, uma grade modular visível, raio zero e réguas fortes de 2px. Nada flutua e nada é decorado — o alinhamento e a força dos filetes fazem toda a organização. Os rótulos ficam rentes à esquerda (inclusive dentro dos botões) e a fotografia imprime em preto e branco puro.

A autoridade nasce da estrutura, não do ornamento. A herança do ofício — a certidão, o carimbo, a legenda de prancha técnica, o número de matrícula conferido dígito a dígito — permanece, mas expressa na gramática do cartaz oficial: manchete em caixa-alta, tema em condensada, o número do documento em mono, o selo de risco em vermelho. A personalidade é **assertiva, precisa e sem ruído**: a página inteira lê como uma folha impressa de tipografia forte, onde o vermelho, raro, funciona como alarme.

O sistema rejeita explicitamente (do PRODUCT.md): a **ferramenta técnica intimidadora** (terminal, densidade hostil, jargão de máquina) e o **legaltech corporativo frio** (azul-marinho institucional, stock photos, tom impessoal). Rejeita também toda suavização: cantos arredondados, sombras difusas em repouso, filetes reduzidos a fios, rótulos centralizados e fotos coloridas.

**Key Characteristics:**
- Fundo claro neutro (ground #F3F2F2), tinta quase-preta (ink #201E1D), um único acento vermelho (#EC3013)
- Grade modular visível: células de largura igual, réguas de 2px entre seções, estrutura à mostra
- Raio 0px em tudo — retangular como uma folha impressa, nunca pill
- Tudo alinhado à esquerda: manchetes, texto e os rótulos dentro de botões largos
- Vermelho usado com parcimônia — ação primária, pequena ênfase e risco jurídico; corre como campo apenas nos "cartazes" (citação, CTA final)
- Fotografia sempre em P&B (`.grayscale`); tipografia Archivo do display ao rótulo

## 2. Colors: Vermelho quase-mono sobre branco

Um chão claro com tinta quase-preta e **um único acento**. Este é um esquema mono: não há segunda cor de marca. Cada papel carrega uma rampa tonal 100–900 gerada em OKLCH numa mesma escala perceptual de luminosidade, para que o mesmo passo de qualquer rampa tenha o mesmo peso visual. Prefira passos da rampa a `color-mix()` ad-hoc.

Tokens canônicos: `--color-*` no `styles.css` do design system. Nunca escreva um hex que o token já carrega.

### Ground / Neutros
- **Ground** (#F3F2F2 · ≈ `oklch(0.955 0.001 60)`): fundo do corpo. Off-white neutro.
- **Surface** (#EAE9E9 · ≈ `oklch(0.93 0.001 60)`): segunda camada — preenchimentos tonais, barras-fantasma, cabeçalhos.
- **Folha** (#FFFFFF): o branco puro da folha de documento sobre o ground (pranchas, cards de conteúdo, células de plano).
- **Ink** (#201E1D · ≈ `oklch(0.26 0.004 40)`): todo o texto principal e as réguas de 2px. Contraste altíssimo sobre ground.
- **Filete** (`color-mix(in srgb, var(--color-ink) 40%, transparent)`): divisores de 1px internos. As divisões estruturais entre seções são de 2px em ink cheio.
- Rampa **neutral-100 … neutral-900** para texto sobre preenchimentos, estados e chrome.

### Acento (papel único)
- **Accent** (#EC3013 · ≈ `oklch(0.60 0.23 32)`): o vermelho da marca. Ação primária, ênfase pequena, o losango-vértice e — sobretudo — **risco jurídico**. Corre como campo cheio apenas nos cartazes (citação, banner de CTA). Par acento↔ground afinado para ≥3:1: serve ícones, texto grande e chrome, **não** texto corrido.
- **Accent-100** (#FFF2EF): fundo de callout/badge de risco.
- **Accent-300** (#FFC4B8) / **Accent-400** (#FF9783): passos claros para grafismo e texto de acento sobre superfícies escuras (mapa do memorial, poster escuro).
- **Accent-600** (#DD2B0F): hover da ação primária sobre ground.
- **Accent-700** (#AE1800): texto tamanho-parágrafo em acento sobre ground (o passo que atinge contraste de leitura).
- **Accent-800** (#7C1405): texto sobre fundo accent-100 (callout de risco).
- Rampa completa **accent-100 … accent-900** (`#FFF2EF #FFE0D9 #FFC4B8 #FF9783 #FF563C #DD2B0F #AE1800 #7C1405 #4D170E`).

*(O sistema importado mantém variáveis `--color-accent-2-*` como um stand-in derivado por máquina, só para ambos os conjuntos resolverem. Trate como o mesmo papel do acento — o esquema é mono.)*

### Named Rules
**A Regra do Acento.** O vermelho aparece na ação primária, em ênfase pequena e onde há **risco jurídico real ou falha** — ônus, penhoras, indisponibilidades, erros de sistema. Numa página quase toda ink-sobre-ground, o vermelho lê naturalmente como alarme; sua raridade É o alerta. Nunca decorativo, nunca em ícones neutros, nunca em contadores. Se uma tela tem três vermelhos que não são ação nem risco, dois estão errados.

**A Regra do Preto e Branco.** Toda fotografia de conteúdo passa pelo wrapper `.grayscale` e imprime em P&B puro. Imagem colorida ou tingida é proibida — o cartaz não coloriza.

## 3. Typography

**Fonte única:** Archivo (com system-ui, sans-serif) — do display ao corpo.
**Condensada:** Archivo Narrow — rótulos, navegação, kickers e labels de botão.
**Mono:** ui-monospace / SF Mono — restrita a identificadores documentais.

**Character:** Archivo é uma grotesca de baixo contraste, geométrica e industrial — a letra do cartaz e do impresso oficial. Um só desenho carrega tudo: o peso 800 em caixa-alta dá a manchete; o 400 carrega o corpo. Archivo Narrow (condensada) marca o registro "editorial" — tema, eyebrow, rótulo — em caixa-alta com tracking. O contraste é de largura e peso dentro da mesma família, nunca de duas fontes brigando.

### Hierarchy
- **Display** (800, clamp(2.6rem, 5.4vw, 4.6rem), 0.98, -0.025em, **UPPERCASE**): heros e cartazes da landing. Nunca dentro do app.
- **Headline** (800, clamp(1.5rem, 2.6vw, 2.1rem), 1.08): título de ferramenta, de relatório e manchete de clipe.
- **Title** (800, 1.4rem, uppercase): nome de plano, título de card de documento ("Matrícula nº 48.221").
- **Body** (400, 1rem, 1.55): texto corrido, máximo ~66ch.
- **Condensed** (Archivo Narrow, 600–700, uppercase, tracking 0.06–0.14em): eyebrows, navegação, rótulos de botão, temas de seção. A classe utilitária é `.cond`.
- **Doc-id** (mono, 0.75rem, tabular): nº de matrícula, protocolo, coordenadas UTM, nome de arquivo, hash.

### Named Rules
**A Regra do Numerador.** Mono aparece apenas em identificadores que um profissional conferiria dígito a dígito (matrícula, protocolo, coordenada, arquivo, hash). Mono decorativo em corpo ou navegação é proibido — é o figurino de "ferramenta técnica" que o PRODUCT.md veta.

**A Regra do Alinhamento à Esquerda.** Manchetes, texto e os rótulos dentro de botões ficam rentes à esquerda. Um botão mais largo que seu rótulo começa o texto (e o ícone à direita) na borda de padding esquerda, nunca centralizado. Hero centralizado é bug.

**A Regra da Escala Fixa.** No app, tamanhos em rem fixos (ratio ~1.2); `clamp()` fluido existe só na landing/cartazes. Um h1 que encolhe dentro de um painel é bug, não responsividade.

## 4. Elevation: Plano, estrutura sobre sombra

A profundidade vem da **estrutura**, não da sombra. Grade modular: conteúdo em células de largura igual, ritmo horizontal e vertical forte, estrutura visível. Réguas de 2px em ink separam as seções maiores; filetes de 1px dividem células internas. As bordas organizam — não as suavize em fios nem as troque por espaço em branco.

### Shadow Vocabulary
Plano por padrão. Há dois usos de sombra, e só dois:
- **Cartaz** (`box-shadow: 12px 12px 0 var(--color-ink)` — sólida, deslocada, sem blur): a assinatura de elevação do sistema. Reservada à prancha/documento em destaque (o card do hero). É desenho, não profundidade física.
- **Flutuante** (`--shadow-sm/md/lg`, tingidas ao ink): apenas para o que de fato flutua acima da folha — dropdown, popover, modal, toast.

### Named Rules
**A Regra da Régua.** Superfícies em repouso são planas, emolduradas por régua de 2px (seções) ou filete de 1px (células). Se um card estático tem sombra difusa, a sombra está errada — a única sombra em repouso permitida é a do Cartaz (sólida, sem blur), no documento em destaque.

**A Regra do Raio Zero.** Nenhum canto é arredondado. `--radius-md` é 0px de propósito. Botão pill, card com borda macia e input com raio são proibidos.

## 5. Components

A gramática compartilhada: raio 0, réguas de 2px e filetes de 1px, rótulos à esquerda, estados temáticos completos (default, hover, focus-visible, active, disabled). Ícones: **Lucide** (https://lucide.dev). Estados vêm da rampa do acento — não os re-estilize por página.

### Buttons
- **Shape:** raio 0, padding 9px 16px (lg: 12px 22px), Archivo Narrow 700 caixa-alta, **rótulo rente à esquerda** em botões de bloco.
- **Primary:** accent (#EC3013) com texto ground; hover accent-600; active accent-700.
- **Secondary:** transparente com filete 1px; hover preenche com `color-mix(ink 7%)`.
- **Ghost:** só texto em acento; hover tinta accent-100.
- **Inverso:** sobre campo de acento (cartazes), fundo ground com texto acento.
- **Focus-visible:** `outline: 2px solid var(--color-accent); outline-offset: 2px` — nunca o anel azul padrão.
- **Disabled:** opacidade 45%, cursor not-allowed.

### Selos / Tags de status
- **Selo:** retângulo (raio 0), padding 4px 10px, condensada 700 caixa-alta.
- **Risco alto / falha:** selo em accent cheio com texto ground; callout em accent-100 + texto accent-800 + borda accent.
- **Neutro / meta:** tag-neutral (neutral-100 + neutral-800) ou tag-outline (filete de acento).

### Cards / Containers
- **Corner:** 0px sempre.
- **Background:** folha (#FFFFFF) para conteúdo, surface para áreas de apoio (nunca card dentro de card).
- **Border:** filete 1px nas células internas; régua de 2px ink nas molduras estruturais — a moldura é a identidade.
- **Shadow:** nenhuma em repouso, salvo o Cartaz (12px 12px 0 ink) no documento em destaque.
- **Padding interno:** 24px (lg); 16px (md) em densidade de tabela.

### Inputs / Fields
- **Style:** fundo surface, filete 1px, raio 0, padding 6px 10px, texto ink, caret em acento.
- **Placeholder:** neutro dessaturado — nunca cinza-claro sem contraste.
- **Focus:** borda accent + `focus-visible` de 2px acento.
- **Error:** borda accent + mensagem em accent-700 abaixo, nunca só cor.

### Navigation / Masthead
- **Masthead:** tira superior em ink com texto ground — o "cabeçalho de jornal" (registro + edição), condensada caixa-alta.
- **Barra:** logo à esquerda, navegação em condensada caixa-alta, régua inferior de 2px ink, CTA primary à direita. Links em ink; hover em acento.

### Bloco-documento (componente-assinatura)
A prancha/documento em destaque, herdeira da legenda de prancha técnica e do cabeçalho de certidão: moldura de régua 2px com sombra de Cartaz, topo dividido em células por filete — marca, "Documento", nº em mono, selo de status — e corpo com título, cartório e o callout de risco (accent-100 + accent-800). É a assinatura visual do produto: aparece no relatório na tela, no PDF impresso e, em miniatura, nos cards do dashboard.

**Implementação canônica:** `components/BlocoCarimbo.vue` (props `analise`/`documentoLabel`/`documento`/`emitido`, slot = selo). Os laudos NUNCA reimplementam o bloco localmente. Estados compartilhados vivem em `components/PranchaFalha.vue` (falha com retry) e `components/PranchaEsqueleto.vue` (skeleton). O utilitário `.sr-only` é global — não redefinir por página.

## 6. Do's and Don'ts

### Do:
- **Do** deixar a grade aparecer: células de largura igual, réguas de 2px entre seções, estrutura visível.
- **Do** manter tudo rente à esquerda — manchetes, texto e rótulos dentro de botões largos.
- **Do** usar o acento com parcimônia (ação primária, ênfase pequena, risco); deixá-lo correr como campo só nos cartazes (citação, CTA final).
- **Do** reservar o vermelho a ação, ênfase e risco jurídico/falha (A Regra do Acento).
- **Do** imprimir fotografia em P&B com `.grayscale`.
- **Do** compor tudo em Archivo (display→corpo) e Archivo Narrow (rótulos/nav/kickers); mono só em identificadores documentais.
- **Do** dar a todo interativo estados temáticos: hover e active da rampa do acento, focus-visible de 2px acento.
- **Do** usar ícones Lucide; motion 150–250ms ease-out só para mudança de estado, com alternativa via `prefers-reduced-motion`.

### Don't:
- **Don't** arredondar nenhum canto — raio é 0 de propósito (A Regra do Raio Zero).
- **Don't** centralizar rótulos de botão nem o texto do hero (A Regra do Alinhamento à Esquerda).
- **Don't** suavizar as réguas em fios nem trocá-las por espaço em branco.
- **Don't** tingir ou colorizar imagem (A Regra do Preto e Branco).
- **Don't** usar sombra difusa em superfície estática — a única sombra em repouso é o Cartaz (sólida, sem blur).
- **Don't** deixar o vermelho virar decoração: fora de ação, ênfase e risco, ele é ruído.
- **Don't** parecer "ferramenta técnica intimidadora" (mono decorativo, tema terminal, jargão de máquina) nem "legaltech corporativo frio" (azul-marinho, stock photos, tom de grande consultoria).
- **Don't** introduzir uma segunda cor de marca — o esquema é mono; o acento-2 é apenas um stand-in que resolve para o mesmo papel.
