// Executor-Server API 호출 공통 처리.
// - Authorization: Bearer {accessToken} 자동 첨부
// - 401 TOKEN_EXPIRED 이면 Refresh Token으로 재발급 후 원래 요청을 한 번 다시 보냄 (동시 만료 시 재발급 1회)
// - 실패하면 ApiError (서버의 status·code·message 그대로)

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '/api'

const ACCESS_KEY = 'executor-admin.access'
const REFRESH_KEY = 'executor-admin.refresh'

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }

  get isNetworkError(): boolean {
    return this.status === 0
  }
}

// 관리자 도구라 탭을 닫으면 로그아웃되도록 sessionStorage에 둔다
function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch {
    // 저장할 수 없는 환경이면 이번 탭에서만 동작
  }
}

export const tokens = {
  get access() {
    return read(ACCESS_KEY)
  },
  get refresh() {
    return read(REFRESH_KEY)
  },
  save(access: string, refresh: string) {
    write(ACCESS_KEY, access)
    write(REFRESH_KEY, refresh)
  },
  clear() {
    write(ACCESS_KEY, null)
    write(REFRESH_KEY, null)
  },
}

/** 다시 로그인해야 할 때 (Refresh Token 만료·무효). AuthProvider가 로그인 화면으로 보낸다 */
let onSessionExpired: (() => void) | null = null
export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler
}

interface Raw {
  status: number
  body: unknown
}

async function rawRequest(method: string, path: string, body: unknown, token: string | null): Promise<Raw> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  let res: Response
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (e) {
    throw new ApiError(0, 'NETWORK_ERROR', `서버에 연결할 수 없습니다. (${String(e)})`)
  }
  const text = await res.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }
  return { status: res.status, body: parsed }
}

function toError(raw: Raw): ApiError {
  const b = raw.body as { code?: string; message?: string } | null
  return new ApiError(raw.status, b?.code ?? `HTTP_${raw.status}`, b?.message ?? `요청이 실패했습니다. (${raw.status})`)
}

let refreshing: Promise<boolean> | null = null

async function refreshOnce(expiredToken: string | null): Promise<boolean> {
  // 다른 요청이 이미 재발급했으면 그 토큰을 쓴다
  if (expiredToken && tokens.access && tokens.access !== expiredToken) return true
  if (!refreshing) {
    refreshing = (async () => {
      const refresh = tokens.refresh
      if (!refresh) return false
      const raw = await rawRequest('POST', '/auth/reissue', { refreshToken: refresh }, null)
      if (raw.status === 200) {
        const t = raw.body as { accessToken: string; refreshToken: string }
        tokens.save(t.accessToken, t.refreshToken)
        return true
      }
      if (raw.status === 401) {
        tokens.clear()
        onSessionExpired?.()
        return false
      }
      throw toError(raw)
    })().finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

/** API 호출. path는 /api 뒤 부분 (예: '/admin/items') */
export async function api<T>(method: string, path: string, body?: unknown, options: { auth?: boolean } = {}): Promise<T> {
  const auth = options.auth ?? true
  let token = auth ? tokens.access : null
  let raw = await rawRequest(method, path, body, token)
  const code = (raw.body as { code?: string } | null)?.code
  if (auth && raw.status === 401 && code === 'TOKEN_EXPIRED') {
    if (!(await refreshOnce(token))) throw new ApiError(401, 'SESSION_EXPIRED', '로그인이 만료되었습니다. 다시 로그인해 주세요.')
    token = tokens.access
    raw = await rawRequest(method, path, body, token)
  }
  if (raw.status < 200 || raw.status >= 300) throw toError(raw)
  return raw.body as T
}

export const get = <T>(path: string) => api<T>('GET', path)
export const post = <T>(path: string, body?: unknown) => api<T>('POST', path, body)
export const put = <T>(path: string, body: unknown) => api<T>('PUT', path, body)
export const patch = <T>(path: string, body: unknown) => api<T>('PATCH', path, body)
export const del = (path: string) => api<void>('DELETE', path)
