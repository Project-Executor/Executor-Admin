import { useState } from 'react'
import type { Role } from '../api/types'

/** 관리자 계정 표시. 일반 사용자(USER)는 아무것도 그리지 않는다 */
export default function RoleBadge({ role }: { role: Role }) {
  if (role !== 'ADMIN') return null
  return <span className="badge admin">관리자</span>
}

/** 정지 중인 계정 표시. 기한이 지난 정지는 서버가 풀린 것으로 보므로 표시하지 않는다 */
export function SuspendedBadge({ until }: { until: string | null }) {
  const [now] = useState(() => Date.now())
  if (until === null || new Date(until).getTime() <= now) return null
  return <span className="badge suspended">정지</span>
}
