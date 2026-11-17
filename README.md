# Executor 운영툴 (Executor-Admin)

Executor(집행자) 게임의 관리자 웹. 우편 발송, 공지사항, 유저 관리, 신고 처리, 스테이지·아이템·도감 관리를 한다.
화면만 있는 프로젝트이고, 모든 기능은 [Executor-Server](https://github.com/Project-Executor/Executor-Server)의 관리자 API(`/api/admin/**`)를 호출한다.

```
Executor-Admin (브라우저) ──HTTPS + 관리자 Access Token──> Executor-Server /api/admin/** ──> MySQL
```

## 기술

- React 19 + TypeScript + Vite
- React Router
- 별도 UI 라이브러리 없이 CSS (`src/index.css`)

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
```

- 개발 서버는 `/api` 요청을 Executor-Server로 넘긴다(프록시). 그래서 서버 CORS 설정 없이 개발할 수 있다.
- 대상 서버는 `.env.local`의 `VITE_PROXY_TARGET` (`.env.example` 참고). 기본은 배포 서버.
  - 로컬 서버를 쓰려면 `VITE_PROXY_TARGET=http://localhost:8080`
- 일부 네트워크에서는 배포 서버(`*.up.railway.app`) 접속이 막혀 있다. 프록시가 502를 돌려주면 VPN을 켜거나 로컬 서버를 쓴다.

## 로그인

- **ADMIN 권한 계정**만 들어올 수 있다. 일반 계정으로 로그인하면 서버에서도 로그아웃하고 거부한다.
- 관리자 계정은 일반 회원가입 후 DB에서 `accounts.role`을 `ADMIN`으로 바꿔 만든다.
- 토큰은 `sessionStorage`에 둔다. 같은 탭에서 새로고침하면 이어지고, 탭을 닫으면 로그아웃된다.
- Access Token이 만료되면(`401 TOKEN_EXPIRED`) 자동으로 재발급하고 원래 요청을 다시 보낸다.

## 구조

```
src/
├── api/
│   ├── client.ts      API 호출 공통 (토큰 첨부, 재발급, ApiError)
│   └── types.ts       서버 응답 형식
├── auth/
│   ├── AuthContext.tsx  로그인 상태 (AuthProvider)
│   └── context.ts       useAuth
├── components/
│   └── Layout.tsx     왼쪽 메뉴 + 본문
└── pages/             화면 (기능별로 추가)
```

## 빌드·배포

```bash
npm run build      # dist/ 에 정적 파일 생성
npm run lint
```

- 배포 빌드의 API 주소는 `VITE_API_BASE` (예: `https://executor-server-production-032d.up.railway.app/api`)
- Railway에 배포 예정. 배포 주소를 서버의 CORS 허용 목록에 넣어야 한다.

## 기능 진행 상황

| 기능 | 서버 API | 화면 |
| --- | --- | --- |
| 관리자 로그인 | 있음 | 완료 |
| 우편 발송 | 있음 | 완료 |
| 신고 처리 | 있음 | 완료 |
| 아이템 | 있음 | 완료 |
| 작전·스테이지 | 있음 | 완료 |
| 도감 | 있음 | 예정 |
| 공지사항 | 있음 | 완료 |
| 유저 목록·검색 | 있음 | 완료 |
| 유저 상세·코인 조정·권한 변경 | 있음 | 완료 |
| 유저 정지·해제 | 있음 | 완료 |
