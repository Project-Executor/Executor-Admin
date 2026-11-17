import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { fetchItems, searchUsers, sendMail } from '../api/admin'
import { ApiError } from '../api/client'
import type { AdminItem, AdminMailRequest, UserSummary } from '../api/types'

const TITLE_MAX = 100
const CONTENT_MAX = 2000
const COIN_MAX = 1_000_000
const RECEIVER_MAX = 1000

interface Receiver {
  userId: number
  nickname: string | null
}

/** 우편 발송 (POST /api/admin/mails). 전체 또는 지정한 사용자에게 코인·아이템을 첨부해 보낸다 */
export default function MailPage() {
  const [items, setItems] = useState<AdminItem[]>([])
  const [itemsError, setItemsError] = useState('')

  const [toAll, setToAll] = useState(false)
  const [receivers, setReceivers] = useState<Receiver[]>([])
  const [idInput, setIdInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<UserSummary[] | null>(null)
  const [searching, setSearching] = useState(false)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [coin, setCoin] = useState('0')
  const [itemId, setItemId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [noExpiry, setNoExpiry] = useState(true)
  const [expiresLocal, setExpiresLocal] = useState('')

  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetchItems()
      .then(setItems)
      .catch((e: unknown) => setItemsError(e instanceof ApiError ? e.message : String(e)))
  }, [])

  const item = useMemo(() => items.find((i) => String(i.itemId) === itemId) ?? null, [items, itemId])
  // 스킨·테마는 1개만, 힌트는 1~99
  const quantityFixed = item !== null && item.itemType !== 'HINT'

  function addReceivers(list: Receiver[]) {
    setReceivers((prev) => {
      const map = new Map(prev.map((r) => [r.userId, r]))
      for (const r of list) if (!map.has(r.userId)) map.set(r.userId, r)
      return [...map.values()]
    })
  }

  function addIds() {
    const ids = idInput
      .split(/[\s,]+/)
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n > 0)
    if (ids.length === 0) return
    addReceivers(ids.map((userId) => ({ userId, nickname: null })))
    setIdInput('')
  }

  async function search() {
    const k = keyword.trim()
    if (!k) return
    setSearching(true)
    try {
      setResults((await searchUsers(k)).content)
    } catch (e) {
      setResults([])
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSearching(false)
    }
  }

  /** 입력값 검사. 문제가 있으면 메시지, 없으면 요청 본문 */
  function buildRequest(): string | AdminMailRequest {
    if (!toAll && receivers.length === 0) return '받는 사람을 추가하거나 전체 발송을 고르세요.'
    if (!toAll && receivers.length > RECEIVER_MAX) return `한 번에 ${RECEIVER_MAX}명까지 보낼 수 있습니다.`
    const t = title.trim()
    if (t.length < 1 || t.length > TITLE_MAX) return `제목은 1~${TITLE_MAX}자여야 합니다.`
    if (content.length > CONTENT_MAX) return `내용은 ${CONTENT_MAX}자 이하여야 합니다.`
    const c = Number(coin || '0')
    if (!Number.isInteger(c) || c < 0 || c > COIN_MAX) return `코인은 0~${COIN_MAX.toLocaleString()} 사이 정수여야 합니다.`
    let q = 0
    if (item) {
      q = quantityFixed ? 1 : Number(quantity)
      if (!Number.isInteger(q) || q < 1 || q > 99) return '힌트 수량은 1~99개여야 합니다.'
    }
    let expiresAt: string | null = null
    if (!noExpiry) {
      if (!expiresLocal) return '만료 시각을 고르거나 무기한을 선택하세요.'
      const d = new Date(expiresLocal) // datetime-local은 PC 시간대 기준
      if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) return '만료 시각은 지금보다 뒤여야 합니다.'
      expiresAt = d.toISOString().replace(/\.\d{3}Z$/, 'Z')
    }
    return {
      receiverIds: toAll ? null : receivers.map((r) => r.userId),
      toAll,
      title: t,
      content: content.trim() ? content.trim() : null,
      rewardCoin: c,
      rewardItemId: item ? item.itemId : null,
      rewardItemQuantity: q,
      expiresAt,
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setResult('')
    const req = buildRequest()
    if (typeof req === 'string') {
      setError(req)
      return
    }
    const who = req.toAll ? '모든 사용자' : `${req.receiverIds!.length}명`
    const reward = [
      req.rewardCoin > 0 ? `코인 ${req.rewardCoin.toLocaleString()}` : null,
      item ? `${item.name} ×${req.rewardItemQuantity}` : null,
    ].filter(Boolean).join(', ') || '없음'
    const expiry = req.expiresAt ? new Date(req.expiresAt).toLocaleString() : '무기한'
    const summary = `받는 사람: ${who}\n제목: ${req.title}\n보상: ${reward}\n만료: ${expiry}`
    if (!window.confirm(`이 우편을 보낼까요?\n\n${summary}`)) return
    if (req.toAll && !window.confirm('모든 사용자에게 보냅니다. 보낸 우편은 되돌릴 수 없습니다. 정말 보낼까요?')) return

    setSending(true)
    try {
      const res = await sendMail(req)
      setResult(`${res.sentCount.toLocaleString()}명에게 보냈습니다.`)
      setTitle('')
      setContent('')
      setCoin('0')
      setItemId('')
      setQuantity('1')
      setReceivers([])
      setResults(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <section>
      <h2>우편 발송</h2>
      <p className="muted">코인·아이템을 첨부해 우편을 보냅니다. 보낸 우편은 되돌릴 수 없습니다.</p>

      <form className="card form" onSubmit={submit}>
        {/* 받는 사람 */}
        <fieldset>
          <legend>받는 사람</legend>
          <div className="row">
            <label className="inline">
              <input type="radio" checked={!toAll} onChange={() => setToAll(false)} /> 지정한 사용자
            </label>
            <label className="inline">
              <input type="radio" checked={toAll} onChange={() => setToAll(true)} /> 전체 사용자
            </label>
          </div>

          {!toAll && (
            <>
              <div className="row">
                <input
                  placeholder="닉네임 검색"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void search()
                    }
                  }}
                />
                <button type="button" className="secondary" onClick={() => void search()} disabled={searching}>
                  {searching ? '검색 중...' : '검색'}
                </button>
                <input
                  placeholder="사용자 ID (쉼표로 여러 명)"
                  value={idInput}
                  onChange={(e) => setIdInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addIds()
                    }
                  }}
                />
                <button type="button" className="secondary" onClick={addIds}>
                  ID 추가
                </button>
              </div>

              {results && (
                <div className="results">
                  {results.length === 0 && <span className="muted small">검색 결과가 없습니다.</span>}
                  {results.map((u) => (
                    <button
                      type="button"
                      key={u.userId}
                      className="chip add"
                      onClick={() => addReceivers([{ userId: u.userId, nickname: u.nickname }])}
                    >
                      + {u.nickname ?? '(닉네임 없음)'} <small>#{u.userId}</small>
                    </button>
                  ))}
                </div>
              )}

              <div className="results">
                {receivers.length === 0 && <span className="muted small">아직 추가한 사람이 없습니다.</span>}
                {receivers.map((r) => (
                  <span key={r.userId} className="chip">
                    {r.nickname ?? 'ID'} <small>#{r.userId}</small>
                    <button
                      type="button"
                      aria-label="빼기"
                      onClick={() => setReceivers((prev) => prev.filter((p) => p.userId !== r.userId))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <p className="muted small">
                {receivers.length}명 선택 (최대 {RECEIVER_MAX}명). 없는 ID가 섞여 있으면 아무에게도 보내지 않고 그 ID를 알려 줍니다.
              </p>
            </>
          )}
        </fieldset>

        {/* 내용 */}
        <fieldset>
          <legend>내용</legend>
          <label>
            제목 ({title.trim().length}/{TITLE_MAX})
            <input value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label>
            내용 ({content.length}/{CONTENT_MAX}, 선택)
            <textarea rows={5} value={content} maxLength={CONTENT_MAX} onChange={(e) => setContent(e.target.value)} />
          </label>
        </fieldset>

        {/* 보상 */}
        <fieldset>
          <legend>보상</legend>
          <div className="grid3">
            <label>
              코인 (0~{COIN_MAX.toLocaleString()})
              <input type="number" min={0} max={COIN_MAX} step={1} value={coin} onChange={(e) => setCoin(e.target.value)} />
            </label>
            <label>
              아이템
              <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
                <option value="">없음</option>
                {items.map((i) => (
                  <option key={i.itemId} value={i.itemId}>
                    [{i.itemType}] {i.name}
                    {i.isActive ? '' : ' (판매 중단)'}
                  </option>
                ))}
              </select>
              {itemsError && <span className="error small">아이템 목록을 불러오지 못했습니다: {itemsError}</span>}
            </label>
            <label>
              수량 {item ? (quantityFixed ? '(스킨·테마는 1개)' : '(힌트 1~99)') : ''}
              <input
                type="number"
                min={1}
                max={99}
                value={item ? (quantityFixed ? '1' : quantity) : '0'}
                disabled={!item || quantityFixed}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
          </div>
          <p className="muted small">이미 가진 스킨·테마를 받으면 받는 쪽에서 코인으로 바뀝니다.</p>
        </fieldset>

        {/* 만료 */}
        <fieldset>
          <legend>만료</legend>
          <div className="row">
            <label className="inline">
              <input type="checkbox" checked={noExpiry} onChange={(e) => setNoExpiry(e.target.checked)} /> 무기한
            </label>
            {!noExpiry && (
              <input type="datetime-local" value={expiresLocal} onChange={(e) => setExpiresLocal(e.target.value)} />
            )}
          </div>
          {!noExpiry && <p className="muted small">이 PC의 시간대 기준입니다. 서버에는 UTC로 저장됩니다.</p>}
        </fieldset>

        {error && <p className="error">{error}</p>}
        {result && <p className="success">{result}</p>}
        <div className="actions">
          <button type="submit" disabled={sending}>
            {sending ? '보내는 중...' : toAll ? '전체 발송' : '보내기'}
          </button>
        </div>
      </form>
    </section>
  )
}
