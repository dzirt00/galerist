// Build single-file Dashboard entrypoints from this repo's acyclic local modules.
// Runtime SDK imports remain external and pinned. Generated files are not source.
import ts from 'typescript'
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs'
import {resolve, dirname} from 'node:path'
import {createHash} from 'node:crypto'
import {createServer} from 'node:http'

const names = ['create-game', 'join-game', 'game-list', 'ready-to-game', 'get-game-players', 'change-settings-game', 'get-own-lobby']
const out = resolve('supabase/deploy/.bundles')
mkdirSync(out, {recursive: true})
const manifest = {}
for (const name of names) {
  const seen = new Set()
  const sources = []
  function visit(file) {
    file = resolve(file)
    if (seen.has(file)) return
    seen.add(file)
    const source = readFileSync(file, 'utf8')
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
    const edits = []
    for (const node of ast.statements) {
      if (ts.isImportDeclaration(node)) {
        const specifier = node.moduleSpecifier.text
        if (specifier.startsWith('.')) visit(resolve(dirname(file), specifier))
        else if (!['@supabase/supabase-js', '@supabase/supabase-js/cors'].includes(specifier)) throw new Error('Unexpected external import: ' + specifier)
        edits.push([node.getStart(ast), node.end, ''])
      }
      for (const modifier of node.modifiers ?? []) {
        if (modifier.kind === ts.SyntaxKind.ExportKeyword) edits.push([modifier.getStart(ast), modifier.end, ''])
        if (modifier.kind === ts.SyntaxKind.DefaultKeyword) throw new Error('Default exports are not supported')
      }
    }
    let text = source
    for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) text = text.slice(0, start) + replacement + text.slice(end)
    sources.push({file, source, text})
  }
  visit(`supabase/functions/${name}/index.ts`)
  const header = "import {createClient} from 'npm:@supabase/supabase-js@2.118.0';\nimport {corsHeaders} from 'npm:@supabase/supabase-js@2.118.0/cors';\n"
  const result = ts.transpileModule(header + sources.map(item => item.text).join('\n'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true},
    reportDiagnostics: true,
  })
  if (result.diagnostics?.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(result.diagnostics, {
    getCanonicalFileName: file => file, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
  }))
  writeFileSync(resolve(out, name + '.js'), result.outputText)
  const test = readFileSync(`supabase/functions/${name}/supabase-http.test.ts`, 'utf8')
    .replaceAll("'./index.ts'", JSON.stringify('./' + name + '.js'))
    .replaceAll("'./game-password.ts'", JSON.stringify('../../functions/' + name + '/game-password.ts'))
  writeFileSync(resolve(out, name + '.test.ts'), test)
  manifest[name] = {sha256: createHash('sha256').update(result.outputText).digest('hex'), bytes: Buffer.byteLength(result.outputText),
    sources: sources.map(item => ({file: item.file, sha256: createHash('sha256').update(item.source).digest('hex')}))}
}
writeFileSync(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log(JSON.stringify(Object.fromEntries(Object.entries(manifest).map(([name, value]) => [name, {bytes: value.bytes, sha256: value.sha256}]))))
if (process.argv.includes('--serve')) {
  createServer((req, res) => {
    const name = req.url?.slice(1).replace(/\.js$/, '')
    if (!names.includes(name) || req.url !== '/' + name + '.js') { res.writeHead(404); res.end(); return }
    res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'})
    res.end(readFileSync(resolve(out, name + '.js')))
  }).listen(4931, '127.0.0.1', () => console.log('Dashboard source preview: http://127.0.0.1:4931'))
}
