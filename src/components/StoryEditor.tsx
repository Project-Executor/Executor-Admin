// 이야기(story.intro/outro)와 인물 대화(dialogues)를 버튼·입력으로 만드는 편집기 (Executor-Server docs/map-data.md 4·6장).
// 맵 JSON의 그 부분만 고치고, 모르는 필드는 그대로 둔다.
import { useEffect, useState } from 'react'
import { fetchCharacters } from '../api/admin'
import type { AdminCharacter } from '../api/types'
import NameTag from './NameTag.tsx'
import { dialogueIssues, readDialogues, readStory } from './storyData.ts'
import type { Dialogue, DialogueNode, Dialogues, StoryData, StoryStep } from './storyData.ts'


// ---------- 화자 (인물 목록) ----------

const NICKNAME = '{nickname}'
const EXPRESSIONS = ['default', 'smile', 'surprised', 'angry', 'sad']
const DEFAULT_PROTAGONIST = '#D4D6DE'
const DEFAULT_OTHER = '#FF4FA3'

function findCharacter(characters: AdminCharacter[], speaker: string | undefined, portrait: string | undefined) {
  const key = portrait?.split('/')[0]
  return (key && characters.find((c) => c.characterKey === key)) || characters.find((c) => c.name === speaker) || null
}

/** 화자 고르기 + 표정 + 이름표 미리보기. fallbackName: 비웠을 때 보일 이름 (대화 노드는 인물 이름) */
function SpeakerFields({
  speaker,
  portrait,
  characters,
  fallbackName,
  onChange,
}: {
  speaker: string | undefined
  portrait: string | undefined
  characters: AdminCharacter[]
  fallbackName?: string
  onChange: (speaker: string | undefined, portrait: string | undefined) => void
}) {
  const protagonistChar = characters.find((c) => c.protagonist) ?? null
  const isNickname = speaker === NICKNAME
  const named = speaker !== undefined && characters.find((c) => c.name === speaker)
  const custom = speaker !== undefined && !isNickname && !named
  const [forceCustom, setForceCustom] = useState(false)
  const mode = isNickname ? NICKNAME : named ? `char:${speaker}` : custom || forceCustom ? 'custom' : ''

  const shown = speaker ?? fallbackName
  const character = isNickname ? protagonistChar : findCharacter(characters, shown, portrait)
  const protagonist = isNickname || character?.protagonist === true
  const color = character?.tagColor ?? (protagonist ? DEFAULT_PROTAGONIST : DEFAULT_OTHER)

  // 일러스트: "인물ID/표정". 화자의 인물과 같은 ID면 표정만 고르고, 다르면 직접 입력
  const key = isNickname ? protagonistChar?.characterKey : character?.characterKey
  const [pKey, pExpr] = (portrait ?? '').split('/')
  const simplePortrait = !portrait || (key !== undefined && pKey === key)
  const expression = simplePortrait ? pExpr || 'default' : ''

  function pick(value: string) {
    setForceCustom(value === 'custom')
    if (value === '') onChange(undefined, portrait)
    else if (value === NICKNAME) onChange(NICKNAME, undefined)
    else if (value === 'custom') onChange(speaker && !named && !isNickname ? speaker : '', portrait)
    else onChange(value.slice(5), undefined)
  }

  function setExpression(expr: string) {
    if (!key) return
    onChange(speaker, expr === 'default' ? undefined : `${key}/${expr}`)
  }

  return (
    <div className="row" style={{ alignItems: 'flex-end' }}>
      <label style={{ minWidth: 170 }}>
        화자
        <select value={mode} onChange={(e) => pick(e.target.value)}>
          {fallbackName !== undefined && <option value="">인물 이름 ({fallbackName})</option>}
          {fallbackName === undefined && <option value="">(이름표 없음)</option>}
          <option value={NICKNAME}>주인공 (내 닉네임)</option>
          {characters.map((c) => (
            <option key={c.characterId} value={`char:${c.name}`}>
              {c.name}
            </option>
          ))}
          <option value="custom">직접 입력…</option>
        </select>
      </label>
      {mode === 'custom' && (
        <label style={{ minWidth: 140 }}>
          이름 (직접)
          <input value={speaker ?? ''} onChange={(e) => onChange(e.target.value, portrait)} placeholder="??? 또는 이름" />
        </label>
      )}
      {simplePortrait && key ? (
        <label style={{ minWidth: 120 }}>
          표정
          <select value={expression} onChange={(e) => setExpression(e.target.value)}>
            {[...new Set([...EXPRESSIONS, expression])].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label style={{ minWidth: 160 }}>
          일러스트 (인물ID/표정, 선택)
          <input value={portrait ?? ''} onChange={(e) => onChange(speaker, e.target.value.trim() || undefined)} placeholder="cassia/smile" />
        </label>
      )}
      <span style={{ paddingBottom: 6 }}>
        <NameTag name={isNickname ? '(닉네임)' : shown || '이름'} color={color} />{' '}
        <span className="muted small">{protagonist ? '왼쪽' : '오른쪽'}</span>
      </span>
    </div>
  )
}

function useCharacters() {
  const [characters, setCharacters] = useState<AdminCharacter[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    fetchCharacters()
      .then(setCharacters)
      .catch(() => setError("인물 목록을 불러오지 못해 화자는 '직접 입력'만 됩니다."))
  }, [])
  return { characters, error }
}

