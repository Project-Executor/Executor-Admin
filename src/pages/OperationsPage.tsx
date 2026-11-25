import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  createLayer,
  createOperation,
  deleteLayer,
  deleteOperation,
  deleteStage,
  fetchLayers,
  fetchOperations,
  updateLayer,
  updateOperation,
} from '../api/admin'
import { ApiError } from '../api/client'
import { STAGE_TYPE_LABEL } from '../api/types'
import type { AdminLayer, AdminOperationTree, AdminStageSummary } from '../api/types'
import { formatDateTime } from '../components/datetime'
import { StageBoardEditor, boardKey } from '../components/StageBoardEditor'

const NAME_MAX = 100
const DESC_MAX = 255

/** 레이어 이름 표시: "L0 · Tutorial" */
/** 순서가 음수인 레이어는 비공개 (게임에 보이지 않는다) */
const layerLabel = (l: AdminLayer) => `L${l.sortOrder} · ${l.name}${l.sortOrder < 0 ? ' (비공개)' : ''}`

/**
 * 레이어·작전·스테이지. 왼쪽은 레이어(대주제) 아래 작전(소주제)이 들어간 트리, 오른쪽은 고른 것의 정보.
 * 선택은 주소에 남는다: ?layer=ID (레이어) 또는 ?op=ID (작전)
 */
