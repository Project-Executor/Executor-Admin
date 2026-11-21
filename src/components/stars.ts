// 별 설정 (map_data의 stars, Executor-Server docs/map-data.md 3.4).
// 게임(Unity Game/StarTypes.cs, Board.cs)과 같은 규칙·기본 문구를 쓴다. 바꿀 때는 양쪽을 같이 고친다.
import type { GridMap, MapObject } from './mapData'

export type StarType = 'stable' | 'moves' | 'rewinds' | 'fragments' | 'hack' | 'anomalies'

export interface StarCond {
  type: StarType
  /** stable: 불안정 허용 수, moves: 기록 턴, rewinds: 워프 횟수 */
  value?: number
  /** hack: 컴퓨터 id */
  target?: string
  /** hack: 목표 시간(초) */
  seconds?: number
  /** 화면 문구 (비우면 기본 문구) */
  text?: string
}

export interface StarSettings {
  /** 이 스테이지의 별 수 1~3 (튜토리얼은 게임이 항상 1개) */
  count: 1 | 2 | 3
  /** 별 1은 항상 클리어. 문구만 바꾼다 */
  star1Text?: string
  star2: StarCond
  star3: StarCond
}

/** 조건 종류: 고르는 목록에 보일 이름, 필요한 값 */
export const STAR_TYPES: { type: StarType; label: string; value?: { label: string; min: number; placeholder: string } }[] = [
  { type: 'stable', label: '불안정 체크포인트 n개 이하', value: { label: '허용 불안정 수 (출구 포함)', min: 0, placeholder: '0' } },
  { type: 'moves', label: '기록 n턴 이하로 클리어', value: { label: '기록 (턴, 구간 최고 기록의 합)', min: 1, placeholder: '예: 20' } },
  { type: 'rewinds', label: '워프 n번 이하', value: { label: '허용 워프 수', min: 0, placeholder: '0' } },
  { type: 'fragments', label: '데이터 파편 모두 모으기' },
  { type: 'hack', label: '감염된 컴퓨터를 n초 안에 복구' },
  { type: 'anomalies', label: '이상 개체 모두 만나기' },
]

const TYPES = STAR_TYPES.map((t) => t.type)

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined)

function readCond(raw: unknown): StarCond | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const type = (r.type === 'hidden' ? 'fragments' : r.type) as StarType
  if (!TYPES.includes(type)) return undefined
  return { type, value: num(r.value), target: str(r.target), seconds: num(r.seconds), text: str(r.text) }
}

/** map_data의 stars를 읽는다. 예전 형식(maxUnstable, bonus)도 읽어서 같은 모양으로 */
export function readStars(map: GridMap): StarSettings {
  const s = (map.rest.stars as Record<string, unknown> | undefined) ?? {}
  const count = s.count === 1 || s.count === 2 || s.count === 3 ? s.count : 3
  const legacyMax = Number.isInteger(s.maxUnstable) && (s.maxUnstable as number) >= 0 ? (s.maxUnstable as number) : 0
  const bonus = s.bonus as Record<string, unknown> | undefined
  const star2 = readCond(s.star2) ?? { type: 'stable', value: legacyMax }
  const star3 =
    readCond(s.star3) ??
    (bonus?.type === 'hack' ? { type: 'hack' as const, target: str(bonus.target), seconds: num(bonus.seconds) } : { type: 'fragments' as const })
  const star1Text = str((s.star1 as Record<string, unknown> | undefined)?.text)
  return { count, star1Text, star2, star3 }
}

function writeCond(c: StarCond): Record<string, unknown> {
  const out: Record<string, unknown> = { type: c.type }
  const needsValue = STAR_TYPES.find((t) => t.type === c.type)?.value
  if (needsValue) out.value = c.value ?? 0
  if (c.type === 'hack') {
    out.target = c.target ?? ''
    out.seconds = c.seconds ?? 15
  }
  // 입력 중에는 친 그대로 둔다 (여기서 앞뒤 공백을 지우면 단어 사이 띄어쓰기를 칠 수 없다). 저장할 때 trimStarTexts로 정리
  if (c.text?.trim()) out.text = c.text
  return out
}

/**
 * 별 설정을 map_data.stars에 쓴다 (새 형식 count·star1~3). 예전 형식 bonus는 지우고,
 * maxUnstable은 예전 게임 버전·서버 판정을 위해 별 2가 불안정 조건이면 그 값, 아니면 0으로 둔다
 */
export function writeStars(map: GridMap, s: StarSettings): GridMap {
  const prev = { ...((map.rest.stars as Record<string, unknown> | undefined) ?? {}) }
  delete prev.bonus
  const stars: Record<string, unknown> = {
    ...prev,
    count: s.count,
    star2: writeCond(s.star2),
    star3: writeCond(s.star3),
    maxUnstable: s.star2.type === 'stable' ? Math.max(0, s.star2.value ?? 0) : 0,
  }
  if (s.star1Text?.trim()) stars.star1 = { text: s.star1Text }
  else delete stars.star1
  return { ...map, rest: { ...map.rest, stars } }
}

