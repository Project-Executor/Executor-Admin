// map_data v1 (Executor-Server docs/map-data.md) 편집 도우미.
// 격자 편집기는 width·height·tiles·player·objects만 다루고, 나머지 필드(dialogues, guides, story, hints 등)는 그대로 둔다.

export type Tile = '#' | '.'

export type MapObjectType = 'exit' | 'crate' | 'breakable' | 'key' | 'door' | 'npc' | 'checkpoint'

export interface MapObject {
  id: string
  type: string
  x: number
  y: number
  [field: string]: unknown
}

export interface GridMap {
  width: number
  height: number
  /** tiles[y][x] */
  tiles: Tile[][]
  player: { x: number; y: number }
  objects: MapObject[]
  /** 격자 밖 필드 (version, theme, dialogues, guides, story, hints, ...) */
  rest: Record<string, unknown>
}

export const MIN_SIZE = 3
export const MAX_SIZE = 40

/** 오브젝트 종류별 표시 정보와 새로 놓을 때의 기본 필드 (docs/map-data.md 0·2장) */
export const OBJECT_INFO: Record<MapObjectType, { label: string; symbol: string; defaults: Record<string, unknown> }> = {
  exit: { label: '출구', symbol: 'E', defaults: {} },
  crate: { label: '상자', symbol: 'C', defaults: {} },
  breakable: { label: '부서지는 블록', symbol: 'B', defaults: { hp: 1 } },
  key: { label: '열쇠', symbol: 'K', defaults: { keyId: 'key1' } },
  door: { label: '잠긴 문', symbol: 'D', defaults: { keyId: 'key1' } },
  npc: { label: '인물', symbol: 'N', defaults: { name: '인물', dialogueId: 'npc1' } },
  checkpoint: { label: '체크포인트', symbol: 'S', defaults: { turns: 10 } },
}

export const OBJECT_TYPES = Object.keys(OBJECT_INFO) as MapObjectType[]

const GRID_KEYS = ['width', 'height', 'tiles', 'player', 'objects']

/** 새 맵: 테두리 벽, 시작 (1,1), 출구는 오른쪽 아래 */
export function newMap(width = 9, height = 7): Record<string, unknown> {
  const tiles = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (isBorder(x, y, width, height) ? '#' : '.')).join(''),
  )
  return {
    version: 1,
    theme: 'hologram',
    width,
    height,
    tiles,
    player: { x: 1, y: 1 },
    objects: [{ id: 'exit1', type: 'exit', x: width - 2, y: height - 2 }],
    dialogues: {},
    guides: [],
    story: { intro: [], outro: [] },
    hints: [],
  }
}

function isBorder(x: number, y: number, w: number, h: number) {
  return x === 0 || y === 0 || x === w - 1 || y === h - 1
}

function toInt(v: unknown, fallback: number) {
  return typeof v === 'number' && Number.isInteger(v) ? v : fallback
}

/**
 * JSON 객체를 격자로 읽는다. tiles가 없거나 크기가 안 맞으면 width·height에 맞춰 채운다
 * (모자란 테두리 칸은 벽, 그 밖은 바닥). 지형은 벽·바닥만 지원해서 다른 글자는 바닥이 된다.
 */
export function fromJson(data: Record<string, unknown>): GridMap {
  const rawTiles = Array.isArray(data.tiles) ? data.tiles.map((r) => (typeof r === 'string' ? r : '')) : []
  const height = clamp(toInt(data.height, rawTiles.length || 7), MIN_SIZE, MAX_SIZE)
  const width = clamp(toInt(data.width, Math.max(0, ...rawTiles.map((r) => r.length)) || 9), MIN_SIZE, MAX_SIZE)
  const tiles: Tile[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const ch = rawTiles[y]?.[x]
      if (ch === '#' || ch === '.') return ch
      return ch === undefined && isBorder(x, y, width, height) ? '#' : '.'
    }),
  )
  const p = (data.player ?? {}) as Record<string, unknown>
  const player = { x: clamp(toInt(p.x, 1), 0, width - 1), y: clamp(toInt(p.y, 1), 0, height - 1) }
  const objects: MapObject[] = (Array.isArray(data.objects) ? data.objects : [])
    .filter((o): o is Record<string, unknown> => o !== null && typeof o === 'object')
    .map((o, i) => ({ ...o, id: typeof o.id === 'string' ? o.id : `obj${i + 1}`, type: String(o.type ?? ''), x: toInt(o.x, 0), y: toInt(o.y, 0) }))
  const rest: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) if (!GRID_KEYS.includes(k)) rest[k] = v
  return { width, height, tiles, player, objects, rest }
}

