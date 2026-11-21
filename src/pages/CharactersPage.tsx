import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createCharacter, deleteCharacter, fetchCharacters, updateCharacter } from '../api/admin'
import { ApiError } from '../api/client'
import type { AdminCharacter, AdminCharacterRequest } from '../api/types'
import NameTag, { COLOR_PATTERN } from '../components/NameTag.tsx'

const NAME_MAX = 50
const KEY_PATTERN = /^[a-z0-9_-]{1,50}$/

/** 시안 팔레트 (Executor_Export README 색) */
const PALETTE: { color: string; label: string }[] = [
  { color: '#D4D6DE', label: '회색 (주인공)' },
  { color: '#FF4FA3', label: '분홍' },
  { color: '#FF9A3C', label: '주황' },
  { color: '#FFD84A', label: '노랑' },
  { color: '#5CF08A', label: '초록' },
  { color: '#22D3EE', label: '하늘' },
  { color: '#C3A6FF', label: '보라' },
  { color: '#FF4D5E', label: '빨강' },
  { color: '#EAF2FF', label: '흰색' },
]

/** 대화 인물 관리 (/api/admin/characters). 게임 대화창의 이름표 색·일러스트 폴더·주인공 자리 */
export default function CharactersPage() {
  const [items, setItems] = useState<AdminCharacter[] | null>(null)
  const [error, setError] = useState('')
  /** null이면 폼 닫힘, 'new'면 등록, 항목이면 수정 */
  const [editing, setEditing] = useState<AdminCharacter | 'new' | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchCharacters()
      .then(setItems)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : String(e)))
  }, [])

  function open(target: AdminCharacter | 'new') {
    setEditing(target)
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function upsert(c: AdminCharacter) {
    setItems((prev) => {
      if (!prev) return [c]
      return prev.some((i) => i.characterId === c.characterId)
        ? prev.map((i) => (i.characterId === c.characterId ? c : i))
        : [...prev, c].sort((a, b) => a.characterId - b.characterId)
    })
  }

  return (
    <section>
      <div className="row title-row">
        <h2>인물</h2>
        <button type="button" onClick={() => open('new')}>
          새 인물
        </button>
      </div>
      <p className="muted">
        대화·이야기에 나오는 인물입니다. 게임은 대사의 화자(speaker)를 <b>이름</b>으로, 일러스트(portrait "인물ID/표정")를 <b>인물 ID</b>로 찾아 이름표
        색과 일러스트를 정합니다. 주인공은 대화창 왼쪽에 서고, 대사의 화자를 <code>{'{nickname}'}</code>으로 쓰면 주인공으로 봅니다. 목록에 없는 인물은
        기본 색(주인공 회색, 그 밖에 분홍)을 씁니다.
      </p>

      <div ref={formRef}>
        {editing && (
          <CharacterForm
            key={editing === 'new' ? 'new' : editing.characterId}
            item={editing === 'new' ? null : editing}
            onSaved={(c) => {
              upsert(c)
              setEditing(c)
            }}
            onDeleted={(id) => {
              setItems((prev) => prev?.filter((i) => i.characterId !== id) ?? null)
              setEditing(null)
            }}
            onClose={() => setEditing(null)}
          />
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="num">ID</th>
              <th>이름표</th>
              <th>인물 ID (일러스트 폴더)</th>
              <th>색</th>
              <th>자리</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((c) => (
              <tr key={c.characterId} className={editing !== 'new' && editing?.characterId === c.characterId ? 'selected' : ''}>
                <td className="num">{c.characterId}</td>
                <td>
                  <NameTag name={c.name} color={c.tagColor} />
                </td>
                <td>
                  <code>{c.characterKey}</code>
                </td>
                <td>
                  <code>{c.tagColor}</code>
                </td>
                <td>{c.protagonist ? '주인공 (왼쪽)' : '상대 (오른쪽)'}</td>
                <td className="actions-cell">
                  <button type="button" className="secondary small-btn" onClick={() => open(c)}>
                    수정
                  </button>
                </td>
              </tr>
            ))}
            {items && items.length === 0 && (
              <tr>
                <td colSpan={6} className="empty muted">
                  인물이 없습니다. 게임은 기본 이름표 색을 씁니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {!items && !error && <p className="muted small loading">불러오는 중...</p>}
      </div>
    </section>
  )
}

function CharacterForm({
  item,
  onSaved,
  onDeleted,
  onClose,
}: {
  item: AdminCharacter | null
  onSaved: (c: AdminCharacter) => void
  onDeleted: (characterId: number) => void
  onClose: () => void
}) {
  const [name, setName] = useState(item?.name ?? '')
  const [characterKey, setCharacterKey] = useState(item?.characterKey ?? '')
  const [tagColor, setTagColor] = useState(item?.tagColor ?? '#C3A6FF')
  const [protagonist, setProtagonist] = useState(item?.protagonist ?? false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)

  const color = tagColor.trim()
  const colorOk = COLOR_PATTERN.test(color)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaved('')
    const n = name.trim()
    const k = characterKey.trim()
    if (n.length < 1 || n.length > NAME_MAX) return setError(`이름은 1~${NAME_MAX}자여야 합니다.`)
    if (!KEY_PATTERN.test(k)) return setError('인물 ID는 영문 소문자·숫자·-·_ 50자 이하여야 합니다. (예: delta)')
    if (!colorOk) return setError('색은 #RRGGBB 형식이어야 합니다. (예: #FF9A3C)')
    const req: AdminCharacterRequest = { name: n, characterKey: k, tagColor: color.toUpperCase(), protagonist }
    setBusy(true)
    try {
      const res = item ? await updateCharacter(item.characterId, req) : await createCharacter(req)
      onSaved(res)
      setTagColor(res.tagColor)
      setSaved(item ? '저장했습니다. 게임을 다시 켜거나 로그인하면 반영됩니다.' : `등록했습니다. (#${res.characterId})`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!item) return
    if (!window.confirm(`'${item.name}'을(를) 삭제할까요?\n\n이 인물의 대사는 기본 이름표 색을 쓰게 됩니다.`)) return
    setBusy(true)
    try {
      await deleteCharacter(item.characterId)
      onDeleted(item.characterId)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <form className="card form compact" onSubmit={submit}>
      <div className="row title-row">
        <h3 className="card-title">{item ? `인물 수정 #${item.characterId}` : '새 인물'}</h3>
        <div className="row nowrap-row">
          {item && (
            <button type="button" className="danger small-btn" disabled={busy} onClick={() => void remove()}>
              삭제
            </button>
          )}
          <button type="button" className="secondary small-btn" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
      <div className="grid3">
        <label>
          이름 ({name.trim().length}/{NAME_MAX}) · 대사의 화자와 같게
          <input value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="델타" required />
        </label>
        <label>
          인물 ID · 일러스트 폴더 (Portraits/ID)
          <input value={characterKey} maxLength={50} onChange={(e) => setCharacterKey(e.target.value)} placeholder="delta" required />
        </label>
        <label className="inline">
          <input type="checkbox" checked={protagonist} onChange={(e) => setProtagonist(e.target.checked)} /> 주인공 (대화창 왼쪽)
        </label>
      </div>
      <label>
        이름표 색
        <div className="row nowrap-row" style={{ alignItems: 'center', gap: 8 }}>
          <input
            type="color"
            value={colorOk ? color.toLowerCase() : '#c3a6ff'}
            onChange={(e) => setTagColor(e.target.value.toUpperCase())}
            style={{ width: 48, height: 36, padding: 0 }}
            aria-label="색 고르기"
          />
          <input
            value={tagColor}
            maxLength={7}
            onChange={(e) => setTagColor(e.target.value)}
            placeholder="#FF9A3C"
            style={{ width: 110, fontFamily: 'monospace' }}
            aria-invalid={!colorOk}
          />
          <NameTag name={name.trim()} color={color} />
        </div>
      </label>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {PALETTE.map((p) => (
          <button
            key={p.color}
            type="button"
            title={`${p.label} ${p.color}`}
            onClick={() => setTagColor(p.color)}
            style={{
              width: 28,
              height: 28,
              padding: 0,
              background: p.color,
              border: color.toUpperCase() === p.color ? '3px solid #22d3ee' : '2px solid #0c0a18',
            }}
          />
        ))}
      </div>
      {!colorOk && <p className="error small">#RRGGBB 형식으로 입력해 주세요. (예: #FF9A3C)</p>}
      {error && <p className="error">{error}</p>}
      {saved && <p className="success">{saved}</p>}
      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? '저장 중...' : item ? '저장' : '등록'}
        </button>
      </div>
    </form>
  )
}
