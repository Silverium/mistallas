import { describe, expect, it } from 'vitest'

import {
  WORKERS_BASE_HOST,
  getOAuthRedirectURLForHost,
  getOAuthReturnRedirectURL,
  isTrustedWorkersHost,
  isTrustedWorkersSubdomain,
  normalizeHost
} from './oauth'

describe('oauth host safety', () => {
  it('normalizes host values', () => {
    expect(normalizeHost('COPILOT-123.MISTALLAS.WORKERS.DEV:443')).toBe('copilot-123.mistallas.workers.dev')
  })

  it('accepts only trusted mistallas workers hosts', () => {
    expect(isTrustedWorkersHost(WORKERS_BASE_HOST)).toBe(true)
    expect(isTrustedWorkersHost('copilot-123.mistallas.workers.dev')).toBe(true)
    expect(isTrustedWorkersHost('mistallas.workers.dev.attacker.com')).toBe(false)
    expect(isTrustedWorkersHost('attacker.com')).toBe(false)
  })

  it('allows only real subdomains for shared OAuth return', () => {
    expect(isTrustedWorkersSubdomain(WORKERS_BASE_HOST)).toBe(false)
    expect(isTrustedWorkersSubdomain('copilot-123.mistallas.workers.dev')).toBe(true)
    expect(isTrustedWorkersSubdomain('mistallas.workers.dev.attacker.com')).toBe(false)
  })

  it('uses root workers callback for trusted preview subdomains', () => {
    expect(getOAuthRedirectURLForHost('copilot-123.mistallas.workers.dev', 'github')).toBe('https://mistallas.workers.dev/api/auth/github')
    expect(getOAuthRedirectURLForHost('copilot-123.mistallas.workers.dev', 'google')).toBe('https://mistallas.workers.dev/api/auth/google')
    expect(getOAuthRedirectURLForHost('mistallas.workers.dev', 'github')).toBeUndefined()
    expect(getOAuthRedirectURLForHost('localhost:3000', 'github')).toBeUndefined()
  })

  it('never builds open redirects for untrusted hosts', () => {
    expect(getOAuthReturnRedirectURL('copilot-123.mistallas.workers.dev', '/purchases')).toBe('https://copilot-123.mistallas.workers.dev/purchases')
    expect(getOAuthReturnRedirectURL('attacker.com', '/purchases')).toBe('/purchases')
    expect(getOAuthReturnRedirectURL(undefined, '/purchases')).toBe('/purchases')
  })
})