/** 격자를 JSON 객체로. 필드 순서는 문서 예시를 따른다 */
export function toJson(map: GridMap): Record<string, unknown> {
  const { version, theme, ...others } = map.rest
  return {
    version: version ?? 1,
    theme: theme ?? 'hologram',
    width: map.width,
    height: map.height,
    tiles: map.tiles.map((row) => row.join('')),
    player: { x: map.player.x, y: map.player.y },
    objects: map.objects.map(({ id, type, x, y, ...fields }) => ({ id, type, x, y, ...fields })),
    ...others,
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

/** 크기 변경. 남는 칸은 바닥, 밖으로 나간 오브젝트는 지우고 시작 위치는 안으로 당긴다 */
export function resize(map: GridMap, width: number, height: number): GridMap {
  const w = clamp(width, MIN_SIZE, MAX_SIZE)
  const h = clamp(height, MIN_SIZE, MAX_SIZE)
  const tiles: Tile[][] = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => map.tiles[y]?.[x] ?? '.'),
  )
  return {
    ...map,
    width: w,
    height: h,
    tiles,
    player: { x: Math.min(map.player.x, w - 1), y: Math.min(map.player.y, h - 1) },
    objects: map.objects.filter((o) => o.x < w && o.y < h),
  }
}

/** 테두리를 모두 벽으로 (테두리에 있던 오브젝트는 지운다) */
export function fillBorder(map: GridMap): GridMap {
  const tiles = map.tiles.map((row, y) => row.map((t, x) => (isBorder(x, y, map.width, map.height) ? '#' : t)))
  return { ...map, tiles, objects: map.objects.filter((o) => !isBorder(o.x, o.y, map.width, map.height)) }
}

export function objectAt(map: GridMap, x: number, y: number) {
  return map.objects.find((o) => o.x === x && o.y === y)
}

/** 같은 종류 중 쓰이지 않은 id (exit1, crate2, ...) */
export function nextId(map: GridMap, type: string) {
  const used = new Set(map.objects.map((o) => o.id))
  let n = 1
  while (used.has(`${type}${n}`)) n++
  return `${type}${n}`
}

