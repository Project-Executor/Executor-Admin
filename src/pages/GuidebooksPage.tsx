import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { createGuidebook, deleteGuidebook, fetchGuidebooks, fetchOperations, updateGuidebook } from '../api/admin'
import { ApiError } from '../api/client'
import { GUIDEBOOK_CATEGORY_LABEL } from '../api/types'
import type { AdminGuidebook, AdminGuidebookRequest, AdminOperationTree, GuidebookCategory } from '../api/types'

const TITLE_MAX = 255
const IMAGE_MAX = 255
const COMMENT_MAX = 10000
const CATEGORIES = Object.keys(GUIDEBOOK_CATEGORY_LABEL) as GuidebookCategory[]

/** 도감 관리: 목록, 등록, 수정, 삭제 (/api/admin/guidebooks) */
export default function GuidebooksPage() {
  const [items, setItems] = useState<AdminGuidebook[] | null>(null)
  const [ops, setOps] = useState<AdminOperationTree[]>([])
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<GuidebookCategory | ''>('')
  /** null이면 폼 닫힘, 'new'면 등록, 항목이면 수정 */
  const [editing, setEditing] = useState<AdminGuidebook | 'new' | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchGuidebooks()
      .then(setItems)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : String(e)))
    fetchOperations()
      .then(setOps)
      .catch(() => {
        /* 스테이지 이름 표시만 못 할 뿐 도감 관리는 된다 */
      })
  }, [])

  /** stageId -> "작전 이름 3. 스테이지 제목" */
  const stageNames = new Map<number, string>()
  for (const o of ops) for (const s of o.stages) stageNames.set(s.stageId, `${o.name} ${s.stageNo}. ${s.title}`)

  function open(target: AdminGuidebook | 'new') {
    setEditing(target)
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function upsert(g: AdminGuidebook) {
    setItems((prev) => {
      if (!prev) return [g]
      return prev.some((i) => i.guidebookId === g.guidebookId)
        ? prev.map((i) => (i.guidebookId === g.guidebookId ? g : i))
        : [...prev, g].sort((a, b) => a.guidebookId - b.guidebookId)
    })
  }

  const rows = (items ?? []).filter((g) => !filter || g.category === filter)

  return (
    <section>
      <div className="row title-row">
        <h2>도감</h2>
        <button type="button" onClick={() => open('new')}>
          새 항목
        </button>
      </div>
      <p className="muted">
        게임이 플레이 결과에 &lsquo;이번 판에서 만난 도감 ID&rsquo;를 보내면 그 항목이 해금됩니다 (클리어하지 못해도). 해금
        스테이지는 처음 등장하는 곳을 적어 두는 정보입니다. 맵 데이터에서 쓰는 도감 ID는 아래 표의 ID입니다.
      </p>

      <div ref={formRef}>
        {editing && (
          <GuidebookForm
            key={editing === 'new' ? 'new' : editing.guidebookId}
            item={editing === 'new' ? null : editing}
            ops={ops}
            onSaved={(g) => {
              upsert(g)
              setEditing(g)
            }}
            onDeleted={(id) => {
              setItems((prev) => prev?.filter((i) => i.guidebookId !== id) ?? null)
              setEditing(null)
            }}
            onClose={() => setEditing(null)}
          />
        )}
      </div>

      <div className="tabs" role="tablist">
        {[{ value: '' as const, label: '전체' }, ...CATEGORIES.map((c) => ({ value: c, label: GUIDEBOOK_CATEGORY_LABEL[c] }))].map(
          (t) => (
            <button
              key={t.label}
              type="button"
              role="tab"
              aria-selected={filter === t.value}
              className={filter === t.value ? 'tab active' : 'tab'}
              onClick={() => setFilter(t.value)}
            >
              {t.label}
              {items && <small className="muted"> {items.filter((i) => !t.value || i.category === t.value).length}</small>}
            </button>
          ),
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="num">ID</th>
              <th>분류</th>
              <th>이름</th>
              <th>처음 등장</th>
              <th>내용</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.guidebookId} className={editing !== 'new' && editing?.guidebookId === g.guidebookId ? 'selected' : ''}>
                <td className="num">{g.guidebookId}</td>
                <td>{GUIDEBOOK_CATEGORY_LABEL[g.category]}</td>
                <td>
                  {g.title}
                  {g.image && <div className="muted small">{g.image}</div>}
                </td>
                <td className="wrap">
                  {g.stageId === null ? (
                    <span className="muted">없음</span>
                  ) : (
                    <Link to={`/stages/${g.stageId}`}>{stageNames.get(g.stageId) ?? `#${g.stageId}`}</Link>
                  )}
                </td>
                <td className="wrap muted small">
                  <div className="clamp">{g.comment}</div>
                </td>
                <td className="actions-cell">
                  <button type="button" className="secondary small-btn" onClick={() => open(g)}>
                    수정
                  </button>
                </td>
              </tr>
            ))}
            {items && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="empty muted">
                  도감 항목이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {!items && !error && <p className="muted small loading">불러오는 중...</p>}
      </div>
    </section>
  )
}

