import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createNotice, deleteNotice, fetchNotice, updateNotice } from '../api/admin'
import { ApiError } from '../api/client'
import { NOTICE_CATEGORY_LABEL } from '../api/types'
import type { AdminNotice, AdminNoticeRequest, NoticeCategory } from '../api/types'
import { formatDateTime, fromLocalInput, toLocalInput } from '../components/datetime'
import { noticeStatus } from '../components/noticeStatus'

const TITLE_MAX = 100
const CONTENT_MAX = 5000
const CATEGORIES = Object.keys(NOTICE_CATEGORY_LABEL) as NoticeCategory[]

/** 공지 작성(/notices/new)·수정(/notices/:noticeId) */
export default function NoticeEditPage() {
  const { noticeId: param } = useParams()
  const isNew = param === undefined
  const noticeId = Number(param)
  const navigate = useNavigate()

  const [loaded, setLoaded] = useState<AdminNotice | null>(null)
  /** 상태(게시 중·예약 등) 표시 기준 시각 = 불러온 시각 */
  const [loadedAt, setLoadedAt] = useState(0)
  const [loadError, setLoadError] = useState('')

  const [category, setCategory] = useState<NoticeCategory>('NOTICE')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isPinned, setIsPinned] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const [publishNow, setPublishNow] = useState(true)
  const [publishedLocal, setPublishedLocal] = useState('')
  const [hasEnd, setHasEnd] = useState(false)
  const [endsLocal, setEndsLocal] = useState('')

  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)

  function fill(n: AdminNotice) {
    setLoaded(n)
    setLoadedAt(Date.now())
    setCategory(n.category)
    setTitle(n.title)
    setContent(n.content)
    setIsPinned(n.isPinned)
    setIsVisible(n.isVisible)
    setPublishNow(false)
    setPublishedLocal(toLocalInput(n.publishedAt))
    setHasEnd(n.endsAt !== null)
    setEndsLocal(n.endsAt ? toLocalInput(n.endsAt) : '')
  }

  useEffect(() => {
    if (isNew) return
    let cancelled = false
    fetchNotice(noticeId)
      .then((n) => {
        if (!cancelled) fill(n)
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [isNew, noticeId])

  /** 입력값 검사. 문제가 있으면 메시지, 없으면 요청 본문 */
  function buildRequest(): string | AdminNoticeRequest {
    const t = title.trim()
    const c = content.trim()
    if (t.length < 1 || t.length > TITLE_MAX) return `제목은 1~${TITLE_MAX}자여야 합니다.`
    if (c.length < 1 || c.length > CONTENT_MAX) return `내용은 1~${CONTENT_MAX}자여야 합니다.`
    let publishedAt: string | null = null
    if (!publishNow) {
      publishedAt = fromLocalInput(publishedLocal)
      if (!publishedAt) return '게시 시각을 고르세요.'
    }
    let endsAt: string | null = null
    if (hasEnd) {
      endsAt = fromLocalInput(endsLocal)
      if (!endsAt) return '종료 시각을 고르세요.'
      const start = publishedAt ? new Date(publishedAt).getTime() : Date.now()
      if (new Date(endsAt).getTime() <= start) return '종료 시각은 게시 시각보다 뒤여야 합니다.'
    }
    return { category, title: t, content: c, isPinned, isVisible, publishedAt, endsAt }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaved('')
    const req = buildRequest()
    if (typeof req === 'string') {
      setError(req)
      return
    }
    const preview = noticeStatus(
      { isVisible: req.isVisible, publishedAt: req.publishedAt ?? new Date().toISOString(), endsAt: req.endsAt },
      Date.now(),
    )
    if (!window.confirm(`${isNew ? '등록' : '저장'}할까요?\n\n저장하면 게임에서: ${preview.label}`)) return

    setBusy(true)
    try {
      if (isNew) {
        const created = await createNotice(req)
        navigate(`/notices/${created.noticeId}`, { replace: true })
      } else {
        fill(await updateNotice(noticeId, req))
        setSaved('저장했습니다.')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm('이 공지를 삭제할까요? 되돌릴 수 없습니다.\n\n잠시 내리기만 하려면 "게임에 보이기"를 끄고 저장하세요.')) return
    setBusy(true)
    try {
      await deleteNotice(noticeId)
      navigate('/notices', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
      setBusy(false)
    }
  }

  if (!isNew && (!Number.isSafeInteger(noticeId) || noticeId <= 0)) return <Back message="잘못된 공지 ID입니다." />
  if (loadError) return <Back message={loadError} />
  if (!isNew && !loaded) return <p className="muted">불러오는 중...</p>

  const status = loaded ? noticeStatus(loaded, loadedAt) : null

  return (
    <section>
      <p className="small">
        <Link to="/notices">← 공지 목록</Link>
      </p>
      <div className="row title-row">
        <h2>
          {isNew ? '새 공지' : `공지 #${noticeId}`} {status && <span className={`badge ${status.className}`}>{status.label}</span>}
        </h2>
        {!isNew && (
          <button type="button" className="danger" disabled={busy} onClick={() => void remove()}>
            삭제
          </button>
        )}
      </div>
      {loaded && (
        <p className="muted small">
          작성 {formatDateTime(loaded.createdAt)} · 수정 {formatDateTime(loaded.updatedAt)}
        </p>
      )}

      <form className="card form" onSubmit={submit}>
        <fieldset>
          <legend>내용</legend>
          <div className="grid3">
            <label>
              분류
              <select value={category} onChange={(e) => setCategory(e.target.value as NoticeCategory)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {NOTICE_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            제목 ({title.trim().length}/{TITLE_MAX})
            <input value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label>
            내용 ({content.trim().length}/{CONTENT_MAX})
            <textarea rows={12} value={content} maxLength={CONTENT_MAX} onChange={(e) => setContent(e.target.value)} required />
          </label>
        </fieldset>

        <fieldset>
          <legend>게시</legend>
          <div className="row">
            <label className="inline">
              <input type="checkbox" checked={isVisible} onChange={(e) => setIsVisible(e.target.checked)} /> 게임에 보이기
            </label>
            <label className="inline">
              <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} /> 상단 고정
            </label>
          </div>
          <div className="row">
            <span className="muted small">게시 시각</span>
            {isNew && (
              <label className="inline">
                <input type="radio" checked={publishNow} onChange={() => setPublishNow(true)} /> 지금
              </label>
            )}
            <label className="inline">
              <input type="radio" checked={!publishNow} onChange={() => setPublishNow(false)} /> {isNew ? '예약' : '지정'}
            </label>
            {!publishNow && (
              <input type="datetime-local" value={publishedLocal} onChange={(e) => setPublishedLocal(e.target.value)} />
            )}
          </div>
          <div className="row">
            <span className="muted small">게시 종료</span>
            <label className="inline">
              <input type="radio" checked={!hasEnd} onChange={() => setHasEnd(false)} /> 계속
            </label>
            <label className="inline">
              <input type="radio" checked={hasEnd} onChange={() => setHasEnd(true)} /> 종료 시각
            </label>
            {hasEnd && <input type="datetime-local" value={endsLocal} onChange={(e) => setEndsLocal(e.target.value)} />}
          </div>
          <p className="muted small">시각은 이 PC의 시간대 기준입니다. 예약한 공지는 게시 시각부터 게임에 보입니다.</p>
        </fieldset>

        {error && <p className="error">{error}</p>}
        {saved && <p className="success">{saved}</p>}
        <div className="actions">
          <button type="submit" disabled={busy}>
            {busy ? '저장 중...' : isNew ? '등록' : '저장'}
          </button>
        </div>
      </form>
    </section>
  )
}

function Back({ message }: { message: string }) {
  return (
    <section>
      <p className="small">
        <Link to="/notices">← 공지 목록</Link>
      </p>
      <p className="error">{message}</p>
    </section>
  )
}
