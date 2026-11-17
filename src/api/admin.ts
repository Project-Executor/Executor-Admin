// 관리자 화면에서 쓰는 API. 기능을 추가할 때 여기에 함수를 더한다.
import { get, post } from './client'
import type { AdminItem, AdminMailRequest, AdminMailResponse, PageResponse, UserSummary } from './types'

/** 아이템 전체 (판매 중단 포함) */
export const fetchItems = () => get<AdminItem[]>('/admin/items')

/** 닉네임으로 사용자 검색 (부분 일치, 로그인한 관리자 본인은 빠짐) */
export const searchUsers = (nickname: string, size = 20) =>
  get<PageResponse<UserSummary>>(`/profiles/search?nickname=${encodeURIComponent(nickname)}&size=${size}`)

/** 우편 발송. 없는 사용자가 있으면 404로 아무에게도 보내지 않는다 */
export const sendMail = (request: AdminMailRequest) => post<AdminMailResponse>('/admin/mails', request)