/** 저장 직전: 별 문구의 앞뒤 공백을 지운다 (map_data.stars.star1~3.text) */
export function trimStarTexts(data: Record<string, unknown>): Record<string, unknown> {
  const stars = data.stars
  if (!stars || typeof stars !== 'object' || Array.isArray(stars)) return data
  const next: Record<string, unknown> = { ...(stars as Record<string, unknown>) }
  for (const key of ['star1', 'star2', 'star3']) {
    const c = next[key] as Record<string, unknown> | undefined
    if (c && typeof c === 'object' && typeof c.text === 'string') next[key] = { ...c, text: c.text.trim() }
  }
  return { ...data, stars: next }
}

function computerName(c: StarCond, objects: MapObject[]) {
  const pc = objects.find((o) => o.type === 'computer' && o.id === c.target)
  return typeof pc?.name === 'string' && pc.name ? pc.name : '감염된 컴퓨터'
}

/** 조건으로 만든 기본 문구 (게임 StarTypes.DefaultText와 같다) */
export function defaultStarText(c: StarCond, objects: MapObject[]): string {
  switch (c.type) {
    case 'stable':
      return (c.value ?? 0) === 0 ? '모든 구간을 턴 안에' : `불안정 ${c.value}개 이하`
    case 'moves':
      return `${c.value ?? 0}턴 이하로 클리어`
    case 'rewinds':
      return (c.value ?? 0) === 0 ? '워프 없이 클리어' : `워프 ${c.value}번 이하`
    case 'fragments':
      return '데이터 파편 모두 모으기'
    case 'hack':
      return `${computerName(c, objects)}을(를) ${formatSeconds(c.seconds ?? 0)}초 안에 복구`
    case 'anomalies':
      return '이상 개체 모두 만나기'
  }
}

/** 게임의 {seconds:0.#}과 같게: 15 -> "15", 12.5 -> "12.5" */
function formatSeconds(s: number) {
  return String(Math.round(s * 10) / 10)
}

export const DEFAULT_STAR1_TEXT = '출구에 도착'

/** 별 설정 검사 (맵 검증 목록에 더한다) */
export function starIssues(map: GridMap): string[] {
  const issues: string[] = []
  const raw = map.rest.stars
  if (raw !== undefined && (raw === null || typeof raw !== 'object' || Array.isArray(raw))) {
    issues.push('stars는 { }로 감싼 객체이어야 합니다.')
    return issues
  }
  const s = readStars(map)
  const r = (raw as Record<string, unknown> | undefined) ?? {}
  if (r.count !== undefined && ![1, 2, 3].includes(r.count as number)) issues.push('별 수(stars.count)는 1, 2, 3 중 하나여야 합니다.')
  if (r.maxUnstable !== undefined && !(Number.isInteger(r.maxUnstable) && (r.maxUnstable as number) >= 0)) issues.push('stars.maxUnstable은 0 이상 정수여야 합니다.')
  const objects = map.objects
  const conds: [number, StarCond][] = [
    [2, s.star2],
    [3, s.star3],
  ]
  for (const [n, c] of conds) {
    if (n > s.count) continue
    const spec = STAR_TYPES.find((t) => t.type === c.type)
    if (spec?.value) {
      const v = c.value
      if (v === undefined || !Number.isInteger(v) || v < spec.value.min) issues.push(`★${n} 조건의 값은 ${spec.value.min} 이상 정수여야 합니다.`)
    }
    // 별 조건을 직접 정한 맵만 (정하지 않은 맵의 기본 ★3은 데이터 파편이라, 파편 없는 맵마다 경고가 뜨지 않게)
    const explicit = r[`star${n}`] !== undefined
    if (explicit && c.type === 'fragments' && !objects.some((o) => o.type === 'hidden')) issues.push(`★${n} 조건이 데이터 파편인데 맵에 데이터 파편이 없습니다. (받을 수 없는 별)`)
    if (explicit && c.type === 'anomalies' && !objects.some((o) => o.type === 'anomaly')) issues.push(`★${n} 조건이 이상 개체인데 맵에 이상 개체가 없습니다. (받을 수 없는 별)`)
    if (c.type === 'hack') {
      const pc = objects.find((o) => o.id === c.target)
      if (!c.target) issues.push(`★${n} 조건(컴퓨터 시간)의 컴퓨터를 고르세요.`)
      else if (!pc || pc.type !== 'computer') issues.push(`★${n} 조건의 '${c.target}'은(는) 감염된 컴퓨터가 아닙니다.`)
      if (!(typeof c.seconds === 'number' && c.seconds > 0 && c.seconds <= 300)) issues.push(`★${n} 조건의 목표 시간은 0초보다 크고 300초 이하여야 합니다.`)
      else if (pc && pc.type === 'computer') {
        const limit = Number.isInteger(pc.timeLimit) ? (pc.timeLimit as number) : 30
        if (c.seconds >= limit) issues.push(`★${n} 목표 시간(${c.seconds}초)이 그 컴퓨터의 제한 시간(${limit}초) 이상이라, 복구만 하면 ★${n}이 됩니다.`)
      }
    }
    if (c.text && c.text.length > 60) issues.push(`★${n} 문구는 60자 이하로 써 주세요. (게임 화면에서 잘립니다)`)
  }
  if (s.star1Text && s.star1Text.length > 60) issues.push('★1 문구는 60자 이하로 써 주세요.')
  return issues
}
