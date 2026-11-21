import { useEffect, useRef, useState } from 'react'
import {
  autoCameraSize,
  cameraSize,
  DEFAULT_REVEAL_RADIUS,
  fillBorder,
  revealRadius,
  setCameraSize,
  setRevealRadius,
  nextCheckpointOrder,
  nextId,
  OBJECT_INFO,
  OBJECT_TYPES,
  objectAt,
  resize,
  validate,
  MAX_SIZE,
  MIN_SIZE,
} from './mapData'
import type { GridMap, MapObject, MapObjectType } from './mapData'
import { solveMap, TURN_SLACK } from './mapSolver'
import { DEFAULT_STAR1_TEXT, defaultStarText, readStars, STAR_TYPES, writeStars } from './stars'
import type { StarCond, StarSettings, StarType } from './stars'
import { fetchWordLists } from '../api/admin'
import { ApiError } from '../api/client'
import type { AdminWordList } from '../api/types'
import type { SegmentResult } from './mapSolver'

/** 팔레트 도구 */
type Tool = 'wall' | 'floor' | 'player' | 'erase' | 'select' | MapObjectType

const TERRAIN_TOOLS: { tool: Tool; label: string; symbol: string }[] = [
  { tool: 'select', label: '선택', symbol: '↖' },
  { tool: 'wall', label: '벽', symbol: '#' },
  { tool: 'floor', label: '바닥', symbol: '·' },
  { tool: 'player', label: '시작 위치', symbol: 'P' },
  { tool: 'erase', label: '오브젝트 지우기', symbol: '⌫' },
]

/**
 * 격자 맵 편집기. 칸을 누르거나 끌어서 칠한다.
 * - 벽·바닥: 끌어서 여러 칸. 벽을 칠하면 그 칸의 오브젝트는 지워진다
 * - 오브젝트: 바닥에만, 한 칸에 하나. 놓으면 바로 선택되어 속성을 고칠 수 있다
 */
/** 게임의 맵 그림 세트 (Executor-Game Resources/Pixel/map/{theme}) */
const MAP_THEMES = [
  { value: 'hologram', label: '기본 (메인보드 · 튜토리얼)' },
  { value: 'helloworld', label: 'Hello World (1챕터)' },
  { value: 'undercity', label: '언더시티' },
]

