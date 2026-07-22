// Serve as skills versionadas no repositório para os workflows n8n.
// O nome "analise-juridica-completa" concatena a skill principal com o schema de
// saída e as referências do Manual de Registro de Imóveis — é o system prompt
// usado pelo workflow lidimus-Juridico.

const FILES: Record<string, string[]> = {
  'analise-juridica': ['analise-juridica.md'],
  'croqui-matricula': ['croqui-matricula.md'],
  'analise-juridica-output-schema': ['analise-juridica-output-schema.md'],
  'analise-juridica-legal-sources': ['analise-juridica-legal-sources.md'],
  'manual-registro-cheatsheet': ['manual-registro-cheatsheet.md'],
  'manual-registro-patterns': ['manual-registro-patterns.md'],
  // O manual (cheatsheet + patterns) NÃO entra aqui: já está indexado no Qdrant
  // e é recuperado pelo RAG (nós Consultas/Embeddings/Qdrant/Consolidar) só
  // quando relevante ao tipo de ato. Mantê-lo fixo aqui dobrava a carga de
  // tokens do system prompt sem ganho — o RAG passou a ser a fonte do manual.
  'analise-juridica-completa': [
    'analise-juridica.md',
    'analise-juridica-output-schema.md',
    'analise-juridica-legal-sources.md',
  ],
}

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name')?.replace(/\.md$/, '')
  const files = name ? FILES[name] : undefined
  if (!files) throw createError({ statusCode: 404, statusMessage: 'Skill not found' })

  const storage = useStorage('assets:server')
  const parts: string[] = []
  for (const file of files) {
    const content = await storage.getItem<string>(`skills/${file}`)
    if (content) parts.push(String(content))
  }

  if (!parts.length) throw createError({ statusCode: 404, statusMessage: 'Skill content missing' })

  setHeader(event, 'Content-Type', 'text/markdown; charset=utf-8')
  setHeader(event, 'Cache-Control', 'public, max-age=300')
  return parts.join('\n\n---\n\n')
})
