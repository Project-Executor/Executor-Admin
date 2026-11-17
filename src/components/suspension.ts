import { PERMANENT_UNTIL } from '../api/types'
import type { AdminUser } from '../api/types'

/** 지금 정지 중인지 (기한이 지났으면 풀린 것) */
export function isSuspended(u: Pick<AdminUser, 'suspendedUntil'>, now = Date.now()): boolean {
  return u.suspendedUntil !== null && new Date(u.suspendedUntil).getTime() > now
}

/** "영구" 또는 "2026. 11. 20. 오후 6:00까지" */
export function suspensionLabel(until: string): string {
  return until === PERMANENT_UNTIL ? '영구' : `${new Date(until).toLocaleString()}까지`
}
