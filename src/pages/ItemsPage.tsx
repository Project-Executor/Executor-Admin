import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createItem, fetchItems, updateItem } from '../api/admin'
import { ApiError } from '../api/client'
import { ITEM_TYPE_LABEL } from '../api/types'
import type { AdminItem, AdminItemRequest, ItemType } from '../api/types'

const NAME_MAX = 100
const TEXT_MAX = 255
const TYPES = Object.keys(ITEM_TYPE_LABEL) as ItemType[]

/** 아이템 관리: 목록, 등록, 수정, 판매 중단·재개 (/api/admin/items). 삭제는 없다 */
export default function ItemsPage() {
  const [items, setItems] = useState<AdminItem[] | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<ItemType | ''>('')
  /** null이면 폼 닫힘, 'new'면 등록, 아이템이면 수정 */
  const [editing, setEditing] = useState<AdminItem | 'new' | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchItems()
      .then(setItems)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : String(e)))
  }, [])

  function upsert(item: AdminItem) {
    setItems((prev) => {
      if (!prev) return [item]
      return prev.some((i) => i.itemId === item.itemId)
        ? prev.map((i) => (i.itemId === item.itemId ? item : i))
        : [...prev, item].sort((a, b) => a.itemId - b.itemId)
    })
  }

  function open(target: AdminItem | 'new') {
    setEditing(target)
    // 목록 아래쪽에서 눌러도 폼이 보이게
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  async function toggleActive(item: AdminItem) {
    const next = !item.isActive
    const msg = next
      ? `'${item.name}'을(를) 다시 판매할까요?`
      : `'${item.name}'의 판매를 멈출까요?\n\n상점에서 사라지지만, 이미 가진 사람은 그대로 쓰고 우편 보상으로는 보낼 수 있습니다.`
    if (!window.confirm(msg)) return
    setError('')
    setBusyId(item.itemId)
    try {
      upsert(await updateItem(item.itemId, { ...toRequest(item), isActive: next }))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  const rows = (items ?? []).filter((i) => !filter || i.itemType === filter)

  return (
    <section>
      <div className="row title-row">
        <h2>아이템</h2>
        <button type="button" onClick={() => open('new')}>
          새 아이템
        </button>
      </div>
      <p className="muted">
        삭제는 없습니다. 상점에서 내리려면 판매를 멈추세요. 가격을 바꿔도 이미 산 사람에게는 영향이 없습니다.
      </p>

      <div ref={formRef}>
        {editing && (
          <ItemForm
            key={editing === 'new' ? 'new' : editing.itemId}
            item={editing === 'new' ? null : editing}
            onSaved={(item) => {
              upsert(item)
              setEditing(item)
            }}
            onClose={() => setEditing(null)}
          />
        )}
      </div>

      <div className="tabs" role="tablist">
        {[{ value: '' as const, label: '전체' }, ...TYPES.map((t) => ({ value: t, label: ITEM_TYPE_LABEL[t] }))].map((t) => (
          <button
            key={t.label}
            type="button"
            role="tab"
            aria-selected={filter === t.value}
            className={filter === t.value ? 'tab active' : 'tab'}
            onClick={() => setFilter(t.value)}
          >
            {t.label}
            {items && <small className="muted"> {items.filter((i) => !t.value || i.itemType === t.value).length}</small>}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="num">ID</th>
              <th>이름</th>
              <th>종류</th>
              <th className="num">가격</th>
              <th>상태</th>
              <th>설명</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.itemId} className={editing !== 'new' && editing?.itemId === i.itemId ? 'selected' : ''}>
                <td className="num">{i.itemId}</td>
                <td>
                  {i.name}
                  {i.image && (
                    <div className="muted small" title={i.image}>
                      {i.image}
                    </div>
                  )}
                </td>
                <td>{ITEM_TYPE_LABEL[i.itemType]}</td>
                <td className="num">{i.price.toLocaleString()}</td>
                <td>
                  <span className={`badge ${i.isActive ? 'live' : 'muted-badge'}`}>{i.isActive ? '판매 중' : '판매 중단'}</span>
                </td>
                <td className="wrap muted small">{i.description}</td>
                <td className="actions-cell">
                  <div className="row nowrap-row">
                    <button type="button" className="secondary small-btn" onClick={() => open(i)}>
                      수정
                    </button>
                    <button
                      type="button"
                      className={`small-btn ${i.isActive ? 'secondary' : ''}`}
                      disabled={busyId === i.itemId}
                      onClick={() => void toggleActive(i)}
                    >
                      {i.isActive ? '판매 중단' : '판매 재개'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="empty muted">
                  아이템이 없습니다.
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

function toRequest(i: AdminItem): AdminItemRequest {
  return {
    name: i.name,
    image: i.image,
    description: i.description,
    itemType: i.itemType,
    price: i.price,
    isActive: i.isActive,
  }
}

function ItemForm({
  item,
  onSaved,
  onClose,
}: {
  item: AdminItem | null
  onSaved: (item: AdminItem) => void
  onClose: () => void
}) {
  const [name, setName] = useState(item?.name ?? '')
  const [itemType, setItemType] = useState<ItemType>(item?.itemType ?? 'SKIN')
  const [price, setPrice] = useState(item ? String(item.price) : '0')
  const [image, setImage] = useState(item?.image ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [isActive, setIsActive] = useState(item?.isActive ?? true)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaved('')
    const n = name.trim()
    const p = Number(price)
    if (n.length < 1 || n.length > NAME_MAX) return setError(`이름은 1~${NAME_MAX}자여야 합니다.`)
    if (!Number.isInteger(p) || p < 0) return setError('가격은 0 이상 정수여야 합니다.')
    if (item && item.itemType !== itemType && !window.confirm('종류를 바꿀까요? 이미 가진 사람이 있으면 바꿀 수 없습니다.')) return

    const req: AdminItemRequest = {
      name: n,
      image: image.trim() || null,
      description: description.trim() || null,
      itemType,
      price: p,
      isActive,
    }
    setBusy(true)
    try {
      const res = item ? await updateItem(item.itemId, req) : await createItem(req)
      onSaved(res)
      setSaved(item ? '저장했습니다.' : `등록했습니다. (#${res.itemId})`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card form compact" onSubmit={submit}>
      <div className="row title-row">
        <h3 className="card-title">{item ? `아이템 수정 #${item.itemId}` : '새 아이템'}</h3>
        <button type="button" className="secondary small-btn" onClick={onClose}>
          닫기
        </button>
      </div>
      <div className="grid3">
        <label>
          이름 ({name.trim().length}/{NAME_MAX})
          <input value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          종류
          <select value={itemType} onChange={(e) => setItemType(e.target.value as ItemType)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {ITEM_TYPE_LABEL[t]} ({t})
              </option>
            ))}
          </select>
        </label>
        <label>
          가격 (코인)
          <input type="number" min={0} step={1} value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
      </div>
      <label>
        이미지 (경로나 키, {TEXT_MAX}자 이하, 선택)
        <input value={image} maxLength={TEXT_MAX} onChange={(e) => setImage(e.target.value)} />
      </label>
      <label>
        설명 ({description.trim().length}/{TEXT_MAX}, 선택)
        <input value={description} maxLength={TEXT_MAX} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {item ? (
        <label className="inline">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> 판매 중
        </label>
      ) : (
        <p className="muted small">새 아이템은 판매 중으로 등록됩니다.</p>
      )}
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
