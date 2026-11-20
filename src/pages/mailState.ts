import type { AdminUser, Role } from '../api/types'

/** 메일 받는 사람. 검색·ID 조회·유저 관리 어디서 추가하든 서버에서 확인한 사용자만 들어간다 */
export interface Receiver {
  userId: number
  nickname: string | null
  email: string
  role: Role
}

export const toReceiver = (u: AdminUser): Receiver => ({
  userId: u.userId,
  nickname: u.nickname,
  email: u.email,
  role: u.role,
})

/** 다른 화면에서 받는 사람을 채워 /mails로 넘길 때 쓰는 location.state */
export interface MailPageState {
  receivers?: Receiver[]
}
