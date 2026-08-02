#!/usr/bin/env node

import net from 'node:net'
import { spawnSync } from 'node:child_process'

const port = 8787
const hostsToCheck = ['127.0.0.1', '::1', 'localhost']

function canBind(host) {
  return new Promise((resolve) => {
    const server = net.createServer()

    server.unref()
    server.once('error', (error) => {
      resolve({ ok: false, error, host })
    })

    server.listen({ host, port, exclusive: true }, () => {
      server.close(() => {
        resolve({ ok: true, host })
      })
    })
  })
}

for (const host of hostsToCheck) {
  const result = await canBind(host)

  if (!result.ok) {
    // Never force-kill processes here.
    // Abrupt termination (kill -9) can leave child toolchain workers in an
    // inconsistent state and cause flaky/esbuild deadlock failures.
    console.error(`Port ${port} is already in use on ${host}.`)
    console.error('Stop the existing server (or let Playwright reuse it) and try again.')
    process.exit(1)
  }
}
// pnpm build first
spawnSync('pnpm', ['build'], {
  stdio: 'inherit',
  env: process.env
})
const result = spawnSync('wrangler', ['--cwd', '.output', 'dev', '--port', String(port), '--ip', 'localhost'], {
  stdio: 'inherit',
  env: process.env
})

process.exit(result.status ?? (result.signal ? 1 : 0))