export default function MapEditor({
  map,
  onChange,
  parMoves,
  onParMoves,
  tutorial = false,
}: {
  map: GridMap
  onChange: (next: GridMap) => void
  /** 스테이지 기준 턴 (시작 구간의 턴). 최소 턴 계산의 비교와 추천 적용에 쓴다 */
  parMoves?: number | null
  onParMoves?: (value: number) => void
  /** 튜토리얼 스테이지면 게임에서 ★1만 (별 설정은 저장되지만 쓰이지 않는다) */
  tutorial?: boolean
}) {
  const [tool, setTool] = useState<Tool>('wall')
  const [painting, setPainting] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [sizeW, setSizeW] = useState(String(map.width))
  const [sizeH, setSizeH] = useState(String(map.height))
  // 칸 크기 (확대·축소). 처음에는 맵 크기에 맞춘다
  const [cell, setCell] = useState(map.width > 24 || map.height > 18 ? 22 : 30)
  const [showFrames, setShowFrames] = useState(false)

  // ---------- 되돌리기·다시 하기 ----------
  // 칠하기 한 번(누르고 끌다 뗄 때까지)은 한 단계, 속성 입력은 0.6초 안에 이어 친 것을 한 단계로 묶는다
  const [history, setHistory] = useState<{ past: GridMap[]; future: GridMap[] }>({ past: [], future: [] })
  const lastPush = useRef(0)
  const stroke = useRef<'new' | 'open' | null>(null)

  function change(next: GridMap) {
    if (next === map) return
    const now = performance.now()
    const push = stroke.current === 'new' || (stroke.current === null && now - lastPush.current > 600)
    if (push) {
      lastPush.current = now
      if (stroke.current === 'new') stroke.current = 'open'
    }
    setHistory((h) => ({ past: push ? [...h.past.slice(-199), map] : h.past, future: [] }))
    onChange(next)
  }

  function undo() {
    const prev = history.past[history.past.length - 1]
    if (!prev) return
    setHistory((h) => ({ past: h.past.slice(0, -1), future: [...h.future, map] }))
    lastPush.current = 0
    onChange(prev)
  }

  function redo() {
    const next = history.future[history.future.length - 1]
    if (!next) return
    setHistory((h) => ({ past: [...h.past, map], future: h.future.slice(0, -1) }))
    lastPush.current = 0
    onChange(next)
  }

  // Ctrl+Z 되돌리기, Ctrl+Shift+Z / Ctrl+Y 다시 하기 (입력칸에 쓰는 중에는 그 칸의 되돌리기를 쓴다)
  const undoRef = useRef(undo)
  const redoRef = useRef(redo)
  useEffect(() => {
    undoRef.current = undo
    redoRef.current = redo
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        undoRef.current()
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault()
        redoRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 마우스를 격자 밖에서 떼도 칠하기를 멈춘다
  useEffect(() => {
    const stop = () => {
      setPainting(false)
      stroke.current = null
    }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [])

  // 최소 턴 계산 결과와 그때의 맵 (맵이 바뀌면 다시 계산하라고 알린다)
  const [solved, setSolved] = useState<{ map: GridMap; results: SegmentResult[] } | null>(null)

  function solve() {
    setSolved({ map, results: solveMap(map, parMoves ?? null) })
  }

  /** 추천값 적용: 시작 구간은 스테이지 기준 턴, 나머지는 그 구간을 시작하는 체크포인트의 turns */
  function applyRecommended(results: SegmentResult[]) {
    let next = map
    for (const r of results) {
      if (r.recommended == null) continue
      if (r.from === 0) {
        onParMoves?.(r.recommended)
        continue
      }
      next = {
        ...next,
        objects: next.objects.map((o) => (o.type === 'checkpoint' && o.order === r.from ? { ...o, turns: r.recommended } : o)),
      }
    }
    change(next)
    setSolved({ map: next, results: solveMap(next, results[0]?.recommended ?? parMoves ?? null) })
  }

  const selected = selectedId ? map.objects.find((o) => o.id === selectedId) ?? null : null
  const issues = validate(map)

  function apply(x: number, y: number, dragging: boolean) {
    const at = objectAt(map, x, y)
    switch (tool) {
      case 'select':
        if (!dragging) setSelectedId(at?.id ?? null)
        return
      case 'wall':
      case 'floor': {
        const t = tool === 'wall' ? '#' : '.'
        if (map.tiles[y][x] === t && !(t === '#' && at)) return
        const tiles = map.tiles.map((row, ry) => (ry === y ? row.map((c, rx) => (rx === x ? t : c)) : row))
        const objects = t === '#' ? map.objects.filter((o) => o !== at) : map.objects
        change({ ...map, tiles, objects })
        return
      }
      case 'player': {
        if (dragging) return
        change({ ...map, tiles: floorAt(map, x, y), player: { x, y }, objects: map.objects.filter((o) => o !== at) })
        return
      }
      case 'erase':
        if (at) change({ ...map, objects: map.objects.filter((o) => o !== at) })
        return
      default: {
        if (dragging && at?.type === tool) return
        if (x === map.player.x && y === map.player.y) return
        const id = nextId(map, tool)
        const obj: MapObject = { id, type: tool, x, y, ...OBJECT_INFO[tool].defaults }
        // 체크포인트는 놓을 때마다 다음 구간 번호를 붙인다
        if (tool === 'checkpoint') obj.order = at?.type === 'checkpoint' ? at.order : nextCheckpointOrder(map)
        // 출구는 하나뿐이라 새로 놓으면 옮긴다
        const others = map.objects.filter((o) => o !== at && !(tool === 'exit' && o.type === 'exit'))
        change({ ...map, tiles: floorAt(map, x, y), objects: [...others, obj] })
        if (!dragging) setSelectedId(id)
      }
    }
  }

  function updateSelected(patch: Record<string, unknown>) {
    if (!selected) return
    const next = { ...selected, ...patch }
    for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k]
    change({ ...map, objects: map.objects.map((o) => (o === selected ? next : o)) })
    if (typeof patch.id === 'string') setSelectedId(patch.id)
  }

  function applySize() {
    const w = Number(sizeW)
    const h = Number(sizeH)
    if (!Number.isInteger(w) || !Number.isInteger(h)) return
    const next = resize(map, w, h)
    setSizeW(String(next.width))
    setSizeH(String(next.height))
    change(next)
  }

  // 최소 턴 계산이 맵 전체를 풀었으면 최소 기록 (별 조건 '기록 n턴 이하'의 참고값)
  const minRecord =
    solved && solved.map === map && solved.results.length > 0 && solved.results.every((r) => r.minTurns != null)
      ? solved.results.reduce((sum, r) => sum + (r.minTurns ?? 0), 0)
      : null

  // 화면 범위 표시: 시작 위치와 체크포인트에서 카메라가 보여 주는 칸 (camera 설정, 없으면 자동 크기)
  const view = { ...autoCameraSize(map), ...Object.fromEntries(Object.entries(cameraSize(map)).filter(([, v]) => v !== undefined)) } as {
    width: number
    height: number
  }
  const frames = showFrames
    ? [
        { label: '시작', x: map.player.x, y: map.player.y },
        ...map.objects
          .filter((o) => o.type === 'checkpoint')
          .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
          .map((o) => ({ label: `체크포인트 ${String(o.order ?? '?')}`, x: o.x, y: o.y })),
      ].map((f) => {
        const w = Math.min(map.width, view.width)
        const h = Math.min(map.height, view.height)
        const x0 = Math.max(0, Math.min(map.width - w, f.x - Math.floor(w / 2)))
        const y0 = Math.max(0, Math.min(map.height - h, f.y - Math.floor(h / 2)))
        return { ...f, x0, y0, w, h }
      })
    : []
  const pitch = cell + 1 // 칸 + 1px 간격

  const hoverObj = hover ? objectAt(map, hover.x, hover.y) : undefined
  const hoverText = hover
    ? `칸 (${hover.x}, ${hover.y}) · ${map.tiles[hover.y][hover.x] === '#' ? '벽' : '바닥'}` +
      (map.player.x === hover.x && map.player.y === hover.y ? ' · 시작 위치' : '') +
      (hoverObj ? ` · ${describe(hoverObj)}` : '')
    : '칸에 마우스를 올리면 좌표와 내용이 보입니다'

  return (
    <div className="map-editor">
      <StarPanel map={map} onChange={change} tutorial={tutorial} minRecord={minRecord} />

      <div className="row">
        <label className="inline small" style={{ gap: 8 }}>
          맵 그림 세트
          <select value={String(map.rest.theme ?? 'hologram')} onChange={(e) => change({ ...map, rest: { ...map.rest, theme: e.target.value } })}>
            {MAP_THEMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
            {!MAP_THEMES.some((t) => t.value === (map.rest.theme ?? 'hologram')) && (
              <option value={String(map.rest.theme)}>{String(map.rest.theme)} (게임에 없는 세트 · 기본으로 보임)</option>
            )}
          </select>
        </label>
        <span className="muted small">게임에서 벽·바닥·오브젝트 그림이 바뀝니다 (map_data.theme). 세트에 없는 오브젝트는 기본 그림을 씁니다.</span>
      </div>

      <div className="editor-bar">
        <div className="row nowrap-row">
          <button type="button" className="secondary small-btn" onClick={undo} disabled={history.past.length === 0} title="Ctrl+Z">
            ↶ 되돌리기
          </button>
          <button type="button" className="secondary small-btn" onClick={redo} disabled={history.future.length === 0} title="Ctrl+Shift+Z 또는 Ctrl+Y">
            ↷ 다시 하기
          </button>
          <span className="muted small">
            되돌릴 수 있는 단계 {history.past.length} · Ctrl+Z / Ctrl+Y
          </span>
        </div>
        <div className="row nowrap-row">
          <span className="muted small">칸 크기</span>
          <button type="button" className="secondary small-btn" onClick={() => setCell((c) => Math.max(12, c - 4))} aria-label="축소">
            −
          </button>
          <span className="small">{cell}px</span>
          <button type="button" className="secondary small-btn" onClick={() => setCell((c) => Math.min(48, c + 4))} aria-label="확대">
            ＋
          </button>
          <label className="inline-check small">
            <input type="checkbox" checked={showFrames} onChange={(e) => setShowFrames(e.target.checked)} /> 화면 범위 보기 ({view.width} × {view.height})
          </label>
        </div>
      </div>

      <div className="palette">
        {TERRAIN_TOOLS.map((t) => (
          <button key={t.tool} type="button" className={tool === t.tool ? 'tool active' : 'tool'} onClick={() => setTool(t.tool)}>
            <span className={`swatch ${t.tool}`}>{t.symbol}</span> {t.label}
          </button>
        ))}
        <span className="palette-sep" />
        {OBJECT_TYPES.map((t) => (
          <button key={t} type="button" className={tool === t ? 'tool active' : 'tool'} onClick={() => setTool(t)}>
            <span className={`swatch obj-${t}`}>{OBJECT_INFO[t].symbol}</span> {OBJECT_INFO[t].label}
          </button>
        ))}
      </div>

      <div className="map-work">
        <div className="map-grid-wrap">
          <div
            className="map-grid"
            style={{ gridTemplateColumns: `repeat(${map.width}, ${cell}px)`, gridAutoRows: `${cell}px` }}
            onMouseLeave={() => setHover(null)}
          >
            {map.tiles.map((row, y) =>
              row.map((t, x) => {
                const o = objectAt(map, x, y)
                const isPlayer = map.player.x === x && map.player.y === y
                const cls = ['cell', t === '#' ? 'wall' : 'floor']
                if (o) cls.push(`obj-${o.type}`)
                if (isPlayer) cls.push('player')
                if (o && o.id === selectedId) cls.push('selected')
                return (
                  <button
                    key={`${x},${y}`}
                    type="button"
                    className={cls.join(' ')}
                    title={`(${x}, ${y})${o ? ` ${o.id}` : ''}${isPlayer ? ' 시작 위치' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      stroke.current = 'new' // 이번 칠하기 전체를 되돌리기 한 단계로
                      setPainting(true)
                      apply(x, y, false)
                    }}
                    onMouseEnter={() => {
                      setHover({ x, y })
                      if (painting) apply(x, y, true)
                    }}
                  >
                    {isPlayer ? 'P' : o ? (o.type === 'checkpoint' ? String(o.order ?? 'S') : (OBJECT_INFO[o.type as MapObjectType]?.symbol ?? '?')) : ''}
                  </button>
                )
              }),
            )}
          </div>
          {frames.map((f) => (
            <div
              key={f.label}
              className="cam-frame"
              style={{ left: 1 + f.x0 * pitch, top: 1 + f.y0 * pitch, width: f.w * pitch - 1, height: f.h * pitch - 1 }}
            >
              <span>{f.label}</span>
            </div>
          ))}
          <p className="muted small map-status">
            {map.width} × {map.height} · 오브젝트 {map.objects.length}개 · {hoverText}
          </p>
          {showFrames && (
            <p className="muted small">점선: 그 지점에 있을 때 화면에 보이는 범위 (게임은 화면 비율에 맞춰 조금 더 넓게 보일 수 있습니다)</p>
          )}
        </div>

        <div className="map-side">
          <div className="map-box">
            <b className="small">크기</b>
            <div className="row">
              <input type="number" min={MIN_SIZE} max={MAX_SIZE} value={sizeW} onChange={(e) => setSizeW(e.target.value)} aria-label="가로" className="size-input" />
              ×
              <input type="number" min={MIN_SIZE} max={MAX_SIZE} value={sizeH} onChange={(e) => setSizeH(e.target.value)} aria-label="세로" className="size-input" />
              <button type="button" className="secondary small-btn" onClick={applySize}>
                적용
              </button>
            </div>
            <button type="button" className="secondary small-btn" onClick={() => change(fillBorder(map))}>
              테두리 벽 채우기
            </button>
          </div>

          <CameraBox map={map} onChange={change} />

          <div className="map-box">
            <b className="small">구간</b>
            <p className="muted small">
              체크포인트 {map.objects.filter((o) => o.type === 'checkpoint').length}개 · 구간 {map.objects.filter((o) => o.type === 'checkpoint').length + 1}개. 첫 구간의 턴은 스테이지
              기준 턴입니다. 별 조건은 맨 위 ‘별 조건’에서 정합니다.
            </p>
          </div>

          <div className="map-box">
            <b className="small">선택한 오브젝트</b>
            {selected ? (
              <ObjectFields key={selected.id} obj={selected} objects={map.objects} onChange={updateSelected} onDelete={() => {
                change({ ...map, objects: map.objects.filter((o) => o !== selected) })
                setSelectedId(null)
              }} />
            ) : (
              <p className="muted small">‘선택’ 도구로 오브젝트를 누르면 속성을 고칠 수 있습니다. 새로 놓은 오브젝트는 바로 선택됩니다.</p>
            )}
          </div>

          <div className="map-box">
            <b className="small">최소 턴 계산</b>
            <p className="muted small">
              구간마다 가장 짧은 풀이를 찾습니다. 추천 턴 = 최소 × {TURN_SLACK} (올림). 데이터 파편 수집은 넣지 않습니다.
            </p>
            <button type="button" className="secondary small-btn" onClick={solve}>
              계산
            </button>
            {solved && (
              <>
                {solved.map !== map && <p className="small warn-text">맵이 바뀌었습니다. 다시 계산하세요.</p>}
                <ul className="segments">
                  {solved.results.map((r) => {
                    const label = `${r.from === 0 ? '시작' : `체크포인트 ${r.from}`} → ${r.to === 'exit' ? '출구' : `체크포인트 ${r.to}`}`
                    if (r.minTurns == null) {
                      return (
                        <li key={label} className="bad">
                          {label}: {r.error}
                        </li>
                      )
                    }
                    const tight = r.currentLimit != null && r.currentLimit < r.minTurns
                    return (
                      <li key={label} className={tight ? 'bad' : ''} title={`풀이: ${r.moves}`}>
                        {label}: 최소 <b>{r.minTurns}</b> · 지금 {r.currentLimit ?? '없음'} · 추천 {r.recommended}
                        {tight && ' (지금 턴으로는 안정 도착 불가)'}
                      </li>
                    )
                  })}
                </ul>
                {solved.map === map && solved.results.some((r) => r.recommended != null) && (
                  <button type="button" className="small-btn" onClick={() => applyRecommended(solved.results)}>
                    추천값 적용
                  </button>
                )}
              </>
            )}
          </div>

          <div className={`map-box ${issues.length ? 'warn' : 'ok'}`}>
            <b className="small">{issues.length ? `확인할 점 ${issues.length}개` : '규칙 검사 통과'}</b>
            {issues.length > 0 && (
              <ul className="issues">
                {issues.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function floorAt(map: GridMap, x: number, y: number) {
  return map.tiles[y][x] === '.' ? map.tiles : map.tiles.map((row, ry) => (ry === y ? row.map((c, rx) => (rx === x ? '.' : c)) : row))
}

/** 오브젝트 종류별 속성 입력 (docs/map-data.md 2장) */
function ObjectFields({
  obj,
  objects,
  onChange,
  onDelete,
}: {
  obj: MapObject
  objects: MapObject[]
  onChange: (patch: Record<string, unknown>) => void
  onDelete: () => void
}) {
  const [id, setId] = useState(obj.id)
  const intOrUndefined = (v: string) => (v.trim() === '' ? undefined : Number(v))

  return (
    <div className="obj-fields">
      <p className="small">
        {OBJECT_INFO[obj.type as MapObjectType]?.label ?? obj.type} · ({obj.x}, {obj.y})
      </p>
      <label>
        id (맵 안에서 고유)
        <input value={id} onChange={(e) => setId(e.target.value)} onBlur={() => id.trim() && id !== obj.id && onChange({ id: id.trim() })} />
      </label>
      {obj.type === 'breakable' && (
        <label>
          hp (부딪혀야 하는 횟수)
          <input type="number" min={1} value={String(obj.hp ?? 1)} onChange={(e) => onChange({ hp: intOrUndefined(e.target.value) })} />
        </label>
      )}
      {(obj.type === 'key' || obj.type === 'door') && (
        <label>
          keyId (열쇠와 문이 같아야 열림)
          <input value={String(obj.keyId ?? '')} onChange={(e) => onChange({ keyId: e.target.value })} />
        </label>
      )}
      {obj.type === 'npc' && (
        <>
          <label>
            이름 (name)
            <input value={String(obj.name ?? '')} onChange={(e) => onChange({ name: e.target.value })} />
          </label>
          <label>
            대화 ID (dialogues의 키)
            <input value={String(obj.dialogueId ?? '')} onChange={(e) => onChange({ dialogueId: e.target.value })} />
          </label>
        </>
      )}
      {obj.type === 'computer' && <ComputerFields obj={obj} objects={objects} onChange={onChange} />}
      {obj.type === 'fakeWall' && (
        <p className="muted small">게임에서는 벽과 똑같이 보입니다. 들어가면 지나갈 수 있고(1턴) 그때부터 드러납니다. 상자는 밀어 넣을 수 없습니다.</p>
      )}
      {obj.type === 'hidden' && (
        <label>
          이름 (선택, 화면에 표시)
          <input value={String(obj.name ?? '')} onChange={(e) => onChange({ name: e.target.value || undefined })} />
        </label>
      )}
      {obj.type === 'anomaly' && (
        <>
          <label>
            이름 (name)
            <input value={String(obj.name ?? '')} onChange={(e) => onChange({ name: e.target.value })} />
          </label>
          <label>
            도감 ID (guidebookId, 도감 화면의 ID)
            <input type="number" min={1} value={obj.guidebookId === undefined ? '' : String(obj.guidebookId)} onChange={(e) => onChange({ guidebookId: intOrUndefined(e.target.value) })} />
          </label>
        </>
      )}
      {obj.type === 'checkpoint' && (
        <>
          <label>
            order (구간 번호, 플레이 순서대로 1부터)
            <input type="number" min={1} value={obj.order === undefined ? '' : String(obj.order)} onChange={(e) => onChange({ order: intOrUndefined(e.target.value) })} />
          </label>
          <label>
            turns (여기서 시작하는 구간의 턴)
            <input type="number" min={1} value={obj.turns === undefined ? '' : String(obj.turns)} onChange={(e) => onChange({ turns: intOrUndefined(e.target.value) })} />
          </label>
        </>
      )}
      <button type="button" className="danger small-btn" onClick={onDelete}>
        이 오브젝트 지우기
      </button>
    </div>
  )
}

/** 빈 칸이면 undefined, 아니면 정수 (잘못된 값은 null) */
function optionalInt(text: string): number | undefined | null {
  if (text.trim() === '') return undefined
  const n = Number(text)
  return Number.isInteger(n) ? n : null
}

/** 화면(카메라)과 미니맵 설정: camera.width·height, minimap.revealRadius (docs/map-data.md 3.8) */
function CameraBox({ map, onChange }: { map: GridMap; onChange: (map: GridMap) => void }) {
  const size = cameraSize(map)
  const auto = autoCameraSize(map)
  const radius = revealRadius(map)
  const setSize = (key: 'width' | 'height', text: string) => {
    const n = optionalInt(text)
    if (n === null || (n !== undefined && n < 1)) return
    onChange(setCameraSize(map, { ...size, [key]: n }))
  }
  return (
    <div className="map-box">
      <b className="small">화면·미니맵</b>
      <label>
        화면에 보일 칸 수 (camera, 가로 × 세로)
        <div className="row">
          <input type="number" min={3} max={map.width} value={size.width ?? ''} placeholder={`자동 ${auto.width}`} onChange={(e) => setSize('width', e.target.value)} aria-label="화면 가로 칸 수" className="size-input" />
          ×
          <input type="number" min={3} max={map.height} value={size.height ?? ''} placeholder={`자동 ${auto.height}`} onChange={(e) => setSize('height', e.target.value)} aria-label="화면 세로 칸 수" className="size-input" />
        </div>
      </label>
      <p className="muted small">
        비우면 자동(지금 맵은 {auto.width} × {auto.height}). 한쪽만 적으면 그쪽에 맞추고 다른 쪽은 화면 비율대로 보입니다. 맵보다 크게 적으면 맵 크기까지만 보입니다. M 키는 맵 전체 보기입니다.
      </p>
      <label>
        미니맵 밝힘 범위 (minimap.revealRadius, 플레이어 둘레 칸 수)
        <input
          type="number"
          min={1}
          value={radius ?? ''}
          placeholder={`기본 ${DEFAULT_REVEAL_RADIUS}`}
          onChange={(e) => {
            const n = optionalInt(e.target.value)
            if (n === null || (n !== undefined && n < 1)) return
            onChange(setRevealRadius(map, n))
          }}
        />
      </label>
      <p className="muted small">
        미니맵은 처음에 가려져 있고(게임 화면은 처음부터 전체가 보임), 플레이어 둘레 {radius ?? DEFAULT_REVEAL_RADIUS}칸({2 * (radius ?? DEFAULT_REVEAL_RADIUS) + 1}×{2 * (radius ?? DEFAULT_REVEAL_RADIUS) + 1})이 지나가는 대로 밝혀집니다. 맵 전체를 처음부터 보여 주려면 맵 크기({Math.max(map.width, map.height)}) 이상으로 적습니다.
      </p>
    </div>
  )
}

interface ComputerEffect {
  type: 'remove' | 'giveKey'
  target?: string
  keyId?: string
}

/** 감염된 컴퓨터: 단어 목록·단어 수·제한 시간·복구 효과 (docs/map-data.md 3.9) */
function ComputerFields({ obj, objects, onChange }: { obj: MapObject; objects: MapObject[]; onChange: (patch: Record<string, unknown>) => void }) {
  const [lists, setLists] = useState<AdminWordList[] | null>(null)
  const [listError, setListError] = useState('')
  // 컴퓨터를 고를 때마다 새로 받는다 (단어 목록 메뉴에서 방금 등록한 목록도 바로 보이게). 새로고침 버튼으로 다시 받을 수도 있다
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let cancelled = false
    fetchWordLists()
      .then((l) => {
        if (cancelled) return
        setLists(l)
        setListError('')
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setListError(`단어 목록을 불러오지 못했습니다 (${e instanceof ApiError ? e.message : String(e)}). ID를 직접 적어 주세요.`)
      })
    return () => {
      cancelled = true
    }
  }, [reload])

  const intOrUndefined = (v: string) => (v.trim() === '' ? undefined : Number(v))
  const effects = (Array.isArray(obj.effects) ? obj.effects : []) as ComputerEffect[]
  const setEffects = (next: ComputerEffect[]) => onChange({ effects: next })
  const targets = objects.filter((o) => o !== obj && o.type !== 'exit' && o.type !== 'checkpoint')
  const listId = obj.wordListId === undefined ? '' : String(obj.wordListId)
  const known = lists?.some((l) => String(l.wordListId) === listId) ?? false

  return (
    <>
      <label>
        이름 (해킹 창 제목, 선택)
        <input value={String(obj.name ?? '')} placeholder="감염된 컴퓨터" onChange={(e) => onChange({ name: e.target.value || undefined })} />
      </label>
      <label>
        단어 목록 (wordListId)
        {lists ? (
          <select value={listId} onChange={(e) => onChange({ wordListId: intOrUndefined(e.target.value) })}>
            <option value="">없음 (게임 기본 단어)</option>
            {listId && !known && <option value={listId}>#{listId} (없는 목록)</option>}
            {lists.map((l) => (
              <option key={l.wordListId} value={l.wordListId}>
                #{l.wordListId} {l.name} ({l.words.length}개)
              </option>
            ))}
          </select>
        ) : (
          <input type="number" min={1} value={listId} onChange={(e) => onChange({ wordListId: intOrUndefined(e.target.value) })} />
        )}
      </label>
      <p className="muted small">
        {listError ||
          (lists === null
            ? '단어 목록을 불러오는 중...'
            : lists.length === 0
              ? '등록된 단어 목록이 없습니다. 왼쪽 메뉴 ‘단어 목록’에서 먼저 등록하세요.'
              : `단어 목록 ${lists.length}개`)}{' '}
        <button type="button" className="secondary small-btn" onClick={() => setReload((n) => n + 1)}>
          새로고침
        </button>
      </p>
      <label>
        단어 수 (wordCount, 1~20)
        <input type="number" min={1} max={20} value={obj.wordCount === undefined ? '' : String(obj.wordCount)} placeholder="5" onChange={(e) => onChange({ wordCount: intOrUndefined(e.target.value) })} />
      </label>
      <label>
        제한 시간 (timeLimit, 초, 5~300)
        <input type="number" min={5} max={300} value={obj.timeLimit === undefined ? '' : String(obj.timeLimit)} placeholder="30" onChange={(e) => onChange({ timeLimit: intOrUndefined(e.target.value) })} />
      </label>
      <b className="small">복구하면 (effects)</b>
      {effects.length === 0 && <p className="muted small">효과가 없습니다. 복구만 됩니다.</p>}
      {effects.map((e, i) => (
        <div key={i} className="row nowrap-row">
          <select
            value={e.type}
            onChange={(ev) => setEffects(effects.map((x, j) => (j === i ? (ev.target.value === 'remove' ? { type: 'remove', target: '' } : { type: 'giveKey', keyId: 'key1' }) : x)))}
            aria-label="효과 종류"
          >
            <option value="remove">없애기</option>
            <option value="giveKey">열쇠 주기</option>
          </select>
          {e.type === 'remove' ? (
            <select value={e.target ?? ''} onChange={(ev) => setEffects(effects.map((x, j) => (j === i ? { type: 'remove', target: ev.target.value } : x)))} aria-label="없앨 오브젝트">
              <option value="">대상 고르기</option>
              {e.target && !targets.some((t) => t.id === e.target) && <option value={e.target}>{e.target} (없음)</option>}
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} · {OBJECT_INFO[t.type as MapObjectType]?.label ?? t.type} ({t.x}, {t.y})
                </option>
              ))}
            </select>
          ) : (
            <input value={e.keyId ?? ''} placeholder="keyId" onChange={(ev) => setEffects(effects.map((x, j) => (j === i ? { type: 'giveKey', keyId: ev.target.value } : x)))} aria-label="열쇠 keyId" />
          )}
          <button type="button" className="secondary small-btn" onClick={() => setEffects(effects.filter((_, j) => j !== i))}>
            빼기
          </button>
        </div>
      ))}
      <button type="button" className="secondary small-btn" onClick={() => setEffects([...effects, { type: 'remove', target: '' }])}>
        + 효과 추가
      </button>
      <p className="muted small">E로 해킹을 시작할 때마다 1턴을 씁니다. 실패하면 다시 도전할 수 있고, 워프하면 복구 전 상태로 돌아갑니다.</p>
    </>
  )
}

/** 마우스를 올린 오브젝트 한 줄 설명 */
function describe(o: MapObject): string {
  const label = OBJECT_INFO[o.type as MapObjectType]?.label ?? o.type
  const extra: string[] = []
  if (typeof o.name === 'string' && o.name) extra.push(o.name)
  if (o.keyId !== undefined) extra.push(`keyId ${String(o.keyId)}`)
  if (o.type === 'checkpoint') extra.push(`${String(o.order ?? '?')}번 · ${String(o.turns ?? '?')}턴`)
  if (o.type === 'breakable') extra.push(`hp ${String(o.hp ?? 1)}`)
  if (o.dialogueId !== undefined) extra.push(`대화 ${String(o.dialogueId)}`)
  if (o.guidebookId !== undefined) extra.push(`도감 #${String(o.guidebookId)}`)
  if (o.type === 'computer') extra.push(`단어 ${String(o.wordCount ?? 5)}개 · ${String(o.timeLimit ?? 30)}초`)
  return `${label} ${o.id}${extra.length ? ` (${extra.join(', ')})` : ''}`
}

/**
 * 별 조건 (map_data.stars, docs/map-data.md 3.4). 맵 에디터 맨 위.
 * 별 수(1~3)와 ★2·★3 조건 종류·값, 각 별의 문구(비우면 기본 문구)를 정한다
 */
function StarPanel({
  map,
  onChange,
  tutorial,
  minRecord,
}: {
  map: GridMap
  onChange: (map: GridMap) => void
  tutorial: boolean
  minRecord: number | null
}) {
  const s = readStars(map)
  const set = (patch: Partial<StarSettings>) => onChange(writeStars(map, { ...s, ...patch }))
  return (
    <div className="card star-panel">
      <div className="row title-row">
        <b>별 조건</b>
        <div className="row nowrap-row">
          <span className="muted small">별 수</span>
          {([1, 2, 3] as const).map((n) => (
            <button key={n} type="button" className={s.count === n ? 'small-btn' : 'secondary small-btn'} onClick={() => set({ count: n })}>
              {'★'.repeat(n)}
            </button>
          ))}
        </div>
      </div>
      {tutorial && <p className="muted small">튜토리얼 스테이지는 게임에서 ★1만 받습니다. 아래 설정은 저장되지만 쓰이지 않습니다.</p>}
      <div className="star-grid">
        <div className="star-card">
          <b className="small">★1 · 클리어</b>
          <p className="muted small">출구에 도착하면 받습니다 (바꿀 수 없음)</p>
          <label>
            문구
            <input value={s.star1Text ?? ''} placeholder={DEFAULT_STAR1_TEXT} maxLength={60} onChange={(e) => set({ star1Text: e.target.value })} />
          </label>
          <p className="star-preview">게임에서: ★1 {s.star1Text?.trim() || DEFAULT_STAR1_TEXT}</p>
        </div>
        <StarCard n={2} cond={s.star2} off={s.count < 2} map={map} minRecord={minRecord} onChange={(c) => set({ star2: c })} />
        <StarCard n={3} cond={s.star3} off={s.count < 3} map={map} minRecord={minRecord} onChange={(c) => set({ star3: c })} />
      </div>
    </div>
  )
}

function StarCard({
  n,
  cond,
  off,
  map,
  minRecord,
  onChange,
}: {
  n: 2 | 3
  cond: StarCond
  off: boolean
  map: GridMap
  minRecord: number | null
  onChange: (c: StarCond) => void
}) {
  const spec = STAR_TYPES.find((t) => t.type === cond.type)
  const computers = map.objects.filter((o) => o.type === 'computer')
  const intOrUndefined = (v: string) => (v.trim() === '' ? undefined : Number(v))
  const preview = cond.text?.trim() || defaultStarText(cond, map.objects)
  const counts: Partial<Record<StarType, string>> = {
    fragments: `맵의 데이터 파편 ${map.objects.filter((o) => o.type === 'hidden').length}개`,
    anomalies: `맵의 이상 개체 ${map.objects.filter((o) => o.type === 'anomaly').length}개`,
  }
  return (
    <div className={off ? 'star-card off' : 'star-card'}>
      <b className="small">★{n}{off ? ' · 쓰지 않음 (별 수를 늘리면 쓰입니다)' : ''}</b>
      <label>
        조건
        <select
          value={cond.type}
          disabled={off}
          onChange={(e) => {
            const type = e.target.value as StarType
            onChange({
              type,
              text: cond.text,
              value: type === 'stable' || type === 'rewinds' ? 0 : type === 'moves' ? (minRecord ?? 20) : undefined,
              target: type === 'hack' ? (cond.target ?? computers[0]?.id) : undefined,
              seconds: type === 'hack' ? (cond.seconds ?? 15) : undefined,
            })
          }}
        >
          {STAR_TYPES.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {spec?.value && (
        <label>
          {spec.value.label}
          <input
            type="number"
            min={spec.value.min}
            disabled={off}
            value={cond.value === undefined ? '' : String(cond.value)}
            placeholder={spec.value.placeholder}
            onChange={(e) => onChange({ ...cond, value: intOrUndefined(e.target.value) })}
          />
        </label>
      )}
      {cond.type === 'moves' && (
        <p className="muted small">
          {minRecord != null ? `최소 기록 ${minRecord}턴 (오른쪽 최소 턴 계산)` : '오른쪽 ‘최소 턴 계산’을 누르면 최소 기록을 알려 줍니다'}
        </p>
      )}
      {cond.type === 'hack' && (
        <>
          <label>
            컴퓨터
            <select disabled={off} value={cond.target ?? ''} onChange={(e) => onChange({ ...cond, target: e.target.value })}>
              <option value="">고르기</option>
              {cond.target && !computers.some((c) => c.id === cond.target) && <option value={cond.target}>{cond.target} (없음)</option>}
              {computers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id}
                  {c.name ? ` · ${String(c.name)}` : ''} ({c.x}, {c.y})
                </option>
              ))}
            </select>
          </label>
          <label>
            목표 시간 (초)
            <input
              type="number"
              min={1}
              max={300}
              step={0.5}
              disabled={off}
              value={cond.seconds === undefined ? '' : String(cond.seconds)}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (e.target.value.trim() !== '' && Number.isFinite(v)) onChange({ ...cond, seconds: v })
              }}
            />
          </label>
          {computers.length === 0 && <p className="muted small">맵에 감염된 컴퓨터(M)가 없습니다.</p>}
        </>
      )}
      {counts[cond.type] && <p className="muted small">{counts[cond.type]}</p>}
      <label>
        문구 (비우면 기본 문구)
        <input value={cond.text ?? ''} maxLength={60} disabled={off} placeholder={defaultStarText(cond, map.objects)} onChange={(e) => onChange({ ...cond, text: e.target.value })} />
      </label>
      <p className="star-preview">게임에서: ★{n} {preview}</p>
    </div>
  )
}
