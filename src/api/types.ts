// Executor-Server 응답 형식 (Executor-Server docs/api-spec.md). 기능을 추가할 때 여기에 형식을 더한다.

export interface PageResponse<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export interface UserSummary {
  userId: number
  /** 가입 후 닉네임을 정하기 전이면 null */
  nickname: string | null
  equippedSkinId: number | null
}

export type Role = 'USER' | 'ADMIN'

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  accessTokenExpiresIn: number
  user: { userId: number; nickname: string | null; role: Role; hasNickname: boolean }
}

/** GET /profiles/me */
export interface MyProfile {
  userId: number
  email: string
  nickname: string | null
  comment: string | null
  coin: number
  role: Role
}

// ---------- 아이템 (GET /admin/items) ----------
export type ItemType = 'SKIN' | 'THEME' | 'HINT'

export interface AdminItem {
  itemId: number
  name: string
  image: string | null
  description: string | null
  itemType: ItemType
  price: number
  /** false면 판매 중단 (우편 보상으로는 보낼 수 있음) */
  isActive: boolean
  createdAt: string
}

// ---------- 우편 (POST /admin/mails) ----------
export interface AdminMailRequest {
  /** toAll이 false일 때 받는 사람 (최대 1000명, 중복은 한 번만) */
  receiverIds: number[] | null
  toAll: boolean
  /** 1~100자 */
  title: string
  /** 2000자 이하 */
  content: string | null
  /** 0~1,000,000 */
  rewardCoin: number
  rewardItemId: number | null
  /** 아이템이 없으면 0, 스킨·테마는 1, 힌트는 1~99 */
  rewardItemQuantity: number
  /** ISO-8601 UTC. null이면 무기한, 값이 있으면 지금보다 뒤 */
  expiresAt: string | null
}

export interface AdminMailResponse {
  sentCount: number
}

// ---------- 유저 (GET /admin/users) ----------
export interface AdminUser {
  userId: number
  email: string
  /** 가입 후 닉네임을 정하기 전이면 null */
  nickname: string | null
  role: Role
  coin: number
  createdAt: string
}
