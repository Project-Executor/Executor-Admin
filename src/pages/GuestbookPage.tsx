import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { deleteGuestbookEntry, fetchGuestbook } from '../api/admin'
import { ApiError } from '../api/client'
import type { GuestbookEntry, PageResponse } from '../api/types'
import { formatDateTime } from '../components/datetime'

const PAGE_SIZE = 20

/**
 * 방명록 (전시용, 게임에서 로그인 없이 남긴다). 욕설·전화번호·이메일은 서버가 * 로 가려서 저장하고,
 * 그래도 부적절한 글은 여기서 지운다. 게임 화면에는 다음 새로고침(몇 초)에 사라진다.
 */
export default function GuestbookPage() {
  const [data, setData] = useState<PageResponse<GuestbookEntry> | null>(null)
  const [page, setPage] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchGuestbook(query, page, PAGE_SIZE)
      .then((res) => {
        if (!cancelled) {
          setData(res)
          setError('')
        }
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
  }, [query, page, tick])

  function search(e: FormEvent) {
    e.preventDefault()
    setPage(0)
    setQuery(keyword.trim())
  }

  async function remove(entry: GuestbookEntry) {
    if (!window.confirm(`'${entry.name}'의 방명록을 지울까요?\n\n${entry.message}`)) return
    setBusyId(entry.id)
    try {
      await deleteGuestbookEntry(entry.id)
      setTick((t) => t + 1)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section>
      <div className="row title-row">
        <h2>방명록</h2>
        <button type="button" className="secondary small-btn" disabled={loading} onClick={() => setTick((t) => t + 1)}>
          새로고침
        </button>
      </div>
      <p className="muted small">
        게임 메인 화면의 방명록(guestbook.exe)에 남긴 글입니다. 로그인 없이 누구나 남길 수 있고, 욕설·전화번호·이메일은 저장할 때 자동으로 가려집니다.
        부적절한 글은 삭제하세요.
      </p>
      <form className="row" onSubmit={search}>
        <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="이름·내용 검색" />
        <button type="submit" className="secondary">
          검색
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>이름</th>
              <th>남긴 말</th>
              <th>시각</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.content.map((g) => (
              <tr key={g.id}>
                <td className="num muted small">{g.id}</td>
                <td className="nowrap">{g.name}</td>
                <td className="wrap">{g.message}</td>
                <td className="nowrap muted small">{formatDateTime(g.createdAt)}</td>
                <td className="actions-cell">
                  <button type="button" className="danger small-btn" disabled={busyId === g.id} onClick={() => void remove(g)}>
                    삭제
                  </button>
                </td>
              </tr>
            ))}
            {data && data.content.length === 0 && (
              <tr>
                <td colSpan={5} className="empty muted">
                  {query ? '검색 결과가 없습니다.' : '아직 방명록이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {loading && <p className="muted small loading">불러오는 중...</p>}
      </div>
      {data && data.totalPages > 1 && (
        <div className="pager">
          <button type="button" className="secondary" disabled={loading || page === 0} onClick={() => setPage(page - 1)}>
            이전
          </button>
          <span>
            {data.page + 1} / {data.totalPages} <span className="muted small">(총 {data.totalElements.toLocaleString()}건)</span>
          </span>
          <button type="button" className="secondary" disabled={loading || page + 1 >= data.totalPages} onClick={() => setPage(page + 1)}>
            다음
          </button>
        </div>
      )}
    </section>
  )
}
