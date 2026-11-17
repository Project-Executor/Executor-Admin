// 관리자 화면에서 쓰는 API. 기능을 추가할 때 여기에 함수를 더한다.
import { get, post } from './client'
import type { AdminItem, AdminMailRequest, AdminMailResponse, AdminUser, PageResponse, Role } from './types'

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

/** 우편 발송. 없는 사용자가 있으면 404로 아무에게도 보내지 않는다 */
export const sendMail = (request: AdminMailRequest) => post<AdminMailResponse>('/admin/mails', request)
