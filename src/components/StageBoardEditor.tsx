import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { placeStages } from '../api/admin'
import { ApiError } from '../api/client'
import type { AdminOperationTree } from '../api/types'
import {
  BOARD_H,
  BOARD_W,
  BOUNDS,
  NODE_HALF,
  clampToBoard,
  defaultCenter,
  fromRatio,
  toRatio,
  wirePoints,
} from './stageBoard'
import type { Point } from './stageBoard'

/** 스테이지 id -> 직접 놓은 자리 (없으면 자동 배치) */
type Placement = Record<number, Point | null>

const GRID = 8

function savedPlacement(op: AdminOperationTree): Placement {
  const map: Placement = {}
  for (const s of op.stages) {
    map[s.stageId] = s.boardX != null && s.boardY != null ? fromRatio(s.boardX, s.boardY) : null
  }
  return map
}

/** 작전과 저장된 배치가 같으면 같은 값. 바뀌면 편집기를 새로 만든다 */
export const boardKey = (op: AdminOperationTree) =>
  `${op.operationId}:` + op.stages.map((s) => `${s.stageId}@${s.boardX ?? '-'},${s.boardY ?? '-'}`).join('|')

const samePoint = (a: Point | null, b: Point | null) =>
  a === b || (a != null && b != null && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01)

/**
 * 게임 스테이지 선택 화면(회로 기판)에 노드가 놓일 자리를 정한다.
 * 노드를 끌어 옮기고 [배치 저장]을 누르면 게임에 바로 반영된다. 점선 노드는 자동 배치(기본 지그재그).
 * 저장된 배치가 바뀌면 새로 그리도록 부모가 boardKey(operation)를 key로 준다.
 */