export default function OperationsPage() {
  const [layers, setLayers] = useState<AdminLayer[] | null>(null)
  const [ops, setOps] = useState<AdminOperationTree[] | null>(null)
  const [error, setError] = useState('')
  const [params, setParams] = useSearchParams()
  /** 새로 만드는 중: 레이어, 또는 작전(그 레이어 ID) */
  const [creating, setCreating] = useState<{ kind: 'layer' } | { kind: 'op'; layerId: number } | null>(null)

  const reload = useCallback(async () => {
    try {
      const [l, o] = await Promise.all([fetchLayers(), fetchOperations()])
      setLayers(l)
      setOps(o)
      setError('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchLayers(), fetchOperations()])
      .then(([l, o]) => {
        if (cancelled) return
        setLayers(l)
        setOps(o)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedOp = ops?.find((o) => o.operationId === Number(params.get('op'))) ?? null
  const selectedLayer = layers?.find((l) => l.layerId === Number(params.get('layer'))) ?? null
  // 아무것도 고르지 않았으면 첫 작전
  const shownOp = !creating && !selectedLayer ? selectedOp ?? ops?.[0] ?? null : null

  function selectOp(operationId: number) {
    setCreating(null)
    setParams({ op: String(operationId) })
  }

  function selectLayer(layerId: number) {
    setCreating(null)
    setParams({ layer: String(layerId) })
  }

  const opsOf = (layerId: number) => (ops ?? []).filter((o) => o.layerId === layerId)
  const nextOpOrder = (layerId: number) => {
    const list = opsOf(layerId)
    return list.length > 0 ? Math.max(...list.map((o) => o.sortOrder)) + 1 : 1
  }
  const nextLayerOrder = layers && layers.length > 0 ? Math.max(...layers.map((l) => l.sortOrder)) + 1 : 0

  return (
    <section className="wide">
      <h2>레이어·작전·스테이지</h2>
      <p className="muted">
        스토리는 레이어(대주제) 안에 작전(소주제)이 들어가는 구조입니다. 공식 스테이지는 레이어 순서 → 작전 순서 → 스테이지 번호로 한 줄로 이어서 플레이하고,
        앞 스테이지를 깨야 다음이 열립니다. 튜토리얼은 레이어 0입니다.
      </p>
      {error && <p className="error">{error}</p>}

      <div className="split">
        <aside className="card list-pane">
          <div className="row title-row">
            <h3 className="card-title">레이어 · 작전</h3>
            <button type="button" className="small-btn" onClick={() => setCreating({ kind: 'layer' })}>
              새 레이어
            </button>
          </div>
          {(!layers || !ops) && !error && <p className="muted small">불러오는 중...</p>}
          {layers?.length === 0 && <p className="muted small">레이어가 없습니다. 먼저 레이어를 만드세요.</p>}
          <ul className="pick-list tree">
            {layers?.map((l) => (
              <li key={l.layerId}>
                <button
                  type="button"
                  className={!creating && selectedLayer?.layerId === l.layerId ? 'pick layer active' : 'pick layer'}
                  onClick={() => selectLayer(l.layerId)}
                >
                  <span>📁 {layerLabel(l)}</span>
                  <small className="muted">작전 {l.operationCount}</small>
                </button>
                <ul className="pick-list">
                  {opsOf(l.layerId).map((o) => (
                    <li key={o.operationId}>
                      <button
                        type="button"
                        className={shownOp?.operationId === o.operationId ? 'pick op active' : 'pick op'}
                        onClick={() => selectOp(o.operationId)}
                      >
                        <span>
                          <small className="muted">{o.sortOrder}.</small> {o.name}
                        </span>
                        <small className="muted">{o.stages.length}개</small>
                      </button>
                    </li>
                  ))}
                  <li>
                    <button type="button" className="pick op add" onClick={() => setCreating({ kind: 'op', layerId: l.layerId })}>
                      + 이 레이어에 작전 추가
                    </button>
                  </li>
                </ul>
              </li>
            ))}
          </ul>
        </aside>

        <div className="detail-pane">
          {creating?.kind === 'layer' ? (
            <LayerForm
              key="new-layer"
              layer={null}
              defaultSortOrder={nextLayerOrder}
              onSaved={async (id) => {
                await reload()
                selectLayer(id)
              }}
              onCancel={() => setCreating(null)}
            />
          ) : creating?.kind === 'op' ? (
            <OperationForm
              key={`new-op-${creating.layerId}`}
              operation={null}
              layers={layers ?? []}
              defaultLayerId={creating.layerId}
              defaultSortOrder={nextOpOrder(creating.layerId)}
              onSaved={async (id) => {
                await reload()
                selectOp(id)
              }}
              onCancel={() => setCreating(null)}
            />
          ) : selectedLayer ? (
            <>
              <LayerForm
                key={selectedLayer.layerId}
                layer={selectedLayer}
                defaultSortOrder={selectedLayer.sortOrder}
                onSaved={reload}
                onDeleted={async () => {
                  setParams({})
                  await reload()
                }}
              />
              <div className="card">
                <div className="row title-row">
                  <h3 className="card-title">이 레이어의 작전 ({opsOf(selectedLayer.layerId).length})</h3>
                  <button type="button" className="small-btn" onClick={() => setCreating({ kind: 'op', layerId: selectedLayer.layerId })}>
                    작전 추가
                  </button>
                </div>
                {opsOf(selectedLayer.layerId).length === 0 ? (
                  <p className="muted small">작전이 없습니다.</p>
                ) : (
                  <ul className="plain-list">
                    {opsOf(selectedLayer.layerId).map((o) => (
                      <li key={o.operationId}>
                        <button type="button" className="link-btn" onClick={() => selectOp(o.operationId)}>
                          {o.sortOrder}. {o.name}
                        </button>{' '}
                        <small className="muted">스테이지 {o.stages.length}개</small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : shownOp ? (
            <>
              <OperationForm
                key={shownOp.operationId}
                operation={shownOp}
                layers={layers ?? []}
                defaultLayerId={shownOp.layerId}
                defaultSortOrder={shownOp.sortOrder}
                onSaved={reload}
                onDeleted={async () => {
                  setParams({})
                  await reload()
                }}
              />
              <StageList operation={shownOp} onChanged={reload} />
              <StageBoardEditor key={boardKey(shownOp)} operation={shownOp} onSaved={reload} />
            </>
          ) : (
            ops && <p className="muted">왼쪽에서 레이어나 작전을 고르거나 새로 만드세요.</p>
          )}
        </div>
      </div>
    </section>
  )
}

function LayerForm({
  layer,
  defaultSortOrder,
  onSaved,
  onDeleted,
  onCancel,
}: {
  layer: AdminLayer | null
  defaultSortOrder: number
  onSaved: (layerId: number) => Promise<void> | void
  onDeleted?: () => Promise<void>
  onCancel?: () => void
}) {
  const [name, setName] = useState(layer?.name ?? '')
  const [description, setDescription] = useState(layer?.description ?? '')
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
    if (layer && order !== layer.sortOrder && !window.confirm('레이어 순서를 바꾸면 해금 순서도 바뀝니다. 바꿀까요?')) return
    const req = { name: n, description: description.trim() || null, sortOrder: order }
    setBusy(true)
    try {
      const res = layer ? await updateLayer(layer.layerId, req) : await createLayer(req)
      setSaved(layer ? '저장했습니다.' : '')
      await onSaved(res.layerId)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!layer || !onDeleted) return
    if (layer.operationCount > 0) {
      setError(`작전이 ${layer.operationCount}개 남아 있어 삭제할 수 없습니다. 작전을 다른 레이어로 옮기거나 지우세요.`)
      return
    }
    if (!window.confirm(`레이어 '${layer.name}'을(를) 삭제할까요?`)) return
    setBusy(true)
    try {
      await deleteLayer(layer.layerId)
      await onDeleted()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <form className="card form compact" onSubmit={submit}>
      <div className="row title-row">
        <h3 className="card-title">{layer ? `📁 레이어 #${layer.layerId}` : '새 레이어'}</h3>
        {layer ? (
          <button type="button" className="danger small-btn" disabled={busy} onClick={() => void remove()}>
            레이어 삭제
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
          순서 (0 = 튜토리얼, -1 이하 = 비공개)
          <input type="number" min={-999} step={1} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </label>
      </div>
      <label>
        설명 ({description.trim().length}/{DESC_MAX}, 선택. 게임 트리에 함께 보입니다)
        <input value={description} maxLength={DESC_MAX} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      {saved && <p className="success">{saved}</p>}
      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? '저장 중...' : layer ? '저장' : '등록'}
        </button>
      </div>
    </form>
  )
}

function OperationForm({
  operation,
  layers,
  defaultLayerId,
  defaultSortOrder,
  onSaved,
  onDeleted,
  onCancel,
}: {
  operation: AdminOperationTree | null
  layers: AdminLayer[]
  defaultLayerId: number
  defaultSortOrder: number
  onSaved: (operationId: number) => Promise<void> | void
  onDeleted?: () => Promise<void>
  onCancel?: () => void
}) {
  const [name, setName] = useState(operation?.name ?? '')
  const [description, setDescription] = useState(operation?.description ?? '')
  const [sortOrder, setSortOrder] = useState(String(defaultSortOrder))
  const [layerId, setLayerId] = useState(String(defaultLayerId))
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
    const layer = Number(layerId)
    if (!layers.some((l) => l.layerId === layer)) return setError('레이어를 고르세요.')
    if (operation && layer !== operation.layerId && !window.confirm('다른 레이어로 옮기면 해금 순서도 바뀝니다. 옮길까요?')) return
    const req = { name: n, description: description.trim() || null, sortOrder: order, layerId: layer }
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
        <h3 className="card-title">{operation ? `📄 작전 #${operation.operationId}` : '새 작전'}</h3>
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
          레이어 안 순서 (튜토리얼 = 0)
          <input type="number" min={0} step={1} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </label>
      </div>
      <label>
        레이어
        <select value={layerId} onChange={(e) => setLayerId(e.target.value)}>
          {layers.map((l) => (
            <option key={l.layerId} value={l.layerId}>
              {layerLabel(l)}
            </option>
          ))}
        </select>
      </label>
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
