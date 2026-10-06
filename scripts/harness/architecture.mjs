import { createRequire } from 'node:module'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(path.join(projectRoot, 'packages/game-engine/package.json'))
const ts = require('typescript')
const ignored = new Set(['node_modules', 'dist', '.nuxt', '.output', 'coverage', '.git'])
const externalInput = new Set([
  'Date', 'performance', 'process', 'window', 'document', 'localStorage',
  'sessionStorage', 'fetch', 'crypto', 'globalThis', 'setTimeout', 'setInterval',
])

function inside(directory, target) {
  const relative = path.relative(directory, target)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

export function inspectSource(file, source, root = projectRoot) {
  const engine = path.join(root, 'packages/game-engine/src')
  const isEngine = inside(engine, file)
  const violations = []
  // Vue templates are not JavaScript. Inspect each script block independently.
  const blocks = file.endsWith('.vue')
    ? [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(match => ({
      text: match[1], offset: match.index + match[0].indexOf('>') + 1,
    }))
    : [{ text: source, offset: 0 }]
  for (const block of blocks) {
    const tree = ts.createSourceFile(file, block.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    function report(node, rule, message) {
      const line = source.slice(0, block.offset + node.getStart(tree)).split('\n').length
      violations.push({ file: path.relative(root, file).replaceAll('\\', '/'), line, rule, message })
    }
    function dependency(node, argument) {
      if (!argument || !ts.isStringLiteralLike(argument)) {
        report(node, 'static-import', 'Dependency paths must be string literals so boundaries can be checked.')
        return
      }
      const specifier = argument.text
      if (isEngine) {
        if (specifier.startsWith('.')) {
          if (!inside(engine, path.resolve(path.dirname(file), specifier))) {
            report(node, 'engine-boundary', 'Engine imports must stay inside packages/game-engine/src.')
          }
        } else if (specifier !== 'node:crypto') {
          report(node, 'engine-dependency', 'Engine external dependencies are limited to node:crypto for deterministic hashing.')
        } else if (!ts.isImportDeclaration(node) || !node.importClause?.namedBindings
          || !ts.isNamedImports(node.importClause.namedBindings)
          || node.importClause.name
          || node.importClause.namedBindings.elements.some(element => (element.propertyName ?? element.name).text !== 'createHash')) {
          report(node, 'engine-crypto', 'Only named createHash imports from node:crypto are permitted.')
        }
      } else {
        const target = specifier.startsWith('.') ? path.resolve(path.dirname(file), specifier) : ''
        if (specifier.startsWith('@galerist/game-engine/') || (target && inside(path.join(root, 'packages/game-engine'), target))
          || /(?:^|\/)packages\/game-engine(?:\/|$)/.test(specifier)) {
          report(node, 'public-engine-api', 'Consumers must import @galerist/game-engine through its public entry point.')
        }
      }
    }
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        dependency(node, node.moduleSpecifier)
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        dependency(node, node.moduleReference.expression)
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        dependency(node, node.argument.literal)
      } else if (ts.isCallExpression(node)
        && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        dependency(node, node.arguments[0])
      }
      if (isEngine) {
        if (ts.isIdentifier(node) && node.text === 'Math'
          && !((ts.isPropertyAccessExpression(node.parent) || ts.isElementAccessExpression(node.parent))
            && node.parent.expression === node)) {
          report(node, 'deterministic-engine', 'Use explicit deterministic Math members; aliasing or destructuring Math is forbidden.')
        }
        if (ts.isIdentifier(node) && externalInput.has(node.text)
          && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
          && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)) {
          report(node, 'deterministic-engine', `Ambient ${node.text} is forbidden; pass explicit inputs to the engine.`)
        }
        if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
          && ts.isIdentifier(node.expression) && node.expression.text === 'Math') {
          const member = ts.isPropertyAccessExpression(node) ? node.name.text
            : ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : null
          if (member === 'random' || member === null) {
            report(node, 'deterministic-engine', 'Math.random and computed Math access are forbidden; use the approved RNG.')
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(tree)
  }
  return violations
}

async function sourceFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.isSymbolicLink()) continue
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await sourceFiles(file))
    else if (/\.(?:[cm]?[jt]sx?|vue)$/.test(entry.name)) files.push(file)
  }
  return files
}

export async function checkArchitecture(root = projectRoot) {
  const files = [...await sourceFiles(path.join(root, 'packages/game-engine/src')), ...await sourceFiles(path.join(root, 'apps'))]
  const results = await Promise.all(files.map(async file => inspectSource(file, await readFile(file, 'utf8'), root)))
  return results.flat()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = await checkArchitecture()
  for (const item of violations) console.error(`${item.file}:${item.line} [${item.rule}] ${item.message}`)
  console.log(`Architecture: ${violations.length} violation(s).`)
  process.exitCode = violations.length ? 1 : 0
}
