// The dev server, kept alive: runs Vite and starts it again when it crashes. On Windows a native module
// (bundler / CSS engine) sometimes ends Vite during hot reload with 0xC0000409 (stack buffer overrun);
// the site then stops answering until someone restarts it by hand. Arguments go to Vite unchanged
// (npm run dev -- --port 5173 --strictPort). Ctrl-C (or stopping the server) ends both.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js')
const args = process.argv.slice(2)
const crashes = [] // when Vite fell, to give up on a crash loop (a real error in the config)
let child = null
let stopping = false

function start() {
  child = spawn(process.execPath, [vite, ...args], { stdio: 'inherit' })
  child.on('exit', code => {
    if (stopping || code === 0) process.exit(code ?? 0)
    const now = Date.now()
    crashes.push(now)
    while (crashes.length && now - crashes[0] > 60_000) crashes.shift()
    if (crashes.length > 5) {
      console.error(`[dev] Vite fell ${crashes.length} times in a minute (code ${code}): giving up`)
      process.exit(code ?? 1)
    }
    console.warn(`[dev] Vite stopped unexpectedly (code ${code}); starting it again…`)
    // the port needs a moment to be released
    setTimeout(start, 1000)
  })
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
  process.on(signal, () => { stopping = true; child?.kill(); setTimeout(() => process.exit(0), 3000).unref() })
}
start()