export function StageBoardEditor({ operation, onSaved }: { operation: AdminOperationTree; onSaved: () => Promise<void> }) {
  const [placed, setPlaced] = useState<Placement>(() => savedPlacement(operation))
  const [snap, setSnap] = useState(true)
  const [drag, setDrag] = useState<{ stageId: number; dx: number; dy: number } | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  const stages = operation.stages
  const original = savedPlacement(operation)
  const dirty = stages.some((s) => !samePoint(placed[s.stageId] ?? null, original[s.stageId] ?? null))
  const centers = stages.map((s, i) => placed[s.stageId] ?? defaultCenter(i, stages.length))
  const isPlaced = (stageId: number) => placed[stageId] != null

  function toBoard(e: ReactPointerEvent): Point {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return { x: 0, y: 0 }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  function startDrag(e: ReactPointerEvent<SVGGElement>, stageId: number, center: Point) {
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    const p = toBoard(e)
    setDrag({ stageId, dx: p.x - center.x, dy: p.y - center.y })
    setSaved('')
  }

  function moveDrag(e: ReactPointerEvent) {
    if (!drag) return
    const p = toBoard(e)
    let next = clampToBoard({ x: p.x - drag.dx, y: p.y - drag.dy })
    if (snap) next = clampToBoard({ x: Math.round(next.x / GRID) * GRID, y: Math.round(next.y / GRID) * GRID })
    setPlaced((prev) => ({ ...prev, [drag.stageId]: next }))
  }

  /** 지금 보이는 자리 그대로 전부 고정 (자동 배치 노드도 그 자리에 고정된다) */
  function pinAll() {
    const next: Placement = {}
    stages.forEach((s, i) => (next[s.stageId] = clampToBoard(placed[s.stageId] ?? defaultCenter(i, stages.length))))
    setPlaced(next)
    setSaved('')
  }

  function resetAll() {
    const next: Placement = {}
    stages.forEach((s) => (next[s.stageId] = null))
    setPlaced(next)
    setSaved('')
  }

  async function save() {
    setError('')
    setSaved('')
    const positions = stages
      .filter((s) => !samePoint(placed[s.stageId] ?? null, original[s.stageId] ?? null))
      .map((s) => {
        const p = placed[s.stageId]
        if (!p) return { stageId: s.stageId, x: null, y: null }
        const r = toRatio(p)
        return { stageId: s.stageId, x: r.x, y: r.y }
      })
    if (positions.length === 0) return
    setBusy(true)
    try {
      await placeStages(operation.operationId, positions)
      await onSaved()
      setSaved('배치를 저장했습니다. 게임에서 이 작전을 다시 열면 바로 보입니다.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card stage-board-card">
      <div className="row title-row">
        <h3 className="card-title">스테이지 선택 화면 배치</h3>
        <div className="row nowrap-row">
          <label className="inline-check small">
            <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> 격자에 맞추기
          </label>
          <button type="button" className="secondary small-btn" disabled={busy || stages.length === 0} onClick={pinAll}>
            지금 자리로 전부 고정
          </button>
          <button type="button" className="secondary small-btn" disabled={busy || stages.length === 0} onClick={resetAll}>
            전부 자동 배치
          </button>
        </div>
      </div>
      <p className="muted small">
        게임에서 작전을 골랐을 때 가운데 기판에 보이는 스테이지 노드 자리입니다. 노드를 끌어 옮기세요. 점선 노드는 자동
        배치(기본 지그재그)이고, 한 번 옮기면 그 자리에 고정됩니다. 선은 번호 순으로 이어집니다.
      </p>
      {stages.length === 0 ? (
        <p className="muted small">스테이지가 없습니다.</p>
      ) : (
        <div className="stage-board-wrap">
          <svg
            ref={svgRef}
            className={drag ? 'stage-board dragging' : 'stage-board'}
            viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
            onPointerMove={moveDrag}
            onPointerUp={() => setDrag(null)}
            onPointerCancel={() => setDrag(null)}
            role="img"
            aria-label={`${operation.name} 스테이지 배치`}
          >
            <defs>
              <pattern id="stage-board-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <rect width="32" height="32" fill="#121a3c" />
                <path d="M0 0H32M0 0V32" stroke="#0e1532" strokeWidth="2" />
              </pattern>
            </defs>
            <rect width={BOARD_W} height={BOARD_H} fill="url(#stage-board-grid)" />
            {/* 노드를 놓을 수 있는 범위 */}
            <rect
              x={BOUNDS.minX - NODE_HALF}
              y={BOUNDS.minY - NODE_HALF}
              width={BOUNDS.maxX - BOUNDS.minX + NODE_HALF * 2}
              height={BOUNDS.maxY - BOUNDS.minY + NODE_HALF * 2 + 40}
              fill="none"
              stroke="#2a3566"
              strokeDasharray="4 4"
            />
            <text x={24} y={40} fill="#e6ecff" fontSize={24} fontWeight={700}>
              {operation.name}
            </text>
            <text x={24} y={66} fill="#8b98b8" fontSize={12}>
              {operation.description ?? ''}
            </text>

            {centers.slice(0, -1).map((c, i) => {
              const pts = wirePoints(c, centers[i + 1], isPlaced(stages[i].stageId) || isPlaced(stages[i + 1].stageId))
              return (
                <polyline
                  key={`w${stages[i].stageId}`}
                  points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth={4}
                />
              )
            })}

            {stages.map((s, i) => {
              const c = centers[i]
              const fixed = isPlaced(s.stageId)
              const active = drag?.stageId === s.stageId
              return (
                <g
                  key={s.stageId}
                  className="stage-node"
                  onPointerDown={(e) => startDrag(e, s.stageId, c)}
                  transform={`translate(${c.x} ${c.y})`}
                >
                  <rect
                    x={-NODE_HALF}
                    y={-NODE_HALF}
                    width={NODE_HALF * 2}
                    height={NODE_HALF * 2}
                    fill={active ? '#22d3ee' : '#1b2552'}
                    stroke={active ? '#a5f3fc' : '#22d3ee'}
                    strokeWidth={3}
                    strokeDasharray={fixed ? undefined : '6 4'}
                  />
                  <text y={12} textAnchor="middle" fontSize={34} fill={active ? '#0b1026' : '#e6ecff'} fontFamily="monospace">
                    {s.stageNo}
                  </text>
                  <text y={NODE_HALF + 20} textAnchor="middle" fontSize={12} fill="#e6ecff">
                    {`${s.stageNo} · ${s.title}`.slice(0, 16)}
                  </text>
                  <text y={NODE_HALF + 36} textAnchor="middle" fontSize={11} fill={fixed ? '#8b98b8' : '#5b6789'}>
                    {fixed ? `${Math.round(c.x)}, ${Math.round(c.y)}` : '자동'}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {saved && <p className="success">{saved}</p>}
      <div className="actions">
        <button type="button" className="secondary" disabled={busy || !dirty} onClick={() => setPlaced(savedPlacement(operation))}>
          되돌리기
        </button>
        <button type="button" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? '저장 중...' : '배치 저장'}
        </button>
      </div>
    </div>
  )
}
