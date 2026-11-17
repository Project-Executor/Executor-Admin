import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { createOperation, deleteOperation, deleteStage, fetchOperations, updateOperation } from '../api/admin'
import { ApiError } from '../api/client'
import { STAGE_TYPE_LABEL } from '../api/types'
import type { AdminOperationTree, AdminStageSummary } from '../api/types'
import { formatDateTime } from '../components/datetime'

const NAME_MAX = 100
const DESC_MAX = 255

/** 작전·스테이지: 왼쪽 작전 목록, 오른쪽 선택한 작전의 정보와 스테이지 (선택은 ?op=ID) */
export default function OperationsPage() {
  const [ops, setOps] = useState<AdminOperationTree[] | null>(null)
  const [error, setError] = useState('')
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)

  const reload = useCallback(async () => {
    try {
      setOps(await fetchOperations())
      setError('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchOperations()
      .then((res) => {
        if (!cancelled) setOps(res)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedId = Number(params.get('op'))
  const selected = ops?.find((o) => o.operationId === selectedId) ?? ops?.[0] ?? null

  function select(operationId: number) {
    setCreating(false)
    setParams({ op: String(operationId) })
  }

  const nextSortOrder = ops && ops.length > 0 ? Math.max(...ops.map((o) => o.sortOrder)) + 1 : 0

  return (
    <section className="wide">
      <h2>작전·스테이지</h2>
      <p className="muted">
        공식 스테이지는 작전 순서 → 스테이지 번호 순으로 플레이하고, 앞 스테이지를 깨야 다음이 열립니다. 튜토리얼 작전의 순서는 0입니다.
      </p>
      {error && <p className="error">{error}</p>}

      <div className="split">
        <aside className="card list-pane">
          <div className="row title-row">
            <h3 className="card-title">작전</h3>
            <button type="button" className="small-btn" onClick={() => setCreating(true)}>
              새 작전
            </button>
          </div>
          {!ops && !error && <p className="muted small">불러오는 중...</p>}
          {ops?.length === 0 && <p className="muted small">작전이 없습니다.</p>}
          <ul className="pick-list">
            {ops?.map((o) => (
              <li key={o.operationId}>
                <button
                  type="button"
                  className={!creating && selected?.operationId === o.operationId ? 'pick active' : 'pick'}
                  onClick={() => select(o.operationId)}
                >
                  <span>
                    <small className="muted">{o.sortOrder}.</small> {o.name}
                  </span>
                  <small className="muted">{o.stages.length}개</small>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="detail-pane">
          {creating ? (
            <OperationForm
              key="new"
              operation={null}
              defaultSortOrder={nextSortOrder}
              onSaved={async (id) => {
                await reload()
                select(id)
              }}
              onCancel={() => setCreating(false)}
            />
          ) : selected ? (
            <>
              <OperationForm
                key={selected.operationId}
                operation={selected}
                defaultSortOrder={selected.sortOrder}
                onSaved={reload}
                onDeleted={async () => {
                  setParams({})
                  await reload()
                }}
              />
              <StageList operation={selected} onChanged={reload} />
            </>
          ) : (
            ops && <p className="muted">왼쪽에서 작전을 고르거나 새로 만드세요.</p>
          )}
        </div>
      </div>
    </section>
  )
}

function OperationForm({
  operation,
  defaultSortOrder,
  onSaved,
  onDeleted,
  onCancel,
}: {
  operation: AdminOperationTree | null
  defaultSortOrder: number
  onSaved: (operationId: number) => Promise<void> | void
  onDeleted?: () => Promise<void>
  onCancel?: () => void
}) {
  const [name, setName] = useState(operation?.name ?? '')
  const [description, setDescription] = useState(operation?.description ?? '')
  const [sortOrder, setSortOrder] = useState(String(defaultSortOrder))
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaved('')
    const n = name.trim()
    const order = Number(sortOrder)
    if (n.length < 1 || n.length > NAME_MAX) return setError(`이름은 1~${NAME_MAX}자여야 합니다.`)
    if (!Number.isInteger(order) || order < 0) return setError('순서는 0 이상 정수여야 합니다.')
    const req = { name: n, description: description.trim() || null, sortOrder: order }
    setBusy(true)
    try {
      const res = operation ? await updateOperation(operation.operationId, req) : await createOperation(req)
      setSaved(operation ? '저장했습니다.' : '')
      await onSaved(res.operationId)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!operation || !onDeleted) return
    if (operation.stages.length > 0) {
      setError(`스테이지가 ${operation.stages.length}개 남아 있어 삭제할 수 없습니다. 스테이지를 먼저 지우세요.`)
      return
    }
    if (!window.confirm(`작전 '${operation.name}'을(를) 삭제할까요?`)) return
    setBusy(true)
    try {
      await deleteOperation(operation.operationId)
      await onDeleted()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <form className="card form compact" onSubmit={submit}>
      <div className="row title-row">
        <h3 className="card-title">{operation ? `작전 #${operation.operationId}` : '새 작전'}</h3>
        {operation ? (
          <button type="button" className="danger small-btn" disabled={busy} onClick={() => void remove()}>
            작전 삭제
          </button>
        ) : (
          <button type="button" className="secondary small-btn" onClick={onCancel}>
            취소
          </button>
        )}
      </div>
      <div className="grid3">
        <label className="span2">
          이름 ({name.trim().length}/{NAME_MAX})
          <input value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          순서 (0 = 튜토리얼)
          <input type="number" min={0} step={1} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </label>
      </div>
      <label>
        설명 ({description.trim().length}/{DESC_MAX}, 선택)
        <input value={description} maxLength={DESC_MAX} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      {saved && <p className="success">{saved}</p>}
      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? '저장 중...' : operation ? '저장' : '등록'}
        </button>
      </div>
    </form>
  )
}

function StageList({ operation, onChanged }: { operation: AdminOperationTree; onChanged: () => Promise<void> }) {
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const nextNo = operation.stages.length > 0 ? Math.max(...operation.stages.map((s) => s.stageNo)) + 1 : 1

  async function remove(s: AdminStageSummary) {
    if (!window.confirm(`스테이지 ${s.stageNo} '${s.title}'을(를) 삭제할까요?\n\n사용자들의 플레이 기록도 함께 삭제되고 되돌릴 수 없습니다.`)) return
    setError('')
    setBusyId(s.stageId)
    try {
      await deleteStage(s.stageId)
      await onChanged()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="card table-wrap">
      <div className="row title-row table-head">
        <h3 className="card-title">스테이지 ({operation.stages.length})</h3>
        <Link
          to={`/stages/new?operationId=${operation.operationId}&stageNo=${nextNo}`}
          className="button small-btn"
        >
          새 스테이지
        </Link>
      </div>
      {error && <p className="error table-msg">{error}</p>}
      <table className="table">
        <thead>
          <tr>
            <th className="num">번호</th>
            <th>종류</th>
            <th>제목</th>
            <th className="num">기준 턴</th>
            <th className="num">보상</th>
            <th>수정</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {operation.stages.map((s) => (
            <tr key={s.stageId}>
              <td className="num">{s.stageNo}</td>
              <td>{STAGE_TYPE_LABEL[s.stageType]}</td>
              <td className="wrap">
                <Link to={`/stages/${s.stageId}`}>{s.title}</Link> <small className="muted">#{s.stageId}</small>
              </td>
              <td className="num">{s.parMoves}</td>
              <td className="num">{s.rewardCoin.toLocaleString()}</td>
              <td className="nowrap muted small">{formatDateTime(s.updatedAt)}</td>
              <td className="actions-cell">
                <div className="row nowrap-row">
                  <Link to={`/stages/${s.stageId}`} className="button secondary small-btn">
                    편집
                  </Link>
                  <button
                    type="button"
                    className="danger small-btn"
                    disabled={busyId === s.stageId}
                    onClick={() => void remove(s)}
                  >
                    삭제
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {operation.stages.length === 0 && (
            <tr>
              <td colSpan={7} className="empty muted">
                스테이지가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