function GuidebookForm({
  item,
  ops,
  onSaved,
  onDeleted,
  onClose,
}: {
  item: AdminGuidebook | null
  ops: AdminOperationTree[]
  onSaved: (g: AdminGuidebook) => void
  onDeleted: (guidebookId: number) => void
  onClose: () => void
}) {
  const [category, setCategory] = useState<GuidebookCategory>(item?.category ?? 'BUG')
  const [title, setTitle] = useState(item?.title ?? '')
  const [stageId, setStageId] = useState(item?.stageId == null ? '' : String(item.stageId))
  const [image, setImage] = useState(item?.image ?? '')
  const [comment, setComment] = useState(item?.comment ?? '')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaved('')
    const t = title.trim()
    const c = comment.trim()
    if (t.length < 1 || t.length > TITLE_MAX) return setError(`이름은 1~${TITLE_MAX}자여야 합니다.`)
    if (c.length < 1 || c.length > COMMENT_MAX) return setError(`내용은 1~${COMMENT_MAX}자여야 합니다.`)
    const req: AdminGuidebookRequest = {
      stageId: stageId ? Number(stageId) : null,
      category,
      title: t,
      image: image.trim() || null,
      comment: c,
    }
    setBusy(true)
    try {
      const res = item ? await updateGuidebook(item.guidebookId, req) : await createGuidebook(req)
      onSaved(res)
      setSaved(item ? '저장했습니다.' : `등록했습니다. (#${res.guidebookId})`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!item) return
    if (!window.confirm(`'${item.title}'을(를) 삭제할까요?\n\n사용자들의 해금 기록도 함께 삭제되고 되돌릴 수 없습니다.`)) return
    setBusy(true)
    try {
      await deleteGuidebook(item.guidebookId)
      onDeleted(item.guidebookId)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
      setBusy(false)
    }
  }

  // 지금 연결된 스테이지가 목록에 없으면(불러오기 실패 등) ID로라도 보여 준다
  const knownStage = stageId === '' || ops.some((o) => o.stages.some((s) => String(s.stageId) === stageId))

  return (
    <form className="card form compact" onSubmit={submit}>
      <div className="row title-row">
        <h3 className="card-title">{item ? `도감 수정 #${item.guidebookId}` : '새 도감 항목'}</h3>
        <div className="row nowrap-row">
          {item && (
            <button type="button" className="danger small-btn" disabled={busy} onClick={() => void remove()}>
              삭제
            </button>
          )}
          <button type="button" className="secondary small-btn" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
      <div className="grid3">
        <label>
          분류
          <select value={category} onChange={(e) => setCategory(e.target.value as GuidebookCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {GUIDEBOOK_CATEGORY_LABEL[c]} ({c})
              </option>
            ))}
          </select>
        </label>
        <label className="span2">
          이름 ({title.trim().length}/{TITLE_MAX})
          <input value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} required />
        </label>
      </div>
      <div className="grid3">
        <label className="span2">
          처음 등장하는 스테이지 (선택)
          <select value={stageId} onChange={(e) => setStageId(e.target.value)}>
            <option value="">없음</option>
            {!knownStage && <option value={stageId}>#{stageId}</option>}
            {ops.map((o) => (
              <optgroup key={o.operationId} label={`${o.sortOrder}. ${o.name}`}>
                {o.stages.map((s) => (
                  <option key={s.stageId} value={s.stageId}>
                    {s.stageNo}. {s.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          이미지 (경로나 키, 선택)
          <input value={image} maxLength={IMAGE_MAX} onChange={(e) => setImage(e.target.value)} />
        </label>
      </div>
      <label>
        내용 ({comment.trim().length.toLocaleString()}/{COMMENT_MAX.toLocaleString()})
        <textarea rows={8} value={comment} maxLength={COMMENT_MAX} onChange={(e) => setComment(e.target.value)} required />
      </label>
      {error && <p className="error">{error}</p>}
      {saved && <p className="success">{saved}</p>}
      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? '저장 중...' : item ? '저장' : '등록'}
        </button>
      </div>
    </form>
  )
}
