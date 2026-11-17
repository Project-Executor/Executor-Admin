import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchUsers } from '../api/admin'
import { ApiError } from '../api/client'
import type { AdminUser, PageResponse, Role } from '../api/types'
import RoleBadge from '../components/RoleBadge.tsx'
import { toReceiver } from './mailState'
import type { MailPageState } from './mailState'

const PAGE_SIZE = 20

interface Query {
  keyword: string
  role: Role | ''
  page: number
}

/** 유저 관리: 목록·검색 (GET /api/admin/users) */
export default function UsersPage() {
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const [query, setQuery] = useState<Query>({ keyword: '', role: '', page: 0 })
  const [data, setData] = useState<PageResponse<AdminUser> | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Map<number, AdminUser>>(new Map())

  useEffect(() => {
    let cancelled = false
    fetchUsers({ ...query, size: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return
        setData(res)
        setError('')
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [query])

  function change(next: Partial<Query>) {
    setLoading(true)
    setQuery((q) => ({ ...q, ...next }))
  }

  function search(e: FormEvent) {
    e.preventDefault()
    change({ keyword: input.trim(), page: 0 })
  }

  function toggle(u: AdminUser) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(u.userId)) next.delete(u.userId)
      else next.set(u.userId, u)
      return next
    })
  }

  function mailTo(users: AdminUser[]) {
    const state: MailPageState = {
      receivers: users.map(toReceiver),
    }
    navigate('/mails', { state })
  }

  const rows = data?.content ?? []
  const allOnPage = rows.length > 0 && rows.every((u) => selected.has(u.userId))

  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Map(prev)
      for (const u of rows) {
        if (allOnPage) next.delete(u.userId)
        else next.set(u.userId, u)
      }
      return next
    })
  }

  return (
    <section>
      <h2>유저 관리</h2>
      <p className="muted">닉네임·이메일 일부나 사용자 ID로 찾습니다. 최근 가입순이고, 닉네임을 누르면 상세 화면으로 갑니다.</p>

      <form className="card row" onSubmit={search}>
        <input placeholder="닉네임·이메일·ID" value={input} maxLength={100} onChange={(e) => setInput(e.target.value)} />
        <select
          value={query.role}
          onChange={(e) => change({ role: e.target.value as Role | '', page: 0 })}
          aria-label="권한"
        >
          <option value="">전체 권한</option>
          <option value="USER">일반</option>
          <option value="ADMIN">관리자</option>
        </select>
        <button type="submit">검색</button>
        {query.keyword && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setInput('')
              change({ keyword: '', page: 0 })
            }}
          >
            검색어 지우기
          </button>
        )}
      </form>

      {selected.size > 0 && (
        <div className="card row selection">
          <span>
            <b>{selected.size}명</b> 선택
          </span>
          <button type="button" onClick={() => mailTo([...selected.values()])}>
            선택한 사람에게 우편
          </button>
          <button type="button" className="secondary" onClick={() => setSelected(new Map())}>
            선택 해제
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="check">
                <input type="checkbox" checked={allOnPage} onChange={toggleAllOnPage} aria-label="이 페이지 모두 선택" />
              </th>
              <th className="num">ID</th>
              <th>닉네임</th>
              <th>이메일</th>
              <th className="num">코인</th>
              <th>가입일</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.userId} className={selected.has(u.userId) ? 'selected' : ''}>
                <td className="check">
                  <input
                    type="checkbox"
                    checked={selected.has(u.userId)}
                    onChange={() => toggle(u)}
                    aria-label={`${u.nickname ?? u.email} 선택`}
                  />
                </td>
                <td className="num">{u.userId}</td>
                <td>
                  <Link to={`/users/${u.userId}`}>{u.nickname ?? <span className="muted">(닉네임 없음)</span>}</Link>{' '}
                  <RoleBadge role={u.role} />
                </td>
                <td>{u.email}</td>
                <td className="num">{u.coin.toLocaleString()}</td>
                <td className="nowrap">{formatDate(u.createdAt)}</td>
                <td className="actions-cell">
                  <button type="button" className="secondary small-btn" onClick={() => mailTo([u])}>
                    우편
                  </button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && !error && (
              <tr>
                <td colSpan={7} className="empty muted">
                  {query.keyword || query.role ? '조건에 맞는 사용자가 없습니다.' : '사용자가 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {loading && <p className="muted small loading">불러오는 중...</p>}
      </div>

      {data && data.totalPages > 0 && (
        <div className="pager">
          <button
            type="button"
            className="secondary"
            disabled={loading || query.page === 0}
            onClick={() => change({ page: query.page - 1 })}
          >
            이전
          </button>
          <span>
            {data.page + 1} / {data.totalPages} <span className="muted small">(총 {data.totalElements.toLocaleString()}명)</span>
          </span>
          <button
            type="button"
            className="secondary"
            disabled={loading || query.page + 1 >= data.totalPages}
            onClick={() => change({ page: query.page + 1 })}
          >
            다음
          </button>
        </div>
      )}
    </section>
  )
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}
