import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createWordList, deleteWordList, fetchWordLists, updateWordList } from '../api/admin'
import { ApiError } from '../api/client'
import type { AdminWordList, AdminWordListRequest } from '../api/types'

const NAME_MAX = 100
const DESC_MAX = 255
const WORD_MAX = 50
const WORDS_MAX = 1000

/** 줄마다 단어 하나. 앞뒤 공백 제거, 빈 줄·중복 제거 (서버와 같은 규칙) */
function parseWords(text: string): string[] {
  const seen = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    const w = line.trim()
    if (w) seen.add(w)
  }
  return [...seen]
}

/** 타자 해킹 단어 목록 관리 (/api/admin/word-lists). 맵의 감염된 컴퓨터가 wordListId로 고른다 */
export default function WordListsPage() {
  const [items, setItems] = useState<AdminWordList[] | null>(null)
  const [error, setError] = useState('')
  /** null이면 폼 닫힘, 'new'면 등록, 항목이면 수정 */
  const [editing, setEditing] = useState<AdminWordList | 'new' | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchWordLists()
      .then(setItems)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : String(e)))
  }, [])

  function open(target: AdminWordList | 'new') {
    setEditing(target)
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function upsert(w: AdminWordList) {
    setItems((prev) => {
      if (!prev) return [w]
      return prev.some((i) => i.wordListId === w.wordListId)
        ? prev.map((i) => (i.wordListId === w.wordListId ? w : i))
        : [...prev, w].sort((a, b) => a.wordListId - b.wordListId)
    })
  }

  return (
    <section>
      <div className="row title-row">
        <h2>단어 목록</h2>
        <button type="button" onClick={() => open('new')}>
          새 목록
        </button>
      </div>
      <p className="muted">
        맵의 감염된 컴퓨터를 해킹할 때 치는 단어입니다. 맵 에디터에서 컴퓨터를 고르고 목록과 단어 수, 제한 시간을 정하면, 게임이 이 목록에서 단어를
        무작위로 뽑습니다. 목록을 지우면 그 목록을 쓰던 컴퓨터는 게임의 기본 단어를 씁니다.
      </p>

      <div ref={formRef}>
        {editing && (
          <WordListForm
            key={editing === 'new' ? 'new' : editing.wordListId}
            item={editing === 'new' ? null : editing}
            onSaved={(w) => {
              upsert(w)
              setEditing(w)
            }}
            onDeleted={(id) => {
              setItems((prev) => prev?.filter((i) => i.wordListId !== id) ?? null)
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
              <th>이름</th>
              <th className="num">단어 수</th>
              <th>단어</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((w) => (
              <tr key={w.wordListId} className={editing !== 'new' && editing?.wordListId === w.wordListId ? 'selected' : ''}>
                <td className="num">{w.wordListId}</td>
                <td>
                  {w.name}
                  {w.description && <div className="muted small">{w.description}</div>}
                </td>
                <td className="num">{w.words.length}</td>
                <td className="wrap muted small">
                  <div className="clamp">{w.words.join(', ')}</div>
                </td>
                <td className="actions-cell">
                  <button type="button" className="secondary small-btn" onClick={() => open(w)}>
                    수정
                  </button>
                </td>
              </tr>
            ))}
            {items && items.length === 0 && (
              <tr>
                <td colSpan={5} className="empty muted">
                  단어 목록이 없습니다. 목록이 없으면 게임은 기본 단어를 씁니다.
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

function WordListForm({
  item,
  onSaved,
  onDeleted,
  onClose,
}: {
  item: AdminWordList | null
  onSaved: (w: AdminWordList) => void
  onDeleted: (wordListId: number) => void
  onClose: () => void
}) {
  const [name, setName] = useState(item?.name ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [text, setText] = useState(item?.words.join('\n') ?? '')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)

  const words = parseWords(text)
  const tooLong = words.filter((w) => w.length > WORD_MAX)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaved('')
    const n = name.trim()
    if (n.length < 1 || n.length > NAME_MAX) return setError(`이름은 1~${NAME_MAX}자여야 합니다.`)
    if (words.length === 0) return setError('단어를 1개 이상 입력해 주세요.')
    if (words.length > WORDS_MAX) return setError(`단어는 ${WORDS_MAX}개 이하여야 합니다.`)
    if (tooLong.length) return setError(`단어는 ${WORD_MAX}자 이하여야 합니다: ${tooLong[0]}`)
    const req: AdminWordListRequest = { name: n, description: description.trim() || null, words }
    setBusy(true)
    try {
      const res = item ? await updateWordList(item.wordListId, req) : await createWordList(req)
      onSaved(res)
      setText(res.words.join('\n'))
      setSaved(item ? '저장했습니다.' : `등록했습니다. (#${res.wordListId}) 맵 에디터의 컴퓨터에서 이 ID를 고르면 됩니다.`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!item) return
    if (!window.confirm(`'${item.name}'을(를) 삭제할까요?\n\n이 목록을 쓰는 컴퓨터는 게임의 기본 단어를 쓰게 됩니다.`)) return
    setBusy(true)
    try {
      await deleteWordList(item.wordListId)
      onDeleted(item.wordListId)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <form className="card form compact" onSubmit={submit}>
      <div className="row title-row">
        <h3 className="card-title">{item ? `단어 목록 수정 #${item.wordListId}` : '새 단어 목록'}</h3>
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
          이름 ({name.trim().length}/{NAME_MAX})
          <input value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="span2">
          설명 (선택)
          <input value={description} maxLength={DESC_MAX} onChange={(e) => setDescription(e.target.value)} />
        </label>
      </div>
      <label>
        단어 (한 줄에 하나, {words.length}개{tooLong.length ? ` · ${WORD_MAX}자 넘는 단어 ${tooLong.length}개` : ''})
        <textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder={'sudo\ngit push\nnpm install'} />
      </label>
      <p className="muted small">앞뒤 공백, 빈 줄, 겹치는 단어는 저장할 때 빠집니다. 띄어쓰기가 있는 단어(예: git push)도 됩니다. 대소문자를 구분합니다.</p>
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
