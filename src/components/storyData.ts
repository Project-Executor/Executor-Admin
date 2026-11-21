// map_data의 story(intro/outro)와 dialogues 읽기·검사 (Executor-Server docs/map-data.md 4·6장). 모르는 필드는 그대로 둔다.

// ---------- 데이터 모양 ----------

export interface StoryStep {
  type: string
  text?: string
  speaker?: string
  portrait?: string
  background?: string
  [field: string]: unknown
}

export interface StoryData {
  intro: StoryStep[]
  outro: StoryStep[]
  [field: string]: unknown
}

export interface DialogueChoice {
  text: string
  next: string | null
}

export interface DialogueEffect {
  type: string
  keyId?: string
  [field: string]: unknown
}

export interface DialogueNode {
  speaker?: string
  portrait?: string
  text?: string
  next?: string | null
  choices?: DialogueChoice[]
  effects?: DialogueEffect[]
  [field: string]: unknown
}

export interface Dialogue {
  start: string
  nodes: Record<string, DialogueNode>
  [field: string]: unknown
}

export type Dialogues = Record<string, Dialogue>

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** 하나만 있으면 배열로 (게임도 하나·배열 둘 다 읽는다) */
function toSteps(v: unknown): StoryStep[] {
  const list = Array.isArray(v) ? v : isObject(v) ? [v] : []
  return list.filter(isObject).map((s) => ({ ...s, type: String(s.type ?? 'narration') }))
}

export function readStory(v: unknown): StoryData {
  const o = isObject(v) ? v : {}
  return { ...o, intro: toSteps(o.intro), outro: toSteps(o.outro) }
}

export function readDialogues(v: unknown): Dialogues {
  const result: Dialogues = {}
  if (!isObject(v)) return result
  for (const [id, d] of Object.entries(v)) {
    if (!isObject(d)) continue
    const nodes: Record<string, DialogueNode> = {}
    if (isObject(d.nodes)) for (const [nid, n] of Object.entries(d.nodes)) if (isObject(n)) nodes[nid] = n as DialogueNode
    result[id] = { ...d, start: typeof d.start === 'string' ? d.start : Object.keys(nodes)[0] ?? '', nodes }
  }
  return result
}

/** 대화 문제 (없는 노드로 가는 next·선택지, 시작 노드 없음) */
export function dialogueIssues(dialogues: Dialogues, npcDialogueIds: string[]): string[] {
  const issues: string[] = []
  for (const [id, d] of Object.entries(dialogues)) {
    if (!d.nodes[d.start]) issues.push(`대화 ${id}: 시작 노드 '${d.start}'가 없습니다.`)
    for (const [nid, n] of Object.entries(d.nodes)) {
      if (n.next && !d.nodes[n.next]) issues.push(`대화 ${id} · ${nid}: 다음 노드 '${n.next}'가 없습니다.`)
      for (const c of n.choices ?? []) if (c.next && !d.nodes[c.next]) issues.push(`대화 ${id} · ${nid}: 선택지 '${c.text}'의 다음 노드 '${c.next}'가 없습니다.`)
      if (!n.text?.trim()) issues.push(`대화 ${id} · ${nid}: 대사가 비어 있습니다.`)
    }
  }
  for (const id of new Set(npcDialogueIds)) if (id && !dialogues[id]) issues.push(`인물이 쓰는 대화 '${id}'가 없습니다. (게임에서 대화가 열리지 않음)`)
  return issues
}
