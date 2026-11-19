// 맵 최소 턴 계산 (맵 편집기의 기준 턴·체크포인트 turns 추천).
// 규칙은 Unity Assets/Scripts/Game/Board.cs, Executor-Server docs/map-data.md 3장과 같다.
// 구간(시작 → 체크포인트 1 → … → 출구)마다 너비 우선 탐색으로 최소 턴을 찾고, 그 풀이가 끝난 상태에서 다음 구간을 찾는다.
// 대화로 열쇠를 주는 인물(giveKey)은 3x3 안에 들어가면 열쇠를 준 것으로 본다 (대화는 턴을 쓰지 않으므로 최소 턴은 같다).
import type { GridMap, MapObject } from './mapData'

/** 기준 턴 추천 = 최소 턴 × 이 값 (올림). Executor-Server docs/maps/build_tutorial.py의 TURN_SLACK과 같다 */
export const TURN_SLACK = 1.5

/** 탐색할 최대 상태 수. 넘으면 "너무 복잡함"으로 멈춘다 (편집 화면이 멈추지 않게) */
const MAX_STATES = 300_000

export interface SegmentResult {
  /** 0 = 시작 위치, k = 체크포인트 k */
  from: number
  /** 다음 체크포인트 번호, 마지막은 'exit' */
  to: number | 'exit'
  /** 최소 턴. 갈 수 없으면 null */
  minTurns: number | null
  /** 풀이 (W A S D) */
  moves: string
  /** 그 구간에 지금 정해 둔 턴 (시작 구간 = 스테이지 기준 턴) */
  currentLimit: number | null
  /** 추천 턴 = ceil(최소 × TURN_SLACK) */
  recommended: number | null
  /** 갈 수 없거나 계산을 멈춘 이유 */
  error?: string
}

interface Obj {
  type: string
  x: number
  y: number
  hp: number
  keyId?: string
  order?: number
  removed: boolean
  /** npc: 대화로 주는 열쇠들 */
  gives: string[]
}

interface State {
  px: number
  py: number
  objs: Obj[]
  keys: Record<string, number>
  given: string[]
}

const DIRS: [string, number, number][] = [
  ['W', 0, -1],
  ['A', -1, 0],
  ['S', 0, 1],
  ['D', 1, 0],
]

function keyOf(s: State): string {
  const objs = s.objs.map((o) => `${o.x},${o.y},${o.hp},${o.removed ? 1 : 0}`).join(';')
  const keys = Object.keys(s.keys).sort().map((k) => `${k}=${s.keys[k]}`).join(',')
  return `${s.px},${s.py}|${objs}|${keys}|${[...s.given].sort().join(',')}`
}

function clone(s: State): State {
  return { px: s.px, py: s.py, objs: s.objs.map((o) => ({ ...o })), keys: { ...s.keys }, given: [...s.given] }
}

/** 대화의 giveKey effect를 인물마다 모은다 */
function npcGives(o: MapObject, dialogues: Record<string, unknown>): string[] {
  const d = typeof o.dialogueId === 'string' ? dialogues[o.dialogueId] : undefined
  const found: string[] = []
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      const r = v as Record<string, unknown>
      if (r.type === 'giveKey' && typeof r.keyId === 'string') found.push(r.keyId)
      Object.values(r).forEach(walk)
    }
  }
  walk(d)
  return found
}

/** 3x3 안 인물에게서 열쇠를 받는다 (같은 인물·열쇠는 한 번) */
function talk(s: State) {
  s.objs.forEach((o, i) => {
    if (o.type !== 'npc' || o.removed || Math.abs(o.x - s.px) > 1 || Math.abs(o.y - s.py) > 1) return
    for (const k of o.gives) {
      const id = `${i}/${k}`
      if (s.given.includes(id)) continue
      s.given.push(id)
      s.keys[k] = (s.keys[k] ?? 0) + 1
    }
  })
}

/**
 * 한 칸 이동 (Board.MoveCore와 같은 규칙). 막히면 null.
 * target: 이번 구간의 목표 (체크포인트 번호 또는 'exit'), current: 지금 구간 번호.
 * 목표가 아닌 출구, 목표보다 앞쪽 체크포인트에 들어가는 것은 이 구간 풀이로 보지 않는다 (막힘으로 처리).
 */
