// <input type="datetime-local">(PC 시간대) <-> 서버 ISO UTC 변환

/** ISO UTC -> 'YYYY-MM-DDTHH:mm' (PC 시간대) */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 'YYYY-MM-DDTHH:mm' (PC 시간대) -> ISO UTC (밀리초 없이). 잘못된 값이면 null */
export function fromLocalInput(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}