/** 순서 바꾸기·삭제 버튼 */
function MoveButtons({ index, count, onMove, onRemove }: { index: number; count: number; onMove: (to: number) => void; onRemove: () => void }) {
  return (
    <div className="row nowrap-row">
      <button type="button" className="secondary small-btn" disabled={index === 0} onClick={() => onMove(index - 1)} title="위로">
        ↑
      </button>
      <button type="button" className="secondary small-btn" disabled={index === count - 1} onClick={() => onMove(index + 1)} title="아래로">
        ↓
      </button>
      <button type="button" className="danger small-btn" onClick={onRemove}>
        삭제
      </button>
    </div>
  )
}

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** 빈 값(undefined, '')인 필드는 빼서 JSON을 깔끔하게 */
function clean<T extends Record<string, unknown>>(o: T): T {
  const r: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') r[k] = v
  return r as T
}

// ---------- 이야기 (intro / outro) ----------

const STEP_LABEL: Record<string, string> = { narration: '나레이션', line: '대사', inputNickname: '닉네임 입력', dialogue: '대화 (선택지)' }

/** 이야기의 대화 단계가 쓰는 대화 ID */
function storyDialogueIds(story: StoryData): string[] {
  return [...story.intro, ...story.outro].filter((s) => s.type === 'dialogue').map((s) => s.dialogueId ?? '')
}

