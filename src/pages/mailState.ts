import type { Role } from '../api/types'

/** 우편 받는 사람 */
export interface Receiver {
  userId: number
  nickname: string | null
  /** ID로 직접 추가하면 모름 */
  role?: Role
}

/** 다른 화면에서 받는 사람을 채워 /mails로 넘길 때 쓰는 location.state */
export interface MailPageState {
  receivers?: Receiver[]
}
