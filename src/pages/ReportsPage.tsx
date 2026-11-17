import { Fragment, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { changeReportStatus, fetchReports } from '../api/admin'
import { ApiError } from '../api/client'
import { REPORT_STATUS_LABEL } from '../api/types'
import type { AdminReport, PageResponse, ReportStatus, UserSummary } from '../api/types'
import { formatDateTime } from '../components/datetime'

const PAGE_SIZE = 20
const TABS: { value: ReportStatus | ''; label: string }[] = [
  { value: 'RECEIVED', label: '접수' },
  { value: 'IN_PROGRESS', label: '처리 중' },
  { value: 'DONE', label: '완료' },
  { value: '', label: '전체' },
]
const STATUS_CLASS: Record<ReportStatus, string> = {
  RECEIVED: 'received',
  IN_PROGRESS: 'scheduled',
  DONE: 'muted-badge',
}

/** 신고 처리: 상태별 목록, 내용 보기, 상태 변경 (GET·PATCH /api/admin/reports) */
export default function ReportsPage() {
  const [status, setStatus] = useState<ReportStatus | ''>('RECEIVED')
  const [page, setPage] = useState(0)
  const [data, setData] = useState<PageResponse<AdminReport> | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchReports(status, page, PAGE_SIZE)
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
  }, [status, page])

  function selectTab(next: ReportStatus | '') {
    if (next === status) return
    setLoading(true)
    setOpenId(null)
    setPage(0)
    setStatus(next)
  }

  function go(p: number) {
    setLoading(true)
    setOpenId(null)
    setPage(p)
  }

  /** 상태를 바꾼 신고를 목록에서 바로 고친다 (탭과 맞지 않게 돼도 새로고침 전까지는 그대로 보여 준다) */
  function patchRow(reportId: number, next: Pick<AdminReport, 'status' | 'handledAt'>) {
    setData((d) => d && { ...d, content: d.content.map((r) => (r.reportId === reportId ? { ...r, ...next } : r)) })
  }

  const rows = data?.content ?? []

  return (
    <section>
      <h2>신고</h2>
      <p className="muted">
        줄을 누르면 내용을 보고 상태를 바꿀 수 있습니다. 상태는 앞으로만 진행합니다 (접수 → 처리 중 → 완료).
      </p>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.label}
            type="button"
            role="tab"
            aria-selected={status === t.value}
            className={status === t.value ? 'tab active' : 'tab'}
            onClick={() => selectTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>상태</th>
              <th>분류</th>
              <th>제목</th>
              <th>신고자</th>
              <th>대상</th>
              <th>접수</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const open = openId === r.reportId
              return (
                <Fragment key={r.reportId}>
                  <tr
                    className={open ? 'clickable selected' : 'clickable'}
                    onClick={() => setOpenId(open ? null : r.reportId)}
                    aria-expanded={open}
                  >
                    <td>
                      <span className={`badge ${STATUS_CLASS[r.status]}`}>{REPORT_STATUS_LABEL[r.status]}</span>
                    </td>
                    <td>{r.category.name}</td>
                    <td className="wrap">{r.title}</td>
                    <td>
                      <UserCell user={r.reporter} />
                    </td>
                    <td className="wrap">
                      <TargetCell report={r} />
                    </td>
                    <td className="nowrap">{formatDateTime(r.createdAt)}</td>
                  </tr>
                  {open && (
                    <tr className="detail-row">
                      <td colSpan={6}>
                        <ReportDetail report={r} onChanged={(next) => patchRow(r.reportId, next)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {!loading && rows.length === 0 && !error && (
              <tr>
                <td colSpan={6} className="empty muted">
                  {status ? `${REPORT_STATUS_LABEL[status]} 상태인 신고가 없습니다.` : '신고가 없습니다.'}
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
            {data.page + 1} / {data.totalPages} <span className="muted small">(총 {data.totalElements.toLocaleString()}건)</span>
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

/** 사용자 표시. 누르면 유저 상세로 간다 (줄 펼치기와 겹치지 않게 클릭 전파를 막는다) */
function UserCell({ user }: { user: UserSummary | null }) {
  if (!user) return <span className="muted">(탈퇴)</span>
  return (
    <Link to={`/users/${user.userId}`} onClick={(e) => e.stopPropagation()}>
      {user.nickname ?? '(닉네임 없음)'} <small className="muted">#{user.userId}</small>
    </Link>
  )
}

function TargetCell({ report }: { report: AdminReport }) {
  const parts: ReactNode[] = []
  if (report.targetUser) parts.push(<UserCell key="u" user={report.targetUser} />)
  if (report.targetStage) {
    const s = report.targetStage
    parts.push(
      <span key="s">
        {s.official ? '스테이지' : '사용자 맵'} &lsquo;{s.title}&rsquo; <small className="muted">#{s.stageId}</small>
      </span>,
    )
  }
  if (parts.length === 0) return <span className="muted">없음</span>
  return <>{parts.reduce<ReactNode[]>((acc, p, i) => (i ? [...acc, ' · ', p] : [p]), [])}</>
}

function ReportDetail({
  report,
  onChanged,
}: {
  report: AdminReport
  onChanged: (next: Pick<AdminReport, 'status' | 'handledAt'>) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function change(next: ReportStatus) {
    const msg =
      next === 'DONE'
        ? '완료로 바꿀까요? 완료한 신고는 되돌릴 수 없습니다.'
        : '처리 중으로 바꿀까요? 접수로 되돌릴 수 없습니다.'
    if (!window.confirm(msg)) return
    setError('')
    setBusy(true)
    try {
      const res = await changeReportStatus(report.reportId, next)
      onChanged({ status: res.status, handledAt: res.handledAt })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="report-detail">
      <dl className="info">
        <dt>신고 번호</dt>
        <dd>#{report.reportId}</dd>
        <dt>내용</dt>
        <dd className="pre">{report.comment ?? <span className="muted">(내용 없음)</span>}</dd>
        <dt>처리 완료</dt>
        <dd>{report.handledAt ? formatDateTime(report.handledAt) : <span className="muted">아직</span>}</dd>
      </dl>
      <div className="row">
        {report.status === 'RECEIVED' && (
          <button type="button" className="secondary" disabled={busy} onClick={() => void change('IN_PROGRESS')}>
            처리 중으로
          </button>
        )}
        {report.status !== 'DONE' && (
          <button type="button" disabled={busy} onClick={() => void change('DONE')}>
            완료
          </button>
        )}
        {report.targetUser && (
          <Link to={`/users/${report.targetUser.userId}`} className="small">
            대상 사용자 상세 (정지·코인) →
          </Link>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
