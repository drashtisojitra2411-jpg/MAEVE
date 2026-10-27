import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `npm run dev` — starts MAEVE's API and the Vite dev server together.
 *
 * Previously `npm run dev` launched only Vite, so every `/api/*` call proxied
 * to a port with nothing listening (ECONNREFUSED). Both processes now come up
 * from one command; either one exiting tears the other down.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiUrl = process.env.MAEVE_API_URL ?? 'http://localhost:8787'

const children = []
let shuttingDown = false

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill()
      } catch {
        /* already gone */
      }
    }
  }
  setTimeout(() => process.exit(code), 250)
}

function run(name, args) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, MAEVE_API_URL: apiUrl },
  })
  const prefix = `[${name}] `
  for (const [stream, sink] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ]) {
    let buffered = ''
    stream.on('data', (chunk) => {
      buffered += chunk.toString()
      const lines = buffered.split(/\r?\n/)
      buffered = lines.pop() ?? ''
      for (const line of lines) sink.write(prefix + line + '\n')
    })
  }
  child.on('exit', (code) => {
    if (shuttingDown) return
    process.stderr.write(`${prefix}exited with code ${code}\n`)
    shutdown(code ?? 1)
  })
  children.push(child)
  return child
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

console.log(`MAEVE dev: API -> ${apiUrl}, client -> http://localhost:5173`)
run('api', ['--disable-warning=ExperimentalWarning', path.join('server', 'src', 'index.js')])
run('web', [path.join('node_modules', 'vite', 'bin', 'vite.js')])
