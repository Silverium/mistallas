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
    // kill the process that is using the port
    // lsof works on macOS and most Linux systems; fuser is a fallback for Linux systems without lsof
    let pids = spawnSync('lsof', ['-tiTCP:' + port, '-sTCP:LISTEN'], { encoding: 'utf8' })
      .stdout.trim()
      .split('\n')
      .filter(Boolean)

    if (pids.length === 0) {
      const fuserOut = spawnSync('fuser', [port + '/tcp'], { encoding: 'utf8' }).stdout
      pids = fuserOut.trim().split(/\s+/).filter(Boolean)
    }

    for (const pid of pids) {
      console.log(`Killing process ${pid} using port ${port}`)
      spawnSync('kill', ['-9', pid])
    }
    if (pids.length === 0) {
      console.error(`Port ${port} is already in use on ${host}. Stop the existing server and try again.`)
      process.exit(1)
    }
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
