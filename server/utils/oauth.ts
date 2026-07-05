import type { H3Event } from 'h3'
import { deleteCookie, getCookie, getRequestURL, setCookie } from 'h3'

export const WORKERS_BASE_HOST = 'mistallas.workers.dev'
const OAUTH_RETURN_HOST_COOKIE = 'oauth-return-host'
const OAUTH_RETURN_HOST_COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: true,
  maxAge: 60 * 10,
  domain: `.${WORKERS_BASE_HOST}`
}

export function normalizeHost(host: string): string {
  return host.split(':', 1)[0].trim().toLowerCase()
}

export function isTrustedWorkersHost(host: string): boolean {
  const normalizedHost = normalizeHost(host)
  return normalizedHost === WORKERS_BASE_HOST || normalizedHost.endsWith(`.${WORKERS_BASE_HOST}`)
}

export function isTrustedWorkersSubdomain(host: string): boolean {
  const normalizedHost = normalizeHost(host)
  return normalizedHost !== WORKERS_BASE_HOST && normalizedHost.endsWith(`.${WORKERS_BASE_HOST}`)
}

export function getOAuthRedirectURLForHost(host: string, provider: 'github' | 'google'): string | undefined {
  if (!isTrustedWorkersSubdomain(host)) {
    return undefined
  }

  return `https://${WORKERS_BASE_HOST}/api/auth/${provider}`
}

export function getOAuthReturnRedirectURL(host: string | undefined, fallbackPath: string): string {
  if (!host || !isTrustedWorkersSubdomain(host)) {
    return fallbackPath
  }

  return `https://${normalizeHost(host)}${fallbackPath}`
}

export function setOAuthReturnHostCookie(event: H3Event): void {
  const host = getRequestURL(event).host
  if (!isTrustedWorkersSubdomain(host)) {
    return
  }

  setCookie(event, OAUTH_RETURN_HOST_COOKIE, normalizeHost(host), OAUTH_RETURN_HOST_COOKIE_OPTIONS)
}

export function consumeOAuthReturnHostCookie(event: H3Event): string | undefined {
  const host = getCookie(event, OAUTH_RETURN_HOST_COOKIE)
  deleteCookie(event, OAUTH_RETURN_HOST_COOKIE, OAUTH_RETURN_HOST_COOKIE_OPTIONS)

  if (!host || !isTrustedWorkersSubdomain(host)) {
    return undefined
  }

  return normalizeHost(host)
}