function step(map: GridMap, s: State, dx: number, dy: number, current: number, target: number | 'exit'): { next: State; reached: boolean } | null {
  const tx = s.px + dx
  const ty = s.py + dy
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height || map.tiles[ty][tx] !== '.') return null
  const at = s.objs.findIndex((o) => !o.removed && o.x === tx && o.y === ty)
  const n = clone(s)
  const move = (reached = false) => {
    n.px = tx
    n.py = ty
    talk(n)
    return { next: n, reached }
  }
  if (at < 0) return move()
  const o = n.objs[at]
  switch (o.type) {
    case 'npc':
    case 'anomaly':
      return null
    case 'crate': {
      const bx = tx + dx
      const by = ty + dy
      if (bx < 0 || by < 0 || bx >= map.width || by >= map.height || map.tiles[by][bx] !== '.') return null
      if (n.objs.some((p) => !p.removed && p.x === bx && p.y === by)) return null
      o.x = bx
      o.y = by
      return { next: n, reached: false }
    }
    case 'breakable':
      o.hp -= 1
      if (o.hp <= 0) o.removed = true
      return { next: n, reached: false }
    case 'door':
      if (!o.keyId || (n.keys[o.keyId] ?? 0) <= 0) return null
      n.keys[o.keyId] -= 1
      o.removed = true
      return move()
    case 'key':
      o.removed = true
      if (o.keyId) n.keys[o.keyId] = (n.keys[o.keyId] ?? 0) + 1
      return move()
    case 'checkpoint': {
      const order = o.order ?? 0
      if (order <= current) return move() // 지나온 체크포인트는 바닥처럼
      if (order === target) return move(true)
      return null // 목표보다 앞쪽 체크포인트로 건너뛰는 풀이는 이 구간 풀이가 아니다
    }
    case 'exit':
      return target === 'exit' ? move(true) : null
    default:
      // hidden(수집은 최소 턴에 넣지 않음), fakeWall(바닥처럼 지나감. 상자는 위 crate에서 막힘), 모르는 type
      return move()
  }
}

function solveSegment(map: GridMap, start: State, current: number, target: number | 'exit'): { turns: number; moves: string; end: State } | { error: string } {
  const seen = new Set<string>([keyOf(start)])
  let frontier: { s: State; path: string }[] = [{ s: start, path: '' }]
  let turns = 0
  while (frontier.length > 0) {
    turns++
    const next: { s: State; path: string }[] = []
    for (const { s, path } of frontier) {
      for (const [ch, dx, dy] of DIRS) {
        const r = step(map, s, dx, dy, current, target)
        if (!r) continue
        if (r.reached) return { turns, moves: path + ch, end: r.next }
        const k = keyOf(r.next)
        if (seen.has(k)) continue
        seen.add(k)
        if (seen.size > MAX_STATES) return { error: '경우의 수가 너무 많아 계산을 멈췄습니다' }
        next.push({ s: r.next, path: path + ch })
      }
    }
    frontier = next
  }
  return { error: target === 'exit' ? '출구에 갈 수 없습니다' : `체크포인트 ${target}에 갈 수 없습니다` }
}

/** 구간별 최소 턴과 추천 턴. parMoves는 시작 구간의 지금 턴 */
export function solveMap(map: GridMap, parMoves: number | null): SegmentResult[] {
  const dialogues = (map.rest.dialogues ?? {}) as Record<string, unknown>
  const start: State = {
    px: map.player.x,
    py: map.player.y,
    objs: map.objects.map((o) => ({
      type: o.type,
      x: o.x,
      y: o.y,
      hp: Number.isInteger(o.hp) ? (o.hp as number) : 1,
      keyId: typeof o.keyId === 'string' ? o.keyId : undefined,
      order: Number.isInteger(o.order) ? (o.order as number) : undefined,
      removed: false,
      gives: o.type === 'npc' ? npcGives(o, dialogues) : [],
    })),
    keys: {},
    given: [],
  }
  talk(start)

  const orders = map.objects
    .filter((o) => o.type === 'checkpoint' && Number.isInteger(o.order))
    .map((o) => o.order as number)
    .sort((a, b) => a - b)
  const targets: (number | 'exit')[] = [...orders, 'exit']
  const results: SegmentResult[] = []
  let state = start
  let current = 0
  for (const target of targets) {
    const cp = current === 0 ? null : map.objects.find((o) => o.type === 'checkpoint' && o.order === current)
    const currentLimit = current === 0 ? parMoves : Number.isInteger(cp?.turns) ? (cp!.turns as number) : parMoves
    const r = solveSegment(map, state, current, target)
    if ('error' in r) {
      results.push({ from: current, to: target, minTurns: null, moves: '', currentLimit, recommended: null, error: r.error })
      break // 이 구간을 못 지나면 다음 구간은 시작 상태를 알 수 없다
    }
    results.push({
      from: current,
      to: target,
      minTurns: r.turns,
      moves: r.moves,
      currentLimit,
      recommended: Math.ceil(r.turns * TURN_SLACK),
    })
    state = r.end
    if (target !== 'exit') current = target
  }
  return results
}