function StepCard({
  step,
  index,
  count,
  characters,
  dialogueIds,
  onChange,
  onMove,
  onRemove,
  onCreateDialogue,
  onOpenDialogue,
}: {
  step: StoryStep
  index: number
  count: number
  characters: AdminCharacter[]
  dialogueIds: string[]
  onChange: (s: StoryStep) => void
  onMove: (to: number) => void
  onRemove: () => void
  onCreateDialogue: () => void
  onOpenDialogue: (id: string) => void
}) {
  const type = step.type === 'inputCharacterName' ? 'inputNickname' : step.type
  return (
    <div className="map-box">
      <div className="row title-row">
        <strong>
          {index + 1}. {STEP_LABEL[type] ?? type}
        </strong>
        <MoveButtons index={index} count={count} onMove={onMove} onRemove={onRemove} />
      </div>
      {type === 'line' && (
        <SpeakerFields
          speaker={step.speaker}
          portrait={step.portrait}
          characters={characters}
          onChange={(speaker, portrait) => onChange(clean({ ...step, speaker, portrait }))}
        />
      )}
      {type === 'dialogue' && (
        <>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label style={{ minWidth: 220 }}>
              진행할 대화
              <select value={step.dialogueId ?? ''} onChange={(e) => onChange(clean({ ...step, dialogueId: e.target.value || undefined }))}>
                <option value="">(고르세요)</option>
                {dialogueIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
                {step.dialogueId && !dialogueIds.includes(step.dialogueId) && <option value={step.dialogueId}>없는 대화: {step.dialogueId}</option>}
              </select>
            </label>
            {step.dialogueId && dialogueIds.includes(step.dialogueId) ? (
              <button type="button" className="secondary small-btn" onClick={() => onOpenDialogue(step.dialogueId!)}>
                대화 편집 →
              </button>
            ) : (
              <button type="button" className="secondary small-btn" onClick={onCreateDialogue}>
                새 대화 만들기
              </button>
            )}
          </div>
          <p className="muted small">
            대화창에서 이 대화를 선택지까지 진행하고, 대화가 끝나면 다음 단계로 넘어갑니다. 대사·선택지는 ‘인물 대화’ 탭에서 만듭니다. 이야기 속
            대화에서는 열쇠 주기 효과가 쓰이지 않습니다.
          </p>
        </>
      )}
      {type === 'narration' && (
        <label style={{ maxWidth: 260 }}>
          배경
          <select value={step.background ?? 'error'} onChange={(e) => onChange(clean({ ...step, background: e.target.value === 'error' ? undefined : e.target.value }))}>
            <option value="error">오류 로그 (기본)</option>
            <option value="glitch">일그러진 델타 창</option>
          </select>
        </label>
      )}
      {type !== 'dialogue' && (
        <label>
          {type === 'inputNickname' ? '안내 문구 (선택)' : '글'} · <code>{'{nickname}'}</code>은 내 닉네임으로 바뀝니다
          <textarea rows={type === 'inputNickname' ? 1 : 3} value={step.text ?? ''} onChange={(e) => onChange({ ...step, text: e.target.value })} />
        </label>
      )}
      {type === 'inputNickname' && <p className="muted small">닉네임이 이미 있는 사람은 이 단계를 건너뜁니다.</p>}
    </div>
  )
}

function StepList({
  steps,
  characters,
  dialogueIds,
  onChange,
  onCreateDialogue,
  onOpenDialogue,
}: {
  steps: StoryStep[]
  characters: AdminCharacter[]
  dialogueIds: string[]
  onChange: (steps: StoryStep[]) => void
  /** i번 단계에 새 대화를 만들어 연결 */
  onCreateDialogue: (index: number) => void
  onOpenDialogue: (id: string) => void
}) {
  return (
    <div className="obj-fields">
      {steps.length === 0 && <p className="muted small">아직 단계가 없습니다. 아래 버튼으로 추가하세요.</p>}
      {steps.map((s, i) => (
        <StepCard
          key={i}
          step={s}
          index={i}
          count={steps.length}
          characters={characters}
          dialogueIds={dialogueIds}
          onChange={(next) => onChange(steps.map((x, j) => (j === i ? next : x)))}
          onMove={(to) => onChange(move(steps, i, to))}
          onRemove={() => onChange(steps.filter((_, j) => j !== i))}
          onCreateDialogue={() => onCreateDialogue(i)}
          onOpenDialogue={onOpenDialogue}
        />
      ))}
      <div className="row">
        <button type="button" className="secondary small-btn" onClick={() => onChange([...steps, { type: 'narration', text: '' }])}>
          + 나레이션
        </button>
        <button type="button" className="secondary small-btn" onClick={() => onChange([...steps, { type: 'line', speaker: NICKNAME, text: '' }])}>
          + 대사
        </button>
        <button type="button" className="secondary small-btn" onClick={() => onChange([...steps, { type: 'dialogue' }])}>
          + 대화 (선택지)
        </button>
        <button
          type="button"
          className="secondary small-btn"
          disabled={steps.some((s) => s.type === 'inputNickname' || s.type === 'inputCharacterName')}
          onClick={() => onChange([...steps, { type: 'inputNickname', text: '이름을 입력하세요.' }])}
        >
          + 닉네임 입력
        </button>
      </div>
    </div>
  )
}

// ---------- 인물 대화 (dialogues) ----------

function nextNodeId(nodes: Record<string, DialogueNode>) {
  let n = Object.keys(nodes).length + 1
  while (nodes[`n${n}`]) n++
  return `n${n}`
}

function NodeTarget({ value, nodeIds, self, onChange }: { value: string | null | undefined; nodeIds: string[]; self: string; onChange: (v: string | null) => void }) {
  const missing = value && !nodeIds.includes(value)
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} style={missing ? { borderColor: 'var(--danger)' } : undefined}>
      <option value="">대화 끝</option>
      {nodeIds
        .filter((id) => id !== self)
        .map((id) => (
          <option key={id} value={id}>
            → {id}
          </option>
        ))}
      {missing && <option value={value}>없는 노드: {value}</option>}
    </select>
  )
}

