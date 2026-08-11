// Baixa um .docx gerado pelo servidor.
//
// Não é um <a href> simples porque o arquivo leva um instante para ser montado
// (um lote monta dezenas de relatórios): sem estado de carregamento, o clique
// não devolve sinal nenhum e o usuário clica de novo. E um <a> não tem como
// mostrar o motivo quando o servidor recusa.
//
// O nome do arquivo vem do Content-Disposition — quem nomeia é o servidor, que
// é quem conhece o número da matrícula. A tela não repete essa regra.

function nomeDoCabecalho(disposition: string | null): string | null {
  if (!disposition) return null
  // filename*=UTF-8''... preserva acento; filename="..." é o resguardo
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1])
    } catch {
      /* cabeçalho malformado: cai para o filename simples */
    }
  }
  return disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? null
}

// Como a requisição pede `blob`, o corpo do ERRO também chega como Blob — e a
// mensagem do servidor ("Esta análise ainda não foi concluída") ficaria presa
// dentro dele. O status line do HTTP não serve de atalho: ele perde os acentos.
async function detalheDoErro(data: unknown): Promise<string | null> {
  if (!data) return null
  try {
    const corpo =
      typeof Blob !== 'undefined' && data instanceof Blob ? JSON.parse(await data.text()) : data
    const msg = (corpo as { statusMessage?: string; message?: string })?.statusMessage
    return typeof msg === 'string' && msg.trim() ? msg : null
  } catch {
    return null
  }
}

export function useExportarDocx(nomePadrao = 'documento.docx') {
  const gerando = ref(false)
  const erro = ref<string | null>(null)

  async function exportar(url: string) {
    if (gerando.value) return
    gerando.value = true
    erro.value = null
    let objectUrl: string | null = null
    try {
      const resposta = await $fetch.raw(url, { responseType: 'blob' })
      const blob = resposta._data as Blob
      objectUrl = URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = objectUrl
      a.download = nomeDoCabecalho(resposta.headers.get('content-disposition')) ?? nomePadrao
      a.click()
    } catch (err) {
      const e = err as { statusCode?: number; status?: number; data?: unknown }
      const status = e?.statusCode ?? e?.status
      const detalhe = await detalheDoErro(e?.data)
      erro.value =
        status && status >= 400 && status < 500 && detalhe
          ? detalhe
          : 'Não foi possível gerar o arquivo. Tente novamente em alguns instantes.'
    } finally {
      // O objeto vive só o tempo do clique; sem revogar, o blob fica preso na
      // memória da aba até a navegação.
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 0)
      gerando.value = false
    }
  }

  return { gerando, erro, exportar }
}
