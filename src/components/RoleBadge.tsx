import type { Role } from '../api/types'

/** 관리자 계정 표시. 일반 사용자(USER)는 아무것도 그리지 않는다 */
export default function RoleBadge({ role }: { role: Role }) {
  if (role !== 'ADMIN') return null
  return <span className="badge admin">관리자</span>
}