function NodeCard({
  id,
  node,
  nodeIds,
  isStart,
  characters,
  npcName,
  onChange,
  onRename,
  onRemove,
  onStart,
}: {
  id: string
  node: DialogueNode
  nodeIds: string[]
  isStart: boolean
  characters: AdminCharacter[]
  /** 화자를 비웠을 때 쓰는 인물 이름. 이야기에서만 쓰는 대화면 없음 (이름표 없음) */
  npcName?: string
  onChange: (n: DialogueNode) => void
  onRename: (to: string) => string | null
  onRemove: () => void
  onStart: () => void
}) {
  const [newId, setNewId] = useState(id)
  const [renameError, setRenameError] = useState('')
  const hasChoices = (node.choices?.length ?? 0) > 0
  const effects = node.effects ?? []

  return (
    <div className={isStart ? 'map-box ok' : 'map-box'}>
      <div className="row title-row">
        <div className="row nowrap-row">
          <strong>{id}</strong>
          {isStart ? (
            <span className="badge">시작</span>
          ) : (
            <button type="button" className="secondary small-btn" onClick={onStart}>
              시작으로
            </button>
          )}
          <input
            value={newId}
            onChange={(e) => {
              setNewId(e.target.value)
              setRenameError('')
            }}
            onBlur={() => {
              const to = newId.trim()
              if (to === id) return
              const err = onRename(to)
              if (err) {
                setRenameError(err)
                setNewId(id)
              }
            }}
            style={{ width: 90, minWidth: 0, flex: 'none' }}
            aria-label="노드 ID"
            title="노드 ID (바꾸면 이 노드로 가는 연결도 함께 바뀝니다)"
          />
        </div>
        <button type="button" className="danger small-btn" onClick={onRemove}>
          노드 삭제
        </button>
      </div>
      {renameError && <p className="warn-text small">{renameError}</p>}
      <SpeakerFields
        speaker={node.speaker}
        portrait={node.portrait}
        characters={characters}
        fallbackName={npcName}
        onChange={(speaker, portrait) => onChange(clean({ ...node, speaker, portrait }))}
      />
      <label>
        대사 · <code>{'{nickname}'}</code>은 내 닉네임으로 바뀝니다
        <textarea rows={2} value={node.text ?? ''} onChange={(e) => onChange({ ...node, text: e.target.value })} />
      </label>

      <div className="row">
        <span className="small">효과</span>
        {effects.map((e, i) => (
          <span key={i} className="row nowrap-row">
            {e.type === 'giveKey' ? (
              <>
                <span className="small">열쇠 주기</span>
                <input
                  value={e.keyId ?? ''}
                  placeholder="keyId"
                  style={{ width: 100, minWidth: 0, flex: 'none' }}
                  onChange={(ev) => onChange({ ...node, effects: effects.map((x, j) => (j === i ? { ...x, keyId: ev.target.value } : x)) })}
                />
              </>
            ) : (
              <code className="small">{JSON.stringify(e)}</code>
            )}
            <button type="button" className="secondary small-btn" onClick={() => onChange(clean({ ...node, effects: effects.length > 1 ? effects.filter((_, j) => j !== i) : undefined }))}>
              ×
            </button>
          </span>
        ))}
        <button type="button" className="secondary small-btn" onClick={() => onChange({ ...node, effects: [...effects, { type: 'giveKey', keyId: 'key1' }] })}>
          + 열쇠 주기
        </button>
      </div>

      <div className="row">
        <label className="inline small">
          <input type="radio" checked={!hasChoices} onChange={() => onChange(clean({ ...node, choices: undefined }))} /> 다음 대사로
        </label>
        <label className="inline small">
          <input
            type="radio"
            checked={hasChoices}
            onChange={() => onChange(clean({ ...node, next: undefined, choices: [{ text: '', next: node.next ?? null }] }))}
          />{' '}
          선택지
        </label>
      </div>
      {!hasChoices ? (
        <label style={{ maxWidth: 240 }}>
          다음
          <NodeTarget value={node.next} nodeIds={nodeIds} self={id} onChange={(v) => onChange(clean({ ...node, next: v ?? undefined }))} />
        </label>
      ) : (
        <div className="obj-fields">
          {node.choices!.map((c, i) => (
            <div key={i} className="row">
              <span className="small">{i + 1}</span>
              <input
                value={c.text}
                placeholder="선택지 글"
                onChange={(e) => onChange({ ...node, choices: node.choices!.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
              />
              <NodeTarget
                value={c.next}
                nodeIds={nodeIds}
                self={id}
                onChange={(v) => onChange({ ...node, choices: node.choices!.map((x, j) => (j === i ? { ...x, next: v } : x)) })}
              />
              <button
                type="button"
                className="secondary small-btn"
                onClick={() => onChange(clean({ ...node, choices: node.choices!.length > 1 ? node.choices!.filter((_, j) => j !== i) : undefined }))}
              >
                ×
              </button>
            </div>
          ))}
          <div>
            <button
              type="button"
              className="secondary small-btn"
              disabled={node.choices!.length >= 9}
              onClick={() => onChange({ ...node, choices: [...node.choices!, { text: '', next: null }] })}
            >
              + 선택지
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function DialogueEditor({
  id,
  dialogue,
  npcName,
  characters,
  onChange,
}: {
  id: string
  dialogue: Dialogue
  npcName?: string
  characters: AdminCharacter[]
  onChange: (d: Dialogue) => void
}) {
  const nodeIds = Object.keys(dialogue.nodes)

  function setNode(nid: string, node: DialogueNode) {
    onChange({ ...dialogue, nodes: { ...dialogue.nodes, [nid]: node } })
  }

  function rename(from: string, to: string): string | null {
    if (!/^[A-Za-z0-9_-]{1,30}$/.test(to)) return '노드 ID는 영문·숫자·-·_ 30자 이하여야 합니다.'
    if (dialogue.nodes[to]) return `이미 있는 노드 ID입니다: ${to}`
    const fix = (v: string | null | undefined) => (v === from ? to : v)
    const nodes: Record<string, DialogueNode> = {}
    for (const [nid, n] of Object.entries(dialogue.nodes)) {
      nodes[nid === from ? to : nid] = clean({
        ...n,
        next: fix(n.next) ?? undefined,
        choices: n.choices?.map((c) => ({ ...c, next: fix(c.next) ?? null })),
      })
    }
    onChange({ ...dialogue, start: fix(dialogue.start) ?? '', nodes })
    return null
  }

  function remove(nid: string) {
    const nodes = { ...dialogue.nodes }
    delete nodes[nid]
    const start = dialogue.start === nid ? Object.keys(nodes)[0] ?? '' : dialogue.start
    onChange({ ...dialogue, start, nodes })
  }

  /** 새 노드. 마지막 노드가 "대화 끝"이면 거기서 이어지게 한다 */
  function add() {
    const nid = nextNodeId(dialogue.nodes)
    const nodes = { ...dialogue.nodes }
    const last = nodeIds[nodeIds.length - 1]
    if (last && !nodes[last].next && !(nodes[last].choices?.length ?? 0)) nodes[last] = { ...nodes[last], next: nid }
    nodes[nid] = { text: '' }
    onChange({ ...dialogue, start: dialogue.start || nid, nodes })
  }

  return (
    <div className="obj-fields">
      <p className="muted small">
        대화 <code>{id}</code> · 시작 노드에서 출발해 ‘다음’이나 고른 선택지를 따라갑니다. ‘대화 끝’이면 대화가 닫힙니다.
      </p>
      {nodeIds.map((nid) => (
        <NodeCard
          key={nid}
          id={nid}
          node={dialogue.nodes[nid]}
          nodeIds={nodeIds}
          isStart={dialogue.start === nid}
          characters={characters}
          npcName={npcName}
          onChange={(n) => setNode(nid, n)}
          onRename={(to) => rename(nid, to)}
          onRemove={() => remove(nid)}
          onStart={() => onChange({ ...dialogue, start: nid })}
        />
      ))}
      <div>
        <button type="button" className="secondary small-btn" onClick={add}>
          + 대사 노드
        </button>
      </div>
    </div>
  )
}

// ---------- 전체 ----------

export default function StoryEditor({
  story: rawStory,
  dialogues: rawDialogues,
  npcs,
  onChange,
}: {
  story: unknown
  dialogues: unknown
  /** 맵의 인물 오브젝트 (이름·대화 ID) */
  npcs: { id: string; name: string; dialogueId: string }[]
  onChange: (story: StoryData, dialogues: Dialogues) => void
}) {
  const { characters, error } = useCharacters()
  const story = readStory(rawStory)
  const dialogues = readDialogues(rawDialogues)
  const [part, setPart] = useState<'intro' | 'outro' | 'dialogues'>('intro')
  const dialogueIds = Object.keys(dialogues)
  const [selected, setSelected] = useState<string>(dialogueIds[0] ?? '')
  const [newId, setNewId] = useState('')
  const current = dialogues[selected] ? selected : dialogueIds[0] ?? ''

  const setStory = (s: StoryData) => onChange(s, dialogues)
  const setDialogues = (d: Dialogues) => onChange(story, d)

  function addDialogue(id: string): string | null {
    const v = id.trim()
    if (!/^[A-Za-z0-9_-]{1,30}$/.test(v)) return '대화 ID는 영문·숫자·-·_ 30자 이하여야 합니다.'
    if (dialogues[v]) return `이미 있는 대화입니다: ${v}`
    setDialogues({ ...dialogues, [v]: { start: 'n1', nodes: { n1: { text: '' } } } })
    setSelected(v)
    setNewId('')
    return null
  }

  function removeDialogue(id: string) {
    const users = npcs.filter((n) => n.dialogueId === id)
    const warn = users.length ? `\n\n이 대화를 쓰는 인물(${users.map((u) => u.name).join(', ')})은 대화가 열리지 않게 됩니다.` : ''
    if (!window.confirm(`대화 '${id}'를 삭제할까요?${warn}`)) return
    const next = { ...dialogues }
    delete next[id]
    setDialogues(next)
  }

  const [addError, setAddError] = useState('')
  const storyIds = storyDialogueIds(story)
  const issues = dialogueIssues(dialogues, npcs.map((n) => n.dialogueId), storyIds)

  /** 이야기의 i번 대화 단계에 새 대화(story1, story2, ...)를 만들어 연결한다. 이야기·대화를 한 번에 바꾼다 */
  function createStoryDialogue(which: 'intro' | 'outro', index: number) {
    let n = 1
    while (dialogues[`story${n}`]) n++
    const id = `story${n}`
    const steps = story[which].map((st, j) => (j === index ? { ...st, dialogueId: id } : st))
    onChange({ ...story, [which]: steps }, { ...dialogues, [id]: { start: 'n1', nodes: { n1: { text: '' } } } })
  }

  function openDialogue(id: string) {
    setSelected(id)
    setPart('dialogues')
  }
  const missingForNpc = [...new Set(npcs.map((n) => n.dialogueId).filter((id) => id && !dialogues[id]))]
  const usersOf = (id: string) => npcs.filter((n) => n.dialogueId === id)

  return (
    <div className="obj-fields">
      {error && <p className="warn-text small">{error}</p>}
      <div className="tabs" role="tablist">
        {(
          [
            ['intro', `시작 전 이야기 (${story.intro.length})`],
            ['outro', `클리어 후 이야기 (${story.outro.length})`],
            ['dialogues', `인물 대화 (${dialogueIds.length})`],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={part === key} className={part === key ? 'tab active' : 'tab'} onClick={() => setPart(key)}>
            {label}
          </button>
        ))}
      </div>

      {part !== 'dialogues' && (
        <>
          <p className="muted small">
            {part === 'intro' ? '플레이 전에 순서대로 보여 줍니다.' : '클리어한 뒤 결과 화면 전에 보여 줍니다.'} 나레이션은 화면 가운데 띠, 대사는 대화창(이름표·일러스트)에
            나옵니다. 화자 색은 ‘인물’ 메뉴에서 바꿉니다.
          </p>
          <StepList
            steps={story[part]}
            characters={characters}
            dialogueIds={dialogueIds}
            onChange={(steps) => setStory({ ...story, [part]: steps })}
            onCreateDialogue={(i) => createStoryDialogue(part, i)}
            onOpenDialogue={openDialogue}
          />
        </>
      )}

      {part === 'dialogues' && (
        <>
          <p className="muted small">
            맵의 인물(N)에 E를 누르면 그 인물의 대화 ID로 대화를 엽니다. 대화 ID는 격자 편집에서 인물을 고르면 바꿀 수 있습니다.
          </p>
          {missingForNpc.length > 0 && (
            <div className="row">
              <span className="warn-text small">대화가 없는 인물:</span>
              {missingForNpc.map((id) => (
                <button key={id} type="button" className="secondary small-btn" onClick={() => setAddError(addDialogue(id) ?? '')}>
                  ‘{id}’ 대화 만들기
                </button>
              ))}
            </div>
          )}
          <div className="row">
            <label style={{ minWidth: 220 }}>
              대화
              <select value={current} onChange={(e) => setSelected(e.target.value)} disabled={dialogueIds.length === 0}>
                {dialogueIds.length === 0 && <option value="">(대화 없음)</option>}
                {dialogueIds.map((id) => {
                  const users = usersOf(id)
                  return (
                    <option key={id} value={id}>
                      {id} {users.length ? `· ${users.map((u) => u.name).join(', ')}` : ''}
                      {storyIds.includes(id) ? ' · 이야기' : ''}
                      {!users.length && !storyIds.includes(id) ? '· 쓰는 곳 없음' : ''}
                    </option>
                  )
                })}
              </select>
            </label>
            {current && (
              <button type="button" className="danger small-btn" onClick={() => removeDialogue(current)} style={{ alignSelf: 'flex-end' }}>
                대화 삭제
              </button>
            )}
            <label style={{ minWidth: 160 }}>
              새 대화 ID
              <input
                value={newId}
                onChange={(e) => {
                  setNewId(e.target.value)
                  setAddError('')
                }}
                placeholder="researcher"
              />
            </label>
            <button type="button" className="secondary small-btn" style={{ alignSelf: 'flex-end' }} onClick={() => setAddError(addDialogue(newId) ?? '')}>
              + 대화 추가
            </button>
          </div>
          {addError && <p className="warn-text small">{addError}</p>}
          {current && (
            <DialogueEditor
              key={current}
              id={current}
              dialogue={dialogues[current]}
              npcName={usersOf(current)[0]?.name}
              characters={characters}
              onChange={(d) => setDialogues({ ...dialogues, [current]: d })}
            />
          )}
        </>
      )}

      <div className={issues.length ? 'map-box warn' : 'map-box ok'}>
        {issues.length === 0 ? (
          <p className="small">대화 연결에 문제가 없습니다.</p>
        ) : (
          <ul className="issues">
            {issues.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