/** 문서 규칙 검사. 막는 오류가 아니라 저장 전에 보여 줄 경고 목록 */
export function validate(map: GridMap): string[] {
  const issues: string[] = []
  const { width: w, height: h, tiles, player, objects } = map
  const pos = (o: { x: number; y: number }) => `(${o.x}, ${o.y})`

  const openBorder: string[] = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isBorder(x, y, w, h) && tiles[y][x] !== '#') openBorder.push(pos({ x, y }))
  if (openBorder.length) issues.push(`테두리가 벽이 아닌 칸 ${openBorder.length}개: ${openBorder.slice(0, 5).join(' ')}${openBorder.length > 5 ? ' …' : ''}`)

  if (tiles[player.y]?.[player.x] !== '.') issues.push(`시작 위치 ${pos(player)}가 바닥이 아닙니다.`)

  const exits = objects.filter((o) => o.type === 'exit')
  if (exits.length !== 1) issues.push(`출구는 정확히 1개여야 합니다. (지금 ${exits.length}개)`)

  const ids = new Map<string, number>()
  for (const o of objects) ids.set(o.id, (ids.get(o.id) ?? 0) + 1)
  for (const [id, n] of ids) if (n > 1) issues.push(`id '${id}'가 ${n}번 쓰였습니다. id는 맵 안에서 고유해야 합니다.`)

  const cells = new Map<string, number>()
  for (const o of objects) {
    const key = `${o.x},${o.y}`
    cells.set(key, (cells.get(key) ?? 0) + 1)
    if (o.x < 0 || o.y < 0 || o.x >= w || o.y >= h) issues.push(`${o.id}가 맵 밖 ${pos(o)}에 있습니다.`)
    else if (tiles[o.y][o.x] !== '.') issues.push(`${o.id}가 벽 위 ${pos(o)}에 있습니다.`)
    if (o.x === player.x && o.y === player.y) issues.push(`${o.id}가 시작 위치에 있습니다.`)
    if (!(o.type in OBJECT_INFO) && o.type !== 'turnReset') issues.push(`${o.id}의 type '${o.type}'은 모르는 종류입니다. (게임에서는 바닥처럼 지나감)`)
  }
  for (const [key, n] of cells) if (n > 1) issues.push(`(${key.replace(',', ', ')}) 칸에 오브젝트가 ${n}개 있습니다.`)

  for (const o of objects) {
    if (o.type === 'breakable' && o.hp !== undefined && !(Number.isInteger(o.hp) && (o.hp as number) >= 1)) issues.push(`${o.id}의 hp는 1 이상 정수여야 합니다.`)
    if ((o.type === 'key' || o.type === 'door') && (typeof o.keyId !== 'string' || !o.keyId)) issues.push(`${o.id}에 keyId가 없습니다.`)
    if (o.type === 'checkpoint') {
      if (!(Number.isInteger(o.turns) && (o.turns as number) >= 1)) issues.push(`${o.id}의 turns(구간 턴)는 1 이상 정수여야 합니다.`)
      if (!(Number.isInteger(o.order) && (o.order as number) >= 1)) issues.push(`${o.id}의 order(구간 번호)는 1 이상 정수여야 합니다.`)
    }
    if (o.type === 'turnReset') issues.push(`${o.id}: 턴 리셋(turnReset)은 체크포인트(checkpoint)로 바뀌었습니다. 체크포인트로 다시 놓으세요.`)
  }

  // 문을 열 열쇠: 맵의 열쇠 또는 대화의 giveKey
  const dialogues = (map.rest.dialogues ?? {}) as Record<string, unknown>
  const givenKeys = new Set<string>()
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (o.type === 'giveKey') givenKeys.add(String(o.keyId))
      Object.values(o).forEach(walk)
    }
  }
  walk(dialogues)
  const mapKeys = new Set(objects.filter((o) => o.type === 'key').map((o) => String(o.keyId)))
  for (const d of objects.filter((o) => o.type === 'door')) {
    if (!mapKeys.has(String(d.keyId)) && !givenKeys.has(String(d.keyId))) issues.push(`${d.id}(keyId '${String(d.keyId)}')를 열 열쇠가 맵에도 대화에도 없습니다.`)
  }
  for (const n of objects.filter((o) => o.type === 'npc')) {
    if (typeof n.dialogueId !== 'string' || !(n.dialogueId in dialogues)) issues.push(`${n.id}의 대화 '${String(n.dialogueId)}'가 dialogues에 없습니다. (JSON 탭에서 추가)`)
  }
  // 체크포인트 순서: 1부터 빠짐·겹침 없이
  const orders = objects.filter((o) => o.type === 'checkpoint' && Number.isInteger(o.order)).map((o) => o.order as number).sort((a, b) => a - b)
  const dup = orders.filter((n, i) => i > 0 && orders[i - 1] === n)
  if (dup.length) issues.push(`체크포인트 order가 겹칩니다: ${[...new Set(dup)].join(', ')}`)
  const missing = orders.length ? Array.from({ length: orders[orders.length - 1] }, (_, i) => i + 1).filter((n) => !orders.includes(n)) : []
  if (missing.length) issues.push(`체크포인트 order ${missing.join(', ')}번이 비어 있습니다. 1부터 차례로 매기세요.`)

  const stars = map.rest.stars
  if (stars !== undefined) {
    const max = (stars as Record<string, unknown> | null)?.maxUnstable
    if (stars === null || typeof stars !== 'object' || (max !== undefined && !(Number.isInteger(max) && (max as number) >= 0))) {
      issues.push('stars.maxUnstable은 0 이상 정수여야 합니다.')
    }
  }
  return issues
}

/** 다음 체크포인트 번호 (지금 가장 큰 order + 1) */
export function nextCheckpointOrder(map: GridMap) {
  const orders = map.objects.filter((o) => o.type === 'checkpoint' && Number.isInteger(o.order)).map((o) => o.order as number)
  return orders.length ? Math.max(...orders) + 1 : 1
}

/** 별 2 허용 불안정 수 (stars.maxUnstable, 없으면 0) */
export function maxUnstable(map: GridMap): number {
  const v = (map.rest.stars as Record<string, unknown> | undefined)?.maxUnstable
  return Number.isInteger(v) && (v as number) >= 0 ? (v as number) : 0
}

export function setMaxUnstable(map: GridMap, value: number): GridMap {
  const stars = { ...((map.rest.stars as Record<string, unknown> | undefined) ?? {}), maxUnstable: value }
  return { ...map, rest: { ...map.rest, stars } }
}
