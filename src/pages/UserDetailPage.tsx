import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { adjustCoin, changeRole, fetchUserDetail, suspendUser, unsuspendUser } from '../api/admin'
import { ApiError } from '../api/client'
import type { AdminUserDetail, Role } from '../api/types'
import { useAuth } from '../auth/context'
import RoleBadge, { SuspendedBadge } from '../components/RoleBadge.tsx'
import { isSuspended, suspensionLabel } from '../components/suspension'
import { toReceiver } from './mailState'
import type { MailPageState } from './mailState'

const COIN_STEP_MAX = 1_000_000
const ROLE_LABEL: Record<Role, string> = { USER: '일반', ADMIN: '관리자' }

/** 유저 상세: 정보, 코인 조정, 권한 변경, 보유 아이템 (GET /api/admin/users/{id}) */
export default function UserDetailPage() {
  const { userId: param } = useParams()
  const userId = Number(param)
  const { admin } = useAuth()
  const navigate = useNavigate()
  const isSelf = admin?.userId === userId

  const [user, setUser] = useState<AdminUserDetail | null>(null)
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    try {
      setUser(await fetchUserDetail(userId))
      setLoadError('')
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : String(e))
    }
  }, [userId])

  useEffect(() => {
    if (!Number.isSafeInteger(userId) || userId <= 0) return
    let cancelled = false
    fetchUserDetail(userId)
      .then((u) => {
        if (!cancelled) setUser(u)
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (!Number.isSafeInteger(userId) || userId <= 0) return <Back message="잘못된 사용자 ID입니다." />
  if (loadError && !user) return <Back message={loadError} />
  if (!user) return <p className="muted">불러오는 중...</p>

  const name = user.nickname ?? '(닉네임 없음)'

  return (
    <section>
      <p className="small">
        <Link to="/users">← 유저 목록</Link>
      </p>
      <div className="row title-row">
        <h2>
          {name} <span className="muted">#{user.userId}</span> <RoleBadge role={user.role} />{' '}
          <SuspendedBadge until={user.suspendedUntil} />
        </h2>
        <button
          type="button"
          className="secondary"
          onClick={() => navigate('/mails', { state: { receivers: [toReceiver(user)] } satisfies MailPageState })}
        >
          메일 보내기
        </button>
      </div>

      <div className="card">
        <dl className="info">
          <dt>이메일</dt>
          <dd>{user.email}</dd>
          <dt>닉네임</dt>
          <dd>{user.nickname ?? <span className="muted">아직 정하지 않음 (튜토리얼 전)</span>}</dd>
          <dt>자기소개</dt>
          <dd>{user.comment ?? <span className="muted">없음</span>}</dd>
          <dt>권한</dt>
          <dd>{ROLE_LABEL[user.role]}</dd>
          <dt>코인</dt>
          <dd>{user.coin.toLocaleString()}</dd>
          <dt>공식 스테이지</dt>
          <dd>
            클리어 {user.clearedStageCount.toLocaleString()}개 · 별 {user.totalStars.toLocaleString()}개
          </dd>
          <dt>장착</dt>
          <dd>
            스킨 {itemLabel(user, user.equippedSkinId)} · 테마 {itemLabel(user, user.equippedThemeId)}
          </dd>
          <dt>가입일</dt>
          <dd>{new Date(user.createdAt).toLocaleString()}</dd>
        </dl>
      </div>

      <div className="grid2">
        <CoinForm user={user} onDone={(coin) => setUser({ ...user, coin })} />
        <RoleForm user={user} isSelf={isSelf} onDone={load} />
      </div>

      <SuspendForm user={user} isSelf={isSelf} onDone={load} />

      <div className="card table-wrap">
        <h3 className="card-title">보유 아이템 ({user.items.length})</h3>
        <table className="table">
          <thead>
            <tr>
              <th className="num">ID</th>
              <th>이름</th>
              <th>종류</th>
              <th className="num">수량</th>
              <th>얻은 날</th>
            </tr>
          </thead>
          <tbody>
            {user.items.map((i) => (
              <tr key={i.itemId}>
                <td className="num">{i.itemId}</td>
                <td>{i.name}</td>
                <td>{i.itemType}</td>
                <td className="num">{i.quantity}</td>
                <td className="nowrap">{new Date(i.acquiredAt).toLocaleString()}</td>
              </tr>
            ))}
            {user.items.length === 0 && (
              <tr>
                <td colSpan={5} className="empty muted">
                  가진 아이템이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Back({ message }: { message: string }) {
  return (
    <section>
      <p className="small">
        <Link to="/users">← 유저 목록</Link>
      </p>
      <p className="error">{message}</p>
    </section>
  )
}

/** 장착 아이템 표시. 보유 목록에 있으면 이름, 아니면 ID */
function itemLabel(user: AdminUserDetail, itemId: number | null) {
  if (itemId === null) return '기본'
  return user.items.find((i) => i.itemId === itemId)?.name ?? `#${itemId}`
}

function CoinForm({ user, onDone }: { user: AdminUserDetail; onDone: (coin: number) => void }) {
  const [mode, setMode] = useState<'add' | 'sub'>('add')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setResult('')
    const n = Number(value)
    if (!Number.isInteger(n) || n < 1 || n > COIN_STEP_MAX) {
      setError(`1~${COIN_STEP_MAX.toLocaleString()} 사이 정수를 입력하세요.`)
      return
    }
    if (mode === 'sub' && n > user.coin) {
      setError(`보유 코인(${user.coin.toLocaleString()})보다 많이 뺄 수 없습니다.`)
      return
    }
    const amount = mode === 'add' ? n : -n
    const after = user.coin + amount
    const verb = mode === 'add' ? '더할' : '뺄'
    if (!window.confirm(`${user.nickname ?? user.email}의 코인을 ${n.toLocaleString()} ${verb}까요?\n\n${user.coin.toLocaleString()} → ${after.toLocaleString()}`)) return

    setBusy(true)
    try {
      const res = await adjustCoin(user.userId, amount)
      onDone(res.coin)
      setValue('')
      setResult(`코인을 ${mode === 'add' ? '더했습니다' : '뺐습니다'}. 지금 ${res.coin.toLocaleString()}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card form compact" onSubmit={submit}>
      <h3 className="card-title">코인 조정</h3>
      <div className="row">
        <label className="inline">
          <input type="radio" checked={mode === 'add'} onChange={() => setMode('add')} /> 더하기
        </label>
        <label className="inline">
          <input type="radio" checked={mode === 'sub'} onChange={() => setMode('sub')} /> 빼기
        </label>
      </div>
      <div className="row">
        <input
          type="number"
          min={1}
          max={COIN_STEP_MAX}
          step={1}
          placeholder="코인"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" disabled={busy}>
          {busy ? '처리 중...' : mode === 'add' ? '더하기' : '빼기'}
        </button>
      </div>
      <p className="muted small">보상은 메일로 보내는 것을 권합니다. 여기서는 바로 반영되고 사용자에게 알림이 가지 않습니다.</p>
      {error && <p className="error">{error}</p>}
      {result && <p className="success">{result}</p>}
    </form>
  )
}

function RoleForm({ user, isSelf, onDone }: { user: AdminUserDetail; isSelf: boolean; onDone: () => Promise<void> }) {
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)
  const next: Role = user.role === 'ADMIN' ? 'USER' : 'ADMIN'

  async function submit() {
    setError('')
    setResult('')
    const warn =
      next === 'ADMIN'
        ? '관리자가 되면 관리자 웹에 들어올 수 있고 메일·코인·권한을 바꿀 수 있습니다.'
        : '관리자 웹에 더 이상 들어올 수 없습니다.'
    if (!window.confirm(`${user.nickname ?? user.email}의 권한을 ${ROLE_LABEL[next]}(으)로 바꿀까요?\n\n${warn}`)) return

    setBusy(true)
    try {
      await changeRole(user.userId, next)
      await onDone()
      setResult(`${ROLE_LABEL[next]}(으)로 바꿨습니다. 그 사용자의 다음 토큰 재발급(최대 30분 뒤)부터 적용됩니다.`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card form compact">
      <h3 className="card-title">권한</h3>
      <p>
        지금: <b>{ROLE_LABEL[user.role]}</b>
      </p>
      {isSelf ? (
        <p className="muted small">자기 자신의 권한은 바꿀 수 없습니다.</p>
      ) : (
        <div className="row">
          <button type="button" className={next === 'USER' ? 'danger' : ''} disabled={busy} onClick={() => void submit()}>
            {busy ? '처리 중...' : `${ROLE_LABEL[next]}(으)로 바꾸기`}
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {result && <p className="success">{result}</p>}
    </div>
  )
}

/** 정지 기간 고르기. 'custom'이면 직접 입력한 시각 */
const PERIODS = [
  { value: '1', label: '1일' },
  { value: '3', label: '3일' },
  { value: '7', label: '7일' },
  { value: '30', label: '30일' },
  { value: 'permanent', label: '영구' },
  { value: 'custom', label: '직접 입력' },
] as const
type Period = (typeof PERIODS)[number]['value']
const REASON_MAX = 200

function SuspendForm({ user, isSelf, onDone }: { user: AdminUserDetail; isSelf: boolean; onDone: () => Promise<void> }) {
  const suspended = isSuspended(user)
  const [period, setPeriod] = useState<Period>('7')
  const [customLocal, setCustomLocal] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)
  const who = user.nickname ?? user.email

  /** 기한 (ISO UTC, 영구면 null). 문제가 있으면 { error } */
  function deadline(): { until: string | null } | { error: string } {
    if (period === 'permanent') return { until: null }
    let d: Date
    if (period === 'custom') {
      if (!customLocal) return { error: '정지 기한을 고르세요.' }
      d = new Date(customLocal) // datetime-local은 PC 시간대 기준
    } else {
      d = new Date(Date.now() + Number(period) * 24 * 60 * 60 * 1000)
    }
    if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) return { error: '정지 기한은 지금보다 뒤여야 합니다.' }
    return { until: d.toISOString().replace(/\.\d{3}Z$/, 'Z') }
  }

  async function suspend(e: FormEvent) {
    e.preventDefault()
    setError('')
    setResult('')
    const r = reason.trim()
    if (!r) {
      setError('정지 사유를 입력하세요. 사용자가 로그인할 때 이 사유를 봅니다.')
      return
    }
    const d = deadline()
    if ('error' in d) {
      setError(d.error)
      return
    }
    const label = d.until === null ? '영구' : `${new Date(d.until).toLocaleString()}까지`
    const verb = suspended ? '정지 기간을 바꿀까요' : '정지할까요'
    if (!window.confirm(`${who}을(를) ${label} ${verb}?

사유: ${r}

로그인과 토큰 재발급이 막힙니다. 이미 접속 중이면 최대 30분 뒤에 끊깁니다.`)) return

    setBusy(true)
    try {
      await suspendUser(user.userId, d.until, r)
      await onDone()
      setReason('')
      setResult(`${label} 정지했습니다.`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function unsuspend() {
    setError('')
    setResult('')
    if (!window.confirm(`${who}의 정지를 풀까요?`)) return
    setBusy(true)
    try {
      await unsuspendUser(user.userId)
      await onDone()
      setResult('정지를 풀었습니다. 바로 로그인할 수 있습니다.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={`card form compact${suspended ? ' suspended-box' : ''}`} onSubmit={suspend}>
      <h3 className="card-title">계정 정지</h3>
      {suspended && user.suspendedUntil ? (
        <div className="row">
          <p>
            <b>정지 중</b> · {suspensionLabel(user.suspendedUntil)}
            {user.suspendReason && <> · 사유: {user.suspendReason}</>}
          </p>
          <button type="button" className="secondary" disabled={busy} onClick={() => void unsuspend()}>
            정지 풀기
          </button>
        </div>
      ) : (
        <p className="muted small">정지하면 로그인과 토큰 재발급이 막히고, 사용자는 로그인할 때 기한과 사유를 봅니다.</p>
      )}

      {isSelf ? (
        <p className="muted small">자기 자신은 정지할 수 없습니다.</p>
      ) : (
        <>
          <div className="row">
            {PERIODS.map((p) => (
              <label key={p.value} className="inline">
                <input type="radio" checked={period === p.value} onChange={() => setPeriod(p.value)} /> {p.label}
              </label>
            ))}
            {period === 'custom' && (
              <input type="datetime-local" value={customLocal} onChange={(e) => setCustomLocal(e.target.value)} />
            )}
          </div>
          <label>
            사유 ({reason.trim().length}/{REASON_MAX}, 사용자에게 보임)
            <input value={reason} maxLength={REASON_MAX} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="row">
            <button type="submit" className="danger" disabled={busy}>
              {busy ? '처리 중...' : suspended ? '정지 기간 바꾸기' : '정지하기'}
            </button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
      {result && <p className="success">{result}</p>}
    </form>
  )
}
