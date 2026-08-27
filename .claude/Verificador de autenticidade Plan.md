Ready for review
Select text to add comments on the plan
Verificador de autenticidade de documento — Lidimus OCR
Contexto
Hoje o Lidimus lê a matrícula e produz o relatório técnico, mas não diz nada sobre de onde aquele arquivo veio. Um PDF montado no Word, uma página trocada por outra, uma certidão vencida ou um arquivo que passou por editor online entram no pipeline exatamente como uma certidão eletrônica legítima. O parecer sai igual, e a responsabilidade fica com quem confiou nele.

O que já existe é a integridade (completude): o portão determinístico em lidimus-Juridico.json que detecta matrícula lida pela metade. É outra coisa. O que falta é autenticidade / cadeia de custódia: este arquivo é o que o cartório emitiu, ou alguém mexeu nele no caminho?

A hipótese inicial era confrontar data de criação × data de modificação. As seis matrículas em tmp/ mostram que essa regra sozinha não pega nada — e ao investigar por quê apareceu um caminho muito mais forte, descrito abaixo.

O que as amostras provam
Extração direta do /Info de cada arquivo (tmp/):

Arquivo	CreationDate	ModDate	Producer	Páginas	Assinatura
matricula Cowboy.pdf	ausente	2026-06-08 19:38:35	iLovePDF	3	não
matricula Cowboy3.pdf	ausente	2026-06-08 19:54:19	iLovePDF	4	não
matricula Mairinque.pdf	2025-10-13 13:22:11	= igual	GPL Ghostscript 9.06 / Acrobat 25.1	23	não (flatten)
Matricula_229.216.pdf	2025-10-17 11:55:24	= igual	Microsoft: Print To PDF	7	não
MATRICULA_61601.pdf	2025-10-13 14:00:32	= igual	Microsoft: Print To PDF	2	não
C:\tmp\matricula.pdf	—	—	—	—	sem xref/trailer/%%EOF: truncado
Três conclusões que definem o desenho:

CreationDate ≠ ModDate não é o sinal. Em 4 dos 5 arquivos válidos as duas datas são idênticas ao segundo — porque foram gerados de uma vez por uma impressora virtual. A regra pega zero. O sinal real nas duas Cowboy é o inverso: ModDate presente e CreationDate ausente, assinatura clássica de arquivo que passou por editor online (o iLovePDF reescreve o /Info e não repõe a data de criação). E as duas Cowboy são o mesmo documento reprocessado com 16 minutos de diferença e contagem de páginas diferente (3 e 4) — exatamente o que uma página inserida ou removida produz.
Nenhuma assinatura digital sobrevive. Zero /Type /Sig, zero ByteRange nas seis. Todas chegam reimpressas, escaneadas ou achatadas. Um verificador que dependa de PAdES vivo responderia "não verificável" em 100% dos casos reais.
Mas a âncora registral sobrevive à reimpressão. A matricula Mairinque.pdf perdeu a assinatura no Ghostscript e mesmo assim carrega, legível, https://assinador-web.onr.org.br/docs/FT8Y4-MP5ZW-347UB-ULSG2. Esse código é a chave de tudo (ver §4).
Detalhe operacional: 5 das 6 são imagem pura — pdftotext devolve 0 caracteres. Só a Mairinque tem camada de texto (o carimbo que a ONR sobrepôs). Portanto a extração de códigos tem de rodar sobre o texto_ocr, não sobre a camada de texto do PDF.

Arquitetura
Um pacote novo packages/autenticidade (espelhando packages/revisao: TS puro, vitest, exports: ./src/index.ts), consumido em três pontos. Nada disso bloqueia upload — decisão fechada: só reporta, nunca recusa.

upload  → criarAnaliseMatricula.ts   → perícia barata do buffer (§1) → inputMeta.autenticidade
worker  → matricula-ocr.worker.ts    → perícia completa + QR (§3) + ONR (§4) → stage_data.autenticidade
n8n     → lidimus-OCR "Extrair Âncoras" → regex de selo/CNM sobre texto_ocr (§2) → result.ancoras
callback→ n8n-callback.post.ts       → funde as três metades, resolve ONR pendente, calcula veredito
O ponto de encontro é o callback: é o único lugar onde a perícia do arquivo, as âncoras do OCR e a resposta da ONR existem ao mesmo tempo. É lá que o veredito final é gravado.

