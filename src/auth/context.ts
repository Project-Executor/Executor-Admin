import { createContext, useContext } from 'react'
import type { MyProfile } from '../api/types'

export interface AuthState {
  /** 로그인한 관리자. 확인 중이면 undefined, 로그인 안 됨이면 null */
  admin: MyProfile | null | undefined
  login(email: string, password: string): Promise<void>
  logout(): Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('AuthProvider 안에서만 쓸 수 있습니다.')
  return ctx
}
