import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError, api, get, post, setSessionExpiredHandler, tokens } from '../api/client'
import type { LoginResponse, MyProfile } from '../api/types'
import { AuthContext } from './context'

/**
 * 관리자 로그인 상태. ADMIN 권한이 있는 계정만 들어올 수 있다.
 * 토큰은 sessionStorage에 있어서 같은 탭에서 새로고침하면 이어지고, 탭을 닫으면 로그아웃된다.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // 저장된 토큰이 있으면 확인 중(undefined), 없으면 바로 로그인 화면(null)
  const [admin, setAdmin] = useState<MyProfile | null | undefined>(() =>
    tokens.access || tokens.refresh ? undefined : null,
  )

  useEffect(() => {
    setSessionExpiredHandler(() => setAdmin(null))
    return () => setSessionExpiredHandler(null)
  }, [])

  // 새로고침했을 때 저장된 토큰이 아직 쓸 수 있고 ADMIN인지 다시 확인
  useEffect(() => {
    if (admin !== undefined) return
    let cancelled = false
    get<MyProfile>('/profiles/me')
      .then((me) => {
        if (cancelled) return
        if (me.role !== 'ADMIN') tokens.clear()
        setAdmin(me.role === 'ADMIN' ? me : null)
      })
      .catch(() => {
        if (cancelled) return
        tokens.clear()
        setAdmin(null)
      })
    return () => {
      cancelled = true
    }
  }, [admin])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<LoginResponse>('POST', '/auth/login', { email, password }, { auth: false })
    tokens.save(res.accessToken, res.refreshToken)
    if (res.user.role !== 'ADMIN') {
      // 관리자가 아니면 서버의 Refresh Token도 지우고 거부
      await post('/auth/logout').catch(() => undefined)
      tokens.clear()
      throw new ApiError(403, 'NOT_ADMIN', '관리자 권한이 없는 계정입니다.')
    }
    setAdmin(await get<MyProfile>('/profiles/me'))
  }, [])

  const logout = useCallback(async () => {
    await post('/auth/logout').catch(() => undefined)
    tokens.clear()
    setAdmin(null)
  }, [])

  const value = useMemo(() => ({ admin, login, logout }), [admin, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
