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
