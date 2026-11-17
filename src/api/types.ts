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
  /** 정지 기한. null이면 정지 아님, PERMANENT_UNTIL이면 영구. 지난 시각이면 이미 풀린 것 */
  suspendedUntil: string | null
  suspendReason: string | null
}

/** 영구 정지를 나타내는 기한 (서버 Account.PERMANENT) */
export const PERMANENT_UNTIL = '9999-12-31T23:59:59Z'

/** GET /admin/users/{id} */
export interface AdminUserDetail extends AdminUser {
  comment: string | null
  /** null이면 기본 스킨 */
  equippedSkinId: number | null
  /** null이면 기본 테마 */
  equippedThemeId: number | null
  /** 공식 스테이지 */
  clearedStageCount: number
  totalStars: number
  /** 수량 0인 힌트는 빠짐 */
  items: OwnedItem[]
}

export interface OwnedItem {
  itemId: number
  name: string
  itemType: ItemType
  quantity: number
  acquiredAt: string
}

/** PATCH /admin/users/{id}/coin */
export interface AdminCoinResponse {
  userId: number
  /** 조정한 뒤의 코인 */
  coin: number
}

// ---------- 공지 (/admin/notices) ----------
export type NoticeCategory = 'NOTICE' | 'UPDATE' | 'EVENT' | 'MAINTENANCE'

export const NOTICE_CATEGORY_LABEL: Record<NoticeCategory, string> = {
  NOTICE: '공지',
  UPDATE: '업데이트',
  EVENT: '이벤트',
  MAINTENANCE: '점검',
}

export interface AdminNotice {
  noticeId: number
  category: NoticeCategory
  title: string
  content: string
  isPinned: boolean
  /** false면 숨김 */
  isVisible: boolean
  /** 게시 시각. 미래면 예약 */
  publishedAt: string
  /** 게시 종료. null이면 계속 */
  endsAt: string | null
  /** 지금 게임에 보이는지 */
  isShown: boolean
  createdAt: string
  updatedAt: string
}

export interface AdminNoticeRequest {
  category: NoticeCategory
  /** 1~100자 */
  title: string
  /** 1~5000자 */
  content: string
  isPinned: boolean
  isVisible: boolean
  /** ISO UTC. null이면 등록은 지금, 수정은 기존 값 */
  publishedAt: string | null
  /** ISO UTC. null이면 계속 */
  endsAt: string | null
}
