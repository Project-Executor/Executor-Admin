import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { createStage, deleteStage, fetchOperations, fetchStage, updateStage } from '../api/admin'
import { ApiError } from '../api/client'
import { STAGE_TYPE_LABEL } from '../api/types'
import type { AdminOperationTree, AdminStage, AdminStageRequest, StageType } from '../api/types'
import { formatDateTime } from '../components/datetime'
import MapEditor from '../components/MapEditor.tsx'
import { fromJson, newMap, toJson, validate } from '../components/mapData'
import type { GridMap } from '../components/mapData'

const TITLE_MAX = 100
const TYPES = Object.keys(STAGE_TYPE_LABEL) as StageType[]

/** 맵 데이터 JSON 검사. 문제가 있으면 { error }, 없으면 { value, hintCount } */
function parseMapData(text: string): { error: string } | { value: Record<string, unknown>; hintCount: number } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return { error: `JSON 형식이 아닙니다: ${e instanceof Error ? e.message : String(e)}` }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: '맵 데이터는 { }로 감싼 JSON 객체여야 합니다.' }
  }
  const value = parsed as Record<string, unknown>
  if ('hints' in value && !Array.isArray(value.hints)) return { error: 'hints는 배열이어야 합니다.' }
  return { value, hintCount: Array.isArray(value.hints) ? value.hints.length : 0 }
}