§1 — Perícia do arquivo (src/arquivo.ts)
analisarPdf(buffer): PericiaArquivo. Sem rede, sem dependência, sobre buffer.toString('latin1') — mesmo approach de pdfPages.ts, cujo countPdfPages deve ser reaproveitado em vez de recontar.

Extrair: versão do header; /Info (CreationDate, ModDate, Producer, Creator, Author, Title) com decodificação de literal (...), hex <...> e UTF-16BE com BOM; XMP (xmp:CreateDate, xmp:ModifyDate, xmp:CreatorTool, xmpMM:DocumentID/InstanceID); contagens de %%EOF, startxref, /Prev, /Type /Sig, ByteRange, /AcroForm, /Encrypt, /Subtype /Image, /Type /Font; e o sha256 do arquivo.

O parser de /Info do nó Check PDF Metadata em [n8n/PDF Report Analyzer.json](n8n/PDF Report Analyzer.json) já faz metade disso (findInfoBlock, extractPDFValue, decodePDFLiteral, decodeUtf16IfBom, parsePDFDate, TOOL_SIGS) — portar de lá em vez de reescrever.

Indícios, cada um com código, peso e evidência:

Código	Regra	Peso
arquivo_truncado	sem startxref / %%EOF / trailer	alto
mod_antes_da_criacao	ModDate < CreationDate	alto
criacao_ausente	ModDate presente, CreationDate ausente — caso iLovePDF	alto
xmp_diverge_do_info	xmp:ModifyDate ≠ /ModDate (editor que atualizou só um dos dois)	alto
produtor_editor	Producer/Creator em blocklist de edição: iLovePDF, Smallpdf, PDF24, Sejda, Foxit Editor, Nitro, PDFescape, Canva, LibreOffice, Word, pikepdf, PyPDF, reportlab	alto
updates_incrementais	/Prev presente ou %%EOF > 1 — mecanismo clássico de editar PDF já assinado	alto
assinatura_nao_cobre_o_arquivo	ByteRange não termina no fim do arquivo	alto
paginas_heterogeneas	dimensão/rotação divergentes entre páginas (pdfinfo -f n -l n, já usado em recorte.ts) — página inserida	alto
produtor_rerender	Ghostscript, Microsoft Print To PDF, CutePDF, Acrobat por cima — perda de garantia, não adulteração	médio
datas_divergentes	|Mod − Creation| > 60s	médio
data_futura	qualquer data à frente de hoje	médio
sem_assinatura_digital	nenhum /Type /Sig	informativo
O sha256 também habilita um sinal que só aparece com o tempo: o mesmo arquivo enviado antes sob outro número de matrícula. Por isso ele vai para coluna, não para JSON (§6).

Nota de calibragem obrigatória: produtor_rerender e sem_assinatura_digital descrevem a maioria das matrículas legítimas. Não podem, sozinhos, produzir nível alto — senão o verificador vira ruído e o usuário aprende a ignorá-lo.

§2 — Âncoras registrais: Selo TJSP e CNM (src/ancoras.ts, src/luhn.ts, src/iso7064.ts)
Esta é a parte que responde diretamente à pergunta do enunciado. Selo e CNM não são decoração: os dois são autoverificáveis offline, sem rede, porque carregam dígito verificador.

Selo Digital TJSP
Pela Especificação de Requisitos do Selo Digital (Provimento CG 30/2018), §4.4–4.5, o selo tem 25 posições alfanuméricas em 6 campos:

1 4 5 5 7 3 | 3 | R2 | 0000000012345 | 25 | K
   CNS(6)     Nat  Ato    Info(13)      Ano  DV
Campo 1 — CNS (6): identifica a serventia. Tem de bater com o cartório que o OCR leu no cabeçalho.
Campo 2 — Natureza (1): 1 Notas, 2 Civil, 3 Imóveis, 4 RTD/PJ, 5 Protesto. Numa matrícula, qualquer valor ≠ 3 é incoerência grave.
Campo 3 — Ato (2), Campo 4 — Informações do ato (13), Campo 5 — Ano (2): o ano tem de ser coerente com a data de emissão da certidão.
Campo 6 — DV (1): Luhn mod N com N=36, alfabeto 0-9A-Z mapeado para 0–35, conforme a nota de rodapé da própria especificação.
Vetor de teste já conferido contra o exemplo da spec (§4.9): 9999991CE0000000000030184 → DV calculado 4, DV impresso 4. ✔ (O exemplo do §9.2, 1234561AB123456789012319Z, é placeholder e não fecha — não usar como fixture.)

