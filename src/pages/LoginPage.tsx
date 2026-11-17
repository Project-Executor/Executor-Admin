import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/context'

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email.trim(), password)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.isNetworkError ? '서버에 연결할 수 없습니다. (네트워크·VPN 확인)' : err.message)
      } else {
        setError(String(err))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <h1>
          EXECUTOR <span className="muted">운영툴</span>
        </h1>
        <p className="muted small">관리자(ADMIN) 계정으로 로그인합니다.</p>
        <label>
          이메일
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>
          비밀번호
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </div>
  )
}
