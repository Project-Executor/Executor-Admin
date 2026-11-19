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
export type ItemType = 'SKIN' | 'THEME'

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
  /** 아이템이 없으면 0, 있으면 1 */
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

// ---------- 신고 (/admin/reports) ----------
export type ReportStatus = 'RECEIVED' | 'IN_PROGRESS' | 'DONE'

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  RECEIVED: '접수',
  IN_PROGRESS: '처리 중',
  DONE: '완료',
}

export interface AdminReport {
  reportId: number
  category: { categoryId: number; name: string }
  /** 탈퇴했으면 null */
  reporter: UserSummary | null
  /** 없거나 탈퇴했으면 null */
  targetUser: UserSummary | null
  /** 없거나 삭제됐으면 null. official이 false면 사용자 맵 */
  targetStage: { stageId: number; title: string; official: boolean } | null
  title: string
  comment: string | null
  status: ReportStatus
  createdAt: string
  /** DONE이 된 시각 */
  handledAt: string | null
}

/** PATCH /admin/reports/{id} */
export interface ReportStatusResponse {
  reportId: number
  status: ReportStatus
  handledAt: string | null
}

export const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  SKIN: '스킨',
  THEME: '테마',
}

/** POST·PUT /admin/items. PUT은 모든 값을 보낸다 */
export interface AdminItemRequest {
  /** 1~100자, 다른 아이템과 겹치면 409 */
  name: string
  /** 255자 이하, 비우면 null */
  image: string | null
  /** 255자 이하, 비우면 null */
  description: string | null
  /** 가진 사용자가 있으면 바꿀 수 없다 (400) */
  itemType: ItemType
  /** 0 이상 */
  price: number
  /** 등록할 때는 무시(항상 판매 중), 수정할 때는 필수 */
  isActive: boolean
}

// ---------- 작전·스테이지 (/admin/operations, /admin/stages) ----------
export type StageType = 'TUTORIAL' | 'NORMAL' | 'BOSS'

export const STAGE_TYPE_LABEL: Record<StageType, string> = {
  TUTORIAL: '튜토리얼',
  NORMAL: '일반',
  BOSS: '보스',
}

export interface AdminStageSummary {
  stageId: number
  stageNo: number
  stageType: StageType
  title: string
  parMoves: number
  rewardCoin: number
  updatedAt: string
}

/** GET /admin/word-lists 항목. 감염된 컴퓨터 타자 해킹 단어 */
export interface AdminWordList {
  wordListId: number
  name: string
  description: string | null
  words: string[]
}

export interface AdminWordListRequest {
  /** 1~100자, 겹치면 409 */
  name: string
  description: string | null
  /** 앞뒤 공백 제거, 빈 줄·중복 제외 후 1개 이상, 하나는 50자 이하 */
  words: string[]
}

/** GET /admin/layers 항목. 레이어(대주제) 안에 작전(소주제)이 들어간다 */
export interface AdminLayer {
  layerId: number
  name: string
  description: string | null
  /** 표시·플레이 순서 (튜토리얼 = 0), 레이어끼리 겹칠 수 없다 */
  sortOrder: number
  /** 소속 작전 수 (0이어야 삭제할 수 있다) */
  operationCount: number
}

export interface AdminLayerRequest {
  /** 1~100자, 겹치면 409 */
  name: string
  /** 255자 이하 */
  description: string | null
  /** 0 이상, 겹치면 409 */
  sortOrder: number
}

/** GET /admin/operations 항목 (플레이 순서: 레이어 -> 작전) */
export interface AdminOperationTree {
  operationId: number
  name: string
  description: string | null
  /** 레이어 안에서의 순서 (튜토리얼 = 0), 같은 레이어 안에서 겹칠 수 없다 */
  sortOrder: number
  layerId: number
  /** 번호 순 */
  stages: AdminStageSummary[]
}

export interface AdminOperationRequest {
  /** 1~100자, 겹치면 409 */
  name: string
  /** 255자 이하 */
  description: string | null
  /** 0 이상, 같은 레이어 안에서 겹치면 409 */
  sortOrder: number
  /** 소속 레이어 (필수) */
  layerId: number
}

export interface AdminOperation {
  operationId: number
  name: string
  description: string | null
  sortOrder: number
  layerId: number
}

/** GET /admin/stages/{id} */
export interface AdminStage {
  stageId: number
  operationId: number
  stageNo: number
  stageType: StageType
  title: string
  mapData: Record<string, unknown>
  parMoves: number
  rewardCoin: number
  createdAt: string
  updatedAt: string
}

export interface AdminStageRequest {
  operationId: number
  /** 1 이상, 작전 안에서 겹치면 409 */
  stageNo: number
  stageType: StageType
  /** 1~100자 */
  title: string
  /** JSON 객체 (문자열 아님) */
  mapData: Record<string, unknown>
  /** 1~9999 */
  parMoves: number
  /** 0 이상 */
  rewardCoin: number
}

// ---------- 도감 (/admin/guidebooks) ----------
export type GuidebookCategory = 'BUG' | 'VIRUS' | 'TERM'

export const GUIDEBOOK_CATEGORY_LABEL: Record<GuidebookCategory, string> = {
  BUG: '오류',
  VIRUS: '바이러스',
  TERM: '개발 용어',
}

export interface AdminGuidebook {
  guidebookId: number
  /** 처음 등장하는 공식 스테이지. 없거나 스테이지가 삭제됐으면 null */
  stageId: number | null
  category: GuidebookCategory
  title: string
  image: string | null
  comment: string
}

/** POST·PUT /admin/guidebooks (모든 값) */
export interface AdminGuidebookRequest {
  stageId: number | null
  category: GuidebookCategory
  /** 1~255자, 겹치면 409 */
  title: string
  /** 255자 이하 */
  image: string | null
  /** 1~10000자 */
  comment: string
}