O que isso entrega: um selo inventado à mão tem ~1/36 de chance de fechar o DV. Um selo real que não bate no CNS com o cartório do cabeçalho denuncia selo copiado de outro documento. É verificação forte, custo zero, sem rede.

O que não dá para automatizar: a consulta cidadã em https://selodigital.tjsp.jus.br tem captcha e não expõe API pública (as APIs em api.tjsp.jus.br/selodigital são autenticadas, só para serventias). Então o produto entrega o link pronto para o usuário conferir com um clique, e o Lidimus se limita à validação estrutural — que já é a parte que ninguém faz a olho.

CNM — Código Nacional de Matrícula
Pelo Provimento CNJ 89/2019, o CNM tem 15 dígitos em 4 campos, CCCCC.L.NNNNNNN-DD:

CCCCC (5): os 5 dígitos significativos do CNS da serventia.
L (1): 2 = Livro 2, Registro Geral. Numa matrícula é sempre 2.
NNNNNNN (7): o número de ordem da matrícula — tem de ser igual ao número da matrícula lida no cabeçalho. Esse confronto é o mais valioso dos dois: pega o caso de alguém colar o cabeçalho de uma matrícula em cima do corpo de outra.
DD (2): dígitos verificadores por ISO 7064, MOD 97-10.
Os três checks (DV fecha, L == 2, `NNNNNNN == nº da matrícula) são independentes e baratos, e o CNS do CNM tem de bater com o CNS do selo e com o da ONR. Três fontes concordando é uma coisa; qualquer divergência entre elas é indício forte.

DV como corretor de OCR
Selo com 25 caracteres alfanuméricos lidos de um scan erra. Em vez de descartar, gerar variantes sobre as confusões canônicas (O↔0, I↔1, S↔5, B↔8, Z↔2, G↔6) com no máximo 2 substituições e aceitar a primeira que fecha o DV, marcando corrigido_por_dv: true. O dígito verificador vira, de graça, o corretor de leitura do próprio código — mesma ideia do corretor que já existe no pipeline.

Regexes rodam sobre texto_ocr (as amostras são scans), com fallback para a camada de texto quando houver.

§3 — QR Code (src/qr.ts)
O QR do selo TJSP é imune a erro de OCR e carrega mais do que o selo. Pela spec §4.8–4.9, o conteúdo é:

https://selodigital.tjsp.jus.br?r=<selo25>|<valorTotal>|<iss>|<assinaturaRSA base64>
com os parâmetros em URL-encoding (RFC 3986) desde 14/01/2019. A assinatura é a mesma do registro do ato, feita com o certificado A1/A3 da serventia. Não temos a chave pública para verificá-la localmente, mas ela é o que faz o link do TJSP abrir os dados do ato direto, sem captcha — então extrair o QR não é só ler o selo com precisão, é entregar ao usuário um link que confere de verdade.

Implementação: pdftoppm -png -r 300 -f N -l N -singlefile (poppler já está no Dockerfile do worker) → pngjs → jsqr. Duas dependências puro-JS, sem build nativo. Renderizar apenas primeira, segunda e última página, parando no primeiro QR encontrado, com timeout — igual ao padrão de recorte.ts. Falha nunca derruba o job.

Quando o QR resolve, ele é fonte primária do selo e o OCR vira conferência.

§4 — Consulta ONR (src/onr.ts) — a verificação mais forte disponível
Investigando o link da matricula Mairinque.pdf apareceu o endpoint público que a SPA do assinador ONR usa:

GET https://assinador-web.onr.org.br/api/document-keys/public/FT8Y4-MP5ZW-347UB-ULSG2
Sem autenticação. Resposta verificada nesta sessão, para aquele documento:

document.metadata.cartorio  = "OFICIAL DE REGISTRO DE IMÓVEIS DA COMARCA DE MAIRINQUE - SP"
document.metadata.cns       = "145573"
document.metadata.validade  = "2025-11-12"
signers[0].signingTime      = 2025-10-13T13:10:34Z
signers[0].certificate      = ICP-Brasil A3, AC Certisign RFB G5, titular identificado
signers[0].signaturePolicy  = PA_PAdES_AD_RT_v1_0  (com carimbo do tempo RFC 3161 e LTV)
signers[0].validationResults= { errors: [], warnings: [] }
document.originalFile       = { name, length, url com access_ticket temporário }
availableUntil              = 2026-10-13
Isto é um oráculo de autenticidade. Confrontos que passam a ser possíveis, todos automáticos:

cartório da ONR × cartório lido pelo OCR no cabeçalho — divergência significa documento montado com cabeçalho de outra serventia.
CNS da ONR × CNS do selo TJSP × CNS do CNM — três fontes independentes que têm de coincidir.
validade × data de hoje — no caso da Mairinque, a certidão venceu em 12/11/2025. Isso não é adulteração, é informação de altíssimo valor prático para o parecer, e hoje ninguém no fluxo percebe.
signingTime × ModDate do arquivo — a Mairinque foi assinada às 13:10 UTC e o /Info marca Ghostscript às 16:22 UTC. Prova documental de que o arquivo em mãos é uma re-renderização feita 1h12 depois da assinatura, não o original assinado. É precisamente o confronto de datas do enunciado, só que com a data de referência vindo de fora do arquivo — e por isso não falsificável editando o /Info.
originalFile.length / contagem de páginas × o arquivo enviado — divergência de página é indício direto.
Cuidados de implementação, não negociáveis:

É API interna e não documentada de um SPA Angular. Pode mudar sem aviso. Timeout de 5s, 1 retry, User-Agent identificando o Lidimus, feature flag AUTENTICIDADE_ONR_ENABLED, e qualquer falha vira verificacao_indisponivel, nunca erro de job. Um teste de contrato semanal contra o código de exemplo avisa quando o formato mudar.
Privacidade: a resposta traz CPF mascarado, data de nascimento e RG do signatário. Persistir apenas cartorio, cns, validade, signingTime, nome do signatário e o resultado da validação. Nunca gravar CPF/RG/nascimento, a assinatura base64 nem o originalFile.url (é credencial temporária). Conferir também que semTelemetria.ts não deixe passar o que não deve.
Cache por código (a resposta é imutável até availableUntil), para não repetir chamada em reenvio do mesmo documento.
Fica registrado para depois, fora do escopo agora: existe também POST /api/documents/validation (validação por arquivo) e uma "file validation API" da ONR sob assinatura — o caminho natural se um dia quisermos verificar sem depender do código impresso.

§5 — Veredito (src/veredito.ts)
Classificação única, escolhida como a pior categoria atingida, mais score 0–100 e lista de indícios:

Classificação	Quando
original_assinado	PAdES íntegro cobrindo o arquivo, ou ONR confirma e o arquivo confere
copia_verificavel	sem assinatura viva, mas âncora (ONR/selo/CNM) válida e coerente — o melhor caso realista
reimpresso	Ghostscript / Print To PDF / Acrobat por cima: perda de garantia, não adulteração
copia_sem_ancora	digitalização sem nenhum código verificável
editado	passou por editor ou tem updates incrementais
indicios_de_adulteracao	mod < criação, XMP divergente, assinatura quebrada, ou âncora que não fecha (DV, CNS, cartório, nº da matrícula)
arquivo_danificado	truncado / xref ilegível
Aplicado às amostras, o resultado esperado é: Cowboy e Cowboy3 → editado; Mairinque → copia_verificavel com aviso de certidão vencida e nota de re-renderização pós-assinatura; 229.216 e 61601 → reimpresso/copia_sem_ancora; C:\tmp\matricula.pdf → arquivo_danificado.

Texto ao cliente: seguir a nomenclatura já firmada — "relatório técnico", nunca "parecer jurídico" — e afirmar explicitamente que ausência de indício não atesta veracidade, na linha do que TermosTexto.vue já diz.

Cuidado de nomenclatura: integridade já significa duas coisas no código (completude da matrícula; varredura de prompt injection em pages/injection/[id].vue). O termo novo é autenticidade.

§6 — Superfície a alterar
Pacote novo — packages/autenticidade/ copiando a estrutura de packages/revisao: index.ts, tipos.ts, arquivo.ts, ancoras.ts, luhn.ts, iso7064.ts, qr.ts, onr.ts, veredito.ts, fixtures.ts + um *.test.ts por módulo.

Banco — migration 0025_autenticidade (fluxo do docs/30-banco-de-dados.md: editar schema.ts → pnpm db:generate → renomear para slug em português → revisar SQL → pnpm sandbox:migrate → pnpm db:migrate): apenas job_files.sha256 text e job_files.size_bytes integer. Todo o resto vai em jobs.stage_data.autenticidade, sem migration, seguindo o padrão de revisao e _usage.

Servidor — criarAnaliseMatricula.ts: chamar analisarPdf(a.arquivo) junto do countPdfPages já existente (o buffer está em memória, custo desprezível) e guardar em inputMeta.autenticidade. Mesmo enxerto em injection/index.post.ts e croqui/index.post.ts.

Worker — matricula-ocr.worker.ts: baixar do GCS (padrão de matricula-revisao.worker.ts, o único que já toca o binário), rodar perícia completa + QR + pdfinfo por página, gravar em stage_data.autenticidade e passar as âncoras no payload do n8n.

n8n — nó Code novo "Extrair Âncoras" em lidimus-OCR.json, entre Normalizar Texto e Callback OCR, com onError ligado no Montar Erro como os vizinhos; devolve result.ancoras. Atenção: scripts/n8n-publicar.mjs só faz patch de parameters de nó existente — criar nó novo exige n8n_update_partial_workflow (MCP) ou PUT do workflow inteiro. Rodar pnpm n8n:diff antes e depois.

Callback — n8n-callback.post.ts: fundir as três metades, disparar a consulta ONR se o código só apareceu no OCR, calcular o veredito e gravar.

UI — componente BlocoAutenticidade.vue (reutilizável entre matrícula e croqui), montado em pages/matriculas/[id].vue como <section class="secao" aria-labelledby="sec-autenticidade"> logo após o BlocoCarimbo/faixa-incompleta e antes de sec-imovel — mesmo argumento de ordem que a faixa de matrícula incompleta usa: aviso antes do dado. Reaproveitar ld-selo e riscoInfo() de useJobApresentacao.ts para o selo e o badge da listagem. Incluir os links de conferência (selodigital.tjsp.jus.br?r=…, assinador-web.onr.org.br/docs/…).

DOCX — secaoAutenticidade(doc) no array de corpoDoParecer() em packages/docx/src/parecer.ts, com fixture e teste, espelhando secaoIncompleta.

Verificação
Unitário (pnpm --filter @lidimus/autenticidade test):
Luhn mod 36 contra o vetor da spec 9999991CE0000000000030184 → 4.
ISO 7064 MOD 97-10 contra um CNM real.
analisarPdf contra fixtures derivadas das seis amostras. Gravar só os metadados extraídos, não os PDFs — são matrículas reais com dado pessoal. Asserções: Cowboy → editado por criacao_ausente + produtor_editor; Mairinque → produtor_rerender; C:\tmp\matricula.pdf → arquivo_truncado.
Parser da ONR contra o JSON do FT8Y4-… salvo como fixture, com fetch mockado; mais um teste que falha se o parser começar a persistir CPF/RG.
Corretor por DV: injetar O/0, I/1 num selo válido e conferir que volta corrigido.
Sandbox — pnpm sandbox:up (obrigatório após mexer em código do lidimus-saas), subir matricula Mairinque.pdf em localhost:3100 com a conta qa.visual@sandbox.local e conferir no bloco: copia_verificavel, cartório de Mairinque batendo com o cabeçalho, aviso de certidão vencida em 12/11/2025 e a nota de re-renderização 1h12 após a assinatura. Depois subir matricula Cowboy3.pdf e conferir editado.
Regressão — subir as duas Print-To-PDF e confirmar que caem em reimpresso, nível baixo, sem alarme. Se elas acenderem alerta, a calibragem está errada e o recurso vira ruído.
DOCX — exportar o parecer da Mairinque e conferir a seção nova.
n8n — pnpm n8n:diff limpo depois de publicar; uma execução real conferida no histórico.
Fora de escopo
Verificação criptográfica PAdES local (parse de /ByteRange + PKCS#7 + cadeia ICP-Brasil): nenhuma das amostras se beneficia hoje, e o ITI não expõe API REST pública para isso — o caminho seria portar o verificador open source deles. Registrar como próximo passo, junto com a POST /api/documents/validation da ONR.