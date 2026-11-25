import { useEffect, useState } from 'react'
import { deleteAllEventRecords, deleteEventRecord, fetchEventRanking, fetchWordLists } from '../api/admin'
import { ApiError } from '../api/client'
import type { AdminWordList, EventRanking, StageType } from '../api/types'
import { formatDateTime } from './datetime'

/** 타자 이벤트 설정 (map_data.event). 제한 시간 안에 친 단어 수로 순위를 매긴다 */
export interface TypingEventSettings {
  wordListId: number | null
  /** 초 */
  timeLimit: number
}

export const TYPING_TIME_MIN = 10
export const TYPING_TIME_MAX = 600
export const DEFAULT_TYPING: TypingEventSettings = { wordListId: null, timeLimit: 60 }

export function readTypingSettings(raw: unknown): TypingEventSettings {
  const e = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const id = Number(e.wordListId)
  const t = Number(e.timeLimit)
  return {
    wordListId: Number.isInteger(id) && id > 0 ? id : null,
    timeLimit: Number.isInteger(t) && t >= TYPING_TIME_MIN && t <= TYPING_TIME_MAX ? t : DEFAULT_TYPING.timeLimit,
  }
}

/** 타자 이벤트 설정 칸: 단어 목록과 제한 시간 */
export function TypingEventFields({ value, onChange }: { value: TypingEventSettings; onChange: (v: TypingEventSettings) => void }) {
  const [lists, setLists] = useState<AdminWordList[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchWordLists()
      .then((res) => {
        if (!cancelled) setLists(res)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const picked = lists?.find((l) => l.wordListId === value.wordListId)
  return (
    <div>
      <p className="muted small">
        게임은 이 단어 목록에서 단어를 끝없이 뽑아 보여 주고, 제한 시간 안에 맞게 친 단어 수로 순위를 매깁니다. 끝나면 이름을 입력받습니다. 맵(격자)은 쓰지
        않습니다.
      </p>
      <div className="grid3">
        <label className="span2">
          단어 목록
          <select
            value={value.wordListId ?? ''}
            onChange={(e) => onChange({ ...value, wordListId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">고르세요</option>
            {lists?.map((l) => (
              <option key={l.wordListId} value={l.wordListId}>
                {l.name} ({l.words.length}개)
              </option>
            ))}
          </select>
        </label>
        <label>
          제한 시간 (초, {TYPING_TIME_MIN}~{TYPING_TIME_MAX})
          <input
            type="number"
            min={TYPING_TIME_MIN}
            max={TYPING_TIME_MAX}
            step={1}
            value={value.timeLimit}
            onChange={(e) => onChange({ ...value, timeLimit: Number(e.target.value) })}
          />
        </label>
      </div>
      {picked && <p className="muted small">미리 보기: {picked.words.slice(0, 12).join(', ')}{picked.words.length > 12 ? ' …' : ''}</p>}
      {error && <p className="error small">단어 목록을 불러오지 못했습니다: {error}</p>}
    </div>
  )
}

/** 이벤트 순위 (저장된 이벤트 스테이지만). 부적절한 이름을 지우거나 전시 전에 초기화한다 */
export function EventRecordsPanel({ stageId, stageType }: { stageId: number; stageType: StageType }) {
  const [ranking, setRanking] = useState<EventRanking | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchEventRanking(stageId, 100)
      .then((res) => {
        if (!cancelled) {
          setRanking(res)
          setError('')
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [stageId, tick])

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await action()
      setTick((t) => t + 1)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const unit = stageType === 'EVENT_TYPING' ? '개' : '턴'
  return (
    <div className="card table-wrap">
      <div className="row title-row table-head">
        <h3 className="card-title">이벤트 순위 {ranking ? `(${ranking.total}명)` : ''}</h3>
        <div className="row nowrap-row">
          <button type="button" className="secondary small-btn" disabled={busy} onClick={() => setTick((t) => t + 1)}>
            새로고침
          </button>
          <button
            type="button"
            className="danger small-btn"
            disabled={busy || !ranking || ranking.total === 0}
            onClick={() => {
              if (window.confirm(`이 이벤트의 기록 ${ranking?.total ?? 0}개를 모두 지울까요? 되돌릴 수 없습니다.`))
                void run(() => deleteAllEventRecords(stageId))
            }}
          >
            기록 전부 지우기
          </button>
        </div>
      </div>
      <p className="muted small table-msg">
        {stageType === 'EVENT_TYPING' ? '제한 시간 안에 친 단어가 많을수록' : '기록(턴)이 적을수록'} 위입니다. 같은 점수는 같은 순위이고 이름순으로
        보입니다. 이름은 이 이벤트 안에서 겹칠 수 없습니다. 위에서 100명까지 보입니다.
      </p>
      {error && <p className="error table-msg">{error}</p>}
      <table className="table">
        <thead>
          <tr>
            <th className="num">순위</th>
            <th>이름</th>
            <th className="num">기록</th>
            <th>올린 시각</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {ranking?.rankings.map((r) => (
            <tr key={r.recordId}>
              <td className="num">{r.rank}</td>
              <td className="wrap">{r.name}</td>
              <td className="num">
                {r.score}
                {unit}
              </td>
              <td className="nowrap muted small">{formatDateTime(r.createdAt)}</td>
              <td className="actions-cell">
                <button
                  type="button"
                  className="danger small-btn"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`'${r.name}'의 기록을 지울까요?`)) void run(() => deleteEventRecord(stageId, r.recordId))
                  }}
                >
                  삭제
                </button>
              </td>
            </tr>
          ))}
          {ranking && ranking.rankings.length === 0 && (
            <tr>
              <td colSpan={5} className="empty muted">
                아직 기록이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
