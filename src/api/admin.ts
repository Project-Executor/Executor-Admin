// 관리자 화면에서 쓰는 API. 기능을 추가할 때 여기에 함수를 더한다.
import { api, get, patch, post, put } from './client'
import type {
  AdminCoinResponse,
  AdminItem,
  AdminMailRequest,
  AdminMailResponse,
  AdminUser,
  AdminUserDetail,
  PageResponse,
  Role,
} from './types'

/** 아이템 전체 (판매 중단 포함) */
export const fetchItems = () => get<AdminItem[]>('/admin/items')

export interface UserQuery {
  /** 닉네임·이메일 일부 또는 사용자 ID. 비우면 전체 */
  keyword?: string
  /** 비우면 전체 */
  role?: Role | ''
  page?: number
  /** 1~50 */
  size?: number
}

/** 유저 목록·검색 (최근 가입순, 관리자 본인 포함) */
export function fetchUsers({ keyword = '', role = '', page = 0, size = 20 }: UserQuery = {}) {
  const q = new URLSearchParams({ page: String(page), size: String(size) })
  if (keyword.trim()) q.set('keyword', keyword.trim())
  if (role) q.set('role', role)
  return get<PageResponse<AdminUser>>(`/admin/users?${q}`)
}

/** ID로 한 번에 조회할 수 있는 수 (서버 AdminUserService.LOOKUP_MAX) */
export const LOOKUP_MAX = 100

/** ID로 여러 명 조회 (ID 순). 없는 ID는 결과에서 빠진다 */
export const lookupUsers = (ids: number[]) => get<AdminUser[]>(`/admin/users/by-ids?ids=${ids.join(',')}`)

/** 유저 상세 */
export const fetchUserDetail = (userId: number) => get<AdminUserDetail>(`/admin/users/${userId}`)

/** 코인 조정. amount가 음수면 뺀다 (0 미만이 되면 409 NOT_ENOUGH_COIN) */
export const adjustCoin = (userId: number, amount: number) =>
  patch<AdminCoinResponse>(`/admin/users/${userId}/coin`, { amount })

/** 권한 변경. 자기 자신은 바꿀 수 없다(400). 다음 토큰 재발급(최대 30분 뒤)부터 적용 */
export const changeRole = (userId: number, role: Role) => patch<AdminUser>(`/admin/users/${userId}/role`, { role })

/** 계정 정지. until(ISO UTC)이 null이면 영구. 이미 정지 중이면 새 값으로 바꾼다 */
export const suspendUser = (userId: number, until: string | null, reason: string) =>
  put<AdminUser>(`/admin/users/${userId}/suspension`, { until, reason })

/** 정지 해제 */
export const unsuspendUser = (userId: number) => api<AdminUser>('DELETE', `/admin/users/${userId}/suspension`)

/** 우편 발송. 없는 사용자가 있으면 404로 아무에게도 보내지 않는다 */
export const sendMail = (request: AdminMailRequest) => post<AdminMailResponse>('/admin/mails', request)
