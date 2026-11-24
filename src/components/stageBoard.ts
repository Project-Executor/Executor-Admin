/**
 * 게임 스테이지 선택 화면의 회로 기판 좌표 (게임 MenuUI.Stage.cs와 같은 계산).
 * 단위는 게임 시안 px(배율 1)이고, 서버에는 0~1 비율로 저장한다.
 */

/** 기판 크기: 창 1104 - 테두리 4 - 왼쪽 트리 220 - 오른쪽 정보 260 = 620, 본문 높이 466 */
export const BOARD_W = 620
export const BOARD_H = 466
/** 노드 한 변 (64)의 절반 */
export const NODE_HALF = 32

/** 노드 가운데가 놓일 수 있는 범위. 위는 제목·NEXT 표시, 아래는 두 줄 글자 자리를 남긴다 */
export const BOUNDS = { minX: 56, maxX: BOARD_W - 56, minY: 120, maxY: BOARD_H - 72 }

export interface Point {
  x: number
  y: number
}

/** 위치를 정하지 않은 노드의 기본 자리 (시안의 지그재그 6칸을 되풀이). 게임 NodeCenters와 같다 */
export function defaultCenter(index: number, count: number): Point {
  const tops = [268, 138, 298, 118, 278, 158]
  let step = 101.6
  const usable = BOARD_W - 2 * 56
  if (count > 1 && step * (count - 1) > usable) step = usable / (count - 1)
  const start = count > 1 && step * (count - 1) < usable ? (BOARD_W - step * (count - 1)) / 2 : 56
  return { x: start + index * step, y: 30 + tops[index % tops.length] + 32 }
}

export const clampToBoard = (p: Point): Point => ({
  x: Math.min(BOUNDS.maxX, Math.max(BOUNDS.minX, p.x)),
  y: Math.min(BOUNDS.maxY, Math.max(BOUNDS.minY, p.y)),
})

/** 저장 값(0~1) -> 기판 px */
export const fromRatio = (x: number, y: number): Point => ({ x: x * BOARD_W, y: y * BOARD_H })

/** 기판 px -> 저장 값(0~1, 소수 넷째 자리) */
export const toRatio = (p: Point) => ({
  x: Math.round((p.x / BOARD_W) * 10000) / 10000,
  y: Math.round((p.y / BOARD_H) * 10000) / 10000,
})

/**
 * 두 노드를 잇는 회로 선 (꺾은선 점 4개). 게임 Wire와 같다.
 * 보통은 가로-세로-가로로 옆면끼리 잇고, 직접 놓은 노드가 위아래로 겹쳐 있으면 세로-가로-세로로 윗면·아랫면을 잇는다.
 */
export function wirePoints(a: Point, b: Point, placed: boolean): Point[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (placed && Math.abs(dx) < NODE_HALF * 2 + 8) {
    const sy = dy >= 0 ? 1 : -1
    const from = { x: a.x, y: a.y + sy * NODE_HALF }
    const to = { x: b.x, y: b.y - sy * NODE_HALF }
    const midY = (from.y + to.y) / 2
    return [from, { x: from.x, y: midY }, { x: to.x, y: midY }, to]
  }
  const sx = dx >= 0 ? 1 : -1
  const from = { x: a.x + sx * NODE_HALF, y: a.y }
  const to = { x: b.x - sx * NODE_HALF, y: b.y }
  const midX = (from.x + to.x) / 2
  return [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to]
}
