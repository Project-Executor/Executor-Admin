import type { AdminNotice } from '../api/types'

/** 게임에서 어떻게 보이는지 (숨김·예약·종료·게시 중). 서버의 isShown과 같은 기준 */
export function noticeStatus(
  n: Pick<AdminNotice, 'isVisible' | 'publishedAt' | 'endsAt'>,
  now: number,
): { label: string; className: string } {
  if (!n.isVisible) return { label: '숨김', className: 'muted-badge' }
  if (new Date(n.publishedAt).getTime() > now) return { label: '예약', className: 'scheduled' }
  if (n.endsAt !== null && new Date(n.endsAt).getTime() <= now) return { label: '종료', className: 'muted-badge' }
  return { label: '게시 중', className: 'live' }
}