/** 공식 스테이지 등록(/stages/new?operationId=&stageNo=)·수정(/stages/:stageId) */
export default function StageEditPage() {
  const { stageId: param } = useParams()
  const [query] = useSearchParams()
  const isNew = param === undefined
  const stageId = Number(param)
  const navigate = useNavigate()

  const [ops, setOps] = useState<AdminOperationTree[]>([])
  const [loaded, setLoaded] = useState<AdminStage | null>(null)
  const [loadError, setLoadError] = useState('')

  const [operationId, setOperationId] = useState(query.get('operationId') ?? '')
  const [stageNo, setStageNo] = useState(query.get('stageNo') ?? '1')
  const [stageType, setStageType] = useState<StageType>('NORMAL')
  const [title, setTitle] = useState('')
  const [parMoves, setParMoves] = useState('20')
  const [rewardCoin, setRewardCoin] = useState('0')
  // 맵은 격자(grid)가 기준이고, JSON 탭에서 글로 고친 것은 격자로 돌아올 때 다시 읽는다
  const [grid, setGrid] = useState<GridMap>(() => fromJson(newMap()))
  const [gridKey, setGridKey] = useState(0)
  const [mapMode, setMapMode] = useState<'grid' | 'json'>('grid')
  const [mapText, setMapText] = useState('')
  const [mapCheck, setMapCheck] = useState('')

  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)

  function fill(s: AdminStage) {
    setLoaded(s)
    setOperationId(String(s.operationId))
    setStageNo(String(s.stageNo))
    setStageType(s.stageType)
    setTitle(s.title)
    setParMoves(String(s.parMoves))
    setRewardCoin(String(s.rewardCoin))
    replaceGrid(fromJson(s.mapData))
    setMapMode('grid')
    setMapCheck('')
  }

  /** 격자를 통째로 바꾼다 (편집기를 새로 그려 크기 입력란 등도 맞춘다) */
  function replaceGrid(next: GridMap) {
    setGrid(next)
    setGridKey((k) => k + 1)
  }

  function switchMode(next: 'grid' | 'json') {
    if (next === mapMode) return
    setError('')
    setMapCheck('')
    if (next === 'json') {
      setMapText(JSON.stringify(toJson(grid), null, 2))
      setMapMode('json')
      return
    }
    const r = parseMapData(mapText)
    if ('error' in r) {
      setError(`JSON을 고쳐야 격자로 돌아갈 수 있습니다. ${r.error}`)
      return
    }
    replaceGrid(fromJson(r.value))
    setMapMode('grid')
  }

  /** 지금 편집 중인 맵 데이터 */
  function currentMap(): ReturnType<typeof parseMapData> {
    if (mapMode === 'json') return parseMapData(mapText)
    const value = toJson(grid)
    return { value, hintCount: Array.isArray(value.hints) ? value.hints.length : 0 }
  }

  useEffect(() => {
    let cancelled = false
    fetchOperations()
      .then((res) => {
        if (!cancelled) setOps(res)
      })
      .catch(() => {
        /* 작전 목록이 없어도 ID로는 저장할 수 있다 */
      })
    if (!isNew) {
      fetchStage(stageId)
        .then((s) => {
          if (!cancelled) fill(s)
        })
        .catch((e: unknown) => {
          if (!cancelled) setLoadError(e instanceof ApiError ? e.message : String(e))
        })
    }
    return () => {
      cancelled = true
    }
  }, [isNew, stageId])

  function checkMap() {
    const r = parseMapData(mapText)
    if ('error' in r) {
      setMapCheck('')
      setError(r.error)
      return
    }
    setError('')
    setMapText(JSON.stringify(r.value, null, 2))
    setMapCheck(`올바른 JSON입니다. 힌트 ${r.hintCount}개`)
  }

  function buildRequest(): string | AdminStageRequest {
    const op = Number(operationId)
    const no = Number(stageNo)
    const par = Number(parMoves)
    const coin = Number(rewardCoin)
    const t = title.trim()
    if (!Number.isInteger(op) || op <= 0) return '작전을 고르세요.'
    if (!Number.isInteger(no) || no < 1) return '스테이지 번호는 1 이상 정수여야 합니다.'
    if (t.length < 1 || t.length > TITLE_MAX) return `제목은 1~${TITLE_MAX}자여야 합니다.`
    if (!Number.isInteger(par) || par < 1 || par > 9999) return '기준 턴은 1~9999 사이 정수여야 합니다.'
    if (!Number.isInteger(coin) || coin < 0) return '보상 코인은 0 이상 정수여야 합니다.'
    const map = currentMap()
    if ('error' in map) return map.error
    return { operationId: op, stageNo: no, stageType, title: t, mapData: map.value, parMoves: par, rewardCoin: coin }
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
    const issues = validate(fromJson(req.mapData))
    if (
      issues.length > 0 &&
      !window.confirm(
        `맵 규칙에 맞지 않는 점이 ${issues.length}개 있습니다.\n\n- ${issues.slice(0, 5).join('\n- ')}${issues.length > 5 ? '\n…' : ''}\n\n그래도 저장할까요? 게임에서 제대로 동작하지 않을 수 있습니다.`,
      )
    )
      return
    if (!isNew && !window.confirm('저장할까요? 바로 게임에 반영됩니다. 사용자들의 기존 기록은 그대로 남습니다.')) return
    setBusy(true)
    try {
      if (isNew) {
        const created = await createStage(req)
        navigate(`/stages/${created.stageId}`, { replace: true })
      } else {
        fill(await updateStage(stageId, req))
        setSaved('저장했습니다.')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!loaded) return
    if (!window.confirm(`스테이지 '${loaded.title}'을(를) 삭제할까요?\n\n사용자들의 플레이 기록도 함께 삭제되고 되돌릴 수 없습니다.`)) return
    setBusy(true)
    try {
      await deleteStage(stageId)
      navigate(`/stages?op=${loaded.operationId}`, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
      setBusy(false)
    }
  }

  const backTo = operationId ? `/stages?op=${operationId}` : '/stages'
  if (!isNew && (!Number.isSafeInteger(stageId) || stageId <= 0)) return <Back to="/stages" message="잘못된 스테이지 ID입니다." />
  if (loadError) return <Back to="/stages" message={loadError} />
  if (!isNew && !loaded) return <p className="muted">불러오는 중...</p>

  return (
    <section>
      <p className="small">
        <Link to={backTo}>← 작전·스테이지</Link>
      </p>
      <div className="row title-row">
        <h2>{isNew ? '새 스테이지' : `스테이지 #${stageId}`}</h2>
        {!isNew && (
          <button type="button" className="danger" disabled={busy} onClick={() => void remove()}>
            삭제
          </button>
        )}
      </div>
      {loaded && (
        <p className="muted small">
          등록 {formatDateTime(loaded.createdAt)} · 수정 {formatDateTime(loaded.updatedAt)} · 힌트 {loaded.hintCount}개
        </p>
      )}

      <form className="card form" onSubmit={submit}>
        <fieldset>
          <legend>기본 정보</legend>
          <div className="grid3">
            <label>
              작전
              <select value={operationId} onChange={(e) => setOperationId(e.target.value)}>
                <option value="">고르세요</option>
                {ops.map((o) => (
                  <option key={o.operationId} value={o.operationId}>
                    {o.sortOrder}. {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              번호 (작전 안에서 겹치면 안 됨)
              <input type="number" min={1} step={1} value={stageNo} onChange={(e) => setStageNo(e.target.value)} />
            </label>
            <label>
              종류
              <select value={stageType} onChange={(e) => setStageType(e.target.value as StageType)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {STAGE_TYPE_LABEL[t]} ({t})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            제목 ({title.trim().length}/{TITLE_MAX})
            <input value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <div className="grid3">
            <label>
              기준 턴 (1~9999)
              <input type="number" min={1} max={9999} step={1} value={parMoves} onChange={(e) => setParMoves(e.target.value)} />
            </label>
            <label>
              클리어 보상 코인
              <input type="number" min={0} step={1} value={rewardCoin} onChange={(e) => setRewardCoin(e.target.value)} />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>맵</legend>
          <div className="tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mapMode === 'grid'}
              className={mapMode === 'grid' ? 'tab active' : 'tab'}
              onClick={() => switchMode('grid')}
            >
              격자 편집
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mapMode === 'json'}
              className={mapMode === 'json' ? 'tab active' : 'tab'}
              onClick={() => switchMode('json')}
            >
              JSON 직접 편집
            </button>
          </div>
          {mapMode === 'grid' ? (
            <>
              <MapEditor key={gridKey} map={grid} onChange={setGrid} />
              <p className="muted small">
                지형·시작 위치·오브젝트는 여기서 고칩니다. 대화(dialogues)·안내(guides)·나레이션(story)·힌트(hints)는 ‘JSON 직접 편집’에서 고치고,
                격자에서 고쳐도 그대로 유지됩니다.
              </p>
            </>
          ) : (
            <>
              <p className="muted small">
                Executor-Server <code>docs/map-data.md</code> 형식입니다. ‘격자 편집’으로 돌아가면 이 JSON을 다시 읽습니다 (지형은 벽{' '}
                <code>#</code>과 바닥 <code>.</code>만 지원).
              </p>
              <textarea
                className="code"
                rows={24}
                spellCheck={false}
                value={mapText}
                onChange={(e) => {
                  setMapText(e.target.value)
                  setMapCheck('')
                }}
              />
              <div className="row">
                <button type="button" className="secondary" onClick={checkMap}>
                  검사·정렬
                </button>
                {mapCheck && <span className="success small">{mapCheck}</span>}
              </div>
            </>
          )}
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

function Back({ to, message }: { to: string; message: string }) {
  return (
    <section>
      <p className="small">
        <Link to={to}>← 작전·스테이지</Link>
      </p>
      <p className="error">{message}</p>
    </section>
  )
}
