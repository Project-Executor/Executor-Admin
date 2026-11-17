import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchNotices } from '../api/admin'
import { ApiError } from '../api/client'
import { NOTICE_CATEGORY_LABEL } from '../api/types'
import type { AdminNotice, PageResponse } from '../api/types'
import { formatDateTime } from '../components/datetime'
import { noticeStatus } from '../components/noticeStatus'

const PAGE_SIZE = 20

/** 공지 목록 (숨김·예약·종료 포함, 최근 작성순) */
export default function NoticesPage() {
  const [page, setPage] = useState(0)
  const [data, setData] = useState<PageResponse<AdminNotice> | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    fetchNotices(page, PAGE_SIZE)
      .then((res) => {
        if (cancelled) return
        setData(res)
        setNow(Date.now())
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
  }, [page])

  function go(p: number) {
    setLoading(true)
    setPage(p)
  }

  const rows = data?.content ?? []

  return (
    <section>
      <div className="row title-row">
        <h2>공지사항</h2>
        <Link to="/notices/new" className="button">
          새 공지
        </Link>
      </div>
      <p className="muted">
        게임에는 &lsquo;게시 중&rsquo;인 공지만 보입니다. 상단 고정 공지가 먼저, 그다음 게시 시각 최신순입니다.
      </p>

      {error && <p className="error">{error}</p>}

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>상태</th>
              <th>분류</th>
              <th>제목</th>
              <th>게시</th>
              <th>종료</th>
              <th>수정</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => {
              const st = noticeStatus(n, now)
              return (
                <tr key={n.noticeId}>
                  <td>
                    <span className={`badge ${st.className}`}>{st.label}</span>
                  </td>
                  <td>{NOTICE_CATEGORY_LABEL[n.category]}</td>
                  <td className="wrap">
                    {n.isPinned && <span className="badge pinned">고정</span>} <Link to={`/notices/${n.noticeId}`}>{n.title}</Link>
                  </td>
                  <td className="nowrap">{formatDateTime(n.publishedAt)}</td>
                  <td className="nowrap">{n.endsAt ? formatDateTime(n.endsAt) : <span className="muted">계속</span>}</td>
                  <td className="nowrap muted small">{formatDateTime(n.updatedAt)}</td>
                </tr>
              )
            })}
            {!loading && rows.length === 0 && !error && (
              <tr>
                <td colSpan={6} className="empty muted">
                  아직 공지가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {loading && <p className="muted small loading">불러오는 중...</p>}
      </div>

      {data && data.totalPages > 1 && (
        <div className="pager">
          <button type="button" className="secondary" disabled={loading || page === 0} onClick={() => go(page - 1)}>
            이전
          </button>
          <span>
            {data.page + 1} / {data.totalPages}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={loading || page + 1 >= data.totalPages}
            onClick={() => go(page + 1)}
          >
            다음
          </button>
        </div>
      )}
    </section>
  )
}
