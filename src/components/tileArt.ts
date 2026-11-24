import type { GridMap } from './mapData'

/**
 * 칸별 바닥·벽 무늬 (map_data.tileArt, Executor-Server docs/map-data.md 3.10).
 * 그림은 게임 Resources/Pixel/map/{theme}/에서 public/map-art/{theme}/로 복사해 둔 것.
 */

export const FLOOR_ART = [
  { name: 'floor_plain', label: '무늬 없음' },
  { name: 'floor_trace_l', label: '회로 L' },
  { name: 'floor_trace_h', label: '회로 가로' },
  { name: 'floor_vias', label: '비아' },
] as const

export const WALL_ART = [
  { name: 'wall_top', label: '윗면' },
  { name: 'wall_front_0', label: '앞면 0' },
  { name: 'wall_front_1', label: '앞면 1' },
  { name: 'wall_front_2', label: '앞면 2' },
  { name: 'wall_front_3', label: '앞면 3' },
  { name: 'wall_front_4', label: '앞면 4' },
] as const

/** 관리자 웹에 그림이 있는 세트 */
const ART_THEMES = ['hologram', 'helloworld', 'undercity', 'corporation']

/** 그림 주소. 그림이 없는 세트면 튜토리얼 세트 그림을 보여 준다 (게임도 그 세트가 없으면 기본으로 그린다) */
export function artUrl(theme: string | undefined, name: string) {
  const t = theme && ART_THEMES.includes(theme) ? theme : 'hologram'
  return `${import.meta.env.BASE_URL}map-art/${t}/${name}.png`
}

export const isFloorArt = (name: string) => name.startsWith('floor_')
export const isWallArt = (name: string) => name.startsWith('wall_')

/** 칸 종류에 맞는 그림인지 (바닥 칸에는 floor_, 벽 칸에는 wall_) */
export const fitsTile = (tile: string, name: string) => (tile === '#' ? isWallArt(name) : isFloorArt(name))

export function readTileArt(map: GridMap): Record<string, string> {
  const raw = map.rest.tileArt
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === 'string') out[k] = v
  return out
}

/** 칸에 고른 그림 (칸 종류와 맞을 때만). 없으면 undefined = 자동 */
export function tileArtAt(art: Record<string, string>, map: GridMap, x: number, y: number) {
  const name = art[`${x},${y}`]
  return name && fitsTile(map.tiles[y]?.[x] ?? '.', name) ? name : undefined
}

/** 칸 하나의 그림을 정한다. name이 null이면 자동으로 되돌린다. 바뀐 게 없으면 같은 map을 돌려준다 */
export function setTileArt(map: GridMap, x: number, y: number, name: string | null): GridMap {
  const art = readTileArt(map)
  const key = `${x},${y}`
  if ((art[key] ?? null) === name) return map
  if (name == null) delete art[key]
  else art[key] = name
  return withTileArt(map, art)
}

/** 맵 밖 좌표와 칸 종류에 맞지 않는 값을 지운다 (저장할 때). 비면 tileArt 자체를 뺀다 */
export function cleanTileArt(map: GridMap): GridMap {
  const art = readTileArt(map)
  const kept: Record<string, string> = {}
  for (const [k, name] of Object.entries(art)) {
    const [x, y] = k.split(',').map(Number)
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= map.width || y >= map.height) continue
    if (fitsTile(map.tiles[y][x], name)) kept[k] = name
  }
  return withTileArt(map, kept)
}

function withTileArt(map: GridMap, art: Record<string, string>): GridMap {
  const rest = { ...map.rest }
  // 키를 y, x 순으로 정렬해 JSON이 읽기 쉽게
  const keys = Object.keys(art).sort((a, b) => {
    const [ax, ay] = a.split(',').map(Number)
    const [bx, by] = b.split(',').map(Number)
    return ay - by || ax - bx
  })
  if (keys.length) rest.tileArt = Object.fromEntries(keys.map((k) => [k, art[k]]))
  else delete rest.tileArt
  return { ...map, rest }
}

/** 게임 ArtCatalog.CellHash와 같은 값 (C# int 연산을 그대로 따라 한다) */
function cellHash(x: number, y: number) {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663)
  h ^= h >> 13
  h = Math.imul(h, 0x5bd1e995)
  h ^= h >> 15
  return h & 0x7fffffff
}

const AUTO_FLOOR = ['floor_trace_l', 'floor_trace_h', 'floor_vias']

/**
 * 게임이 자동으로 고르는 그림 (그림 미리 보기용). 게임 FloorTile / WallTile과 같은 규칙.
 * 벽은 아래 칸이 벽(또는 맵 밖)이면 윗면, 바닥이면 앞면 무늬. 그리지 않는 벽(가장자리 옆·아래 테두리)은 null
 */
export function autoArt(map: GridMap, x: number, y: number): string | null {
  if (map.tiles[y][x] === '.') {
    const h = cellHash(x, y)
    return h % 8 !== 0 ? 'floor_plain' : AUTO_FLOOR[Math.floor(h / 8) % AUTO_FLOOR.length]
  }
  const belowIsWall = y + 1 >= map.height || map.tiles[y + 1][x] === '#' || fakeWallAt(map, x, y + 1)
  const border = x === 0 || y === 0 || x === map.width - 1 || y === map.height - 1
  if (border && belowIsWall) return null
  if (belowIsWall) return 'wall_top'
  return `wall_front_${cellHash(x + 7, y + 3) % 5}`
}

const fakeWallAt = (map: GridMap, x: number, y: number) => map.objects.some((o) => o.type === 'fakeWall' && o.x === x && o.y === y)
