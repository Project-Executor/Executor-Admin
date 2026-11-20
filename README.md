# Executor 운영툴 (Executor-Admin)

Executor(집행자) 게임의 관리자 웹. 유저 관리, 메일 발송, 공지사항, 신고 처리, 레이어·작전·스테이지(격자 맵 에디터), 아이템, 도감, 단어 목록을 관리한다.
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
│   ├── admin.ts       관리자 API 함수 (기능을 추가할 때 여기에 더한다)
│   └── types.ts       서버 응답 형식
├── auth/              로그인 상태 (AuthProvider, useAuth)
├── components/
│   ├── Layout.tsx     왼쪽 메뉴 + 본문
│   ├── MapEditor.tsx  격자 맵 에디터 (칠하기·오브젝트 속성·별 조건·화면 설정·최소 턴)
│   ├── mapData.ts     맵 JSON ↔ 격자 변환과 검증 (규칙: Executor-Server docs/map-data.md)
│   └── mapSolver.ts   구간별 최소 턴 계산 (기준 턴 추천)
└── pages/             화면 (메뉴 하나에 파일 하나)
```

## 맵 에디터

레이어·작전 → 스테이지 → 맵에서 연다. 지형·시작 위치·오브젝트는 격자에서, 대화·안내·스토리는 **JSON 직접 편집**에서 고친다.

- 도구: 벽·바닥, 시작 위치, 출구·상자·방화벽·열쇠·문·인물·체크포인트·데이터 파편·이상 개체·가짜 벽·감염된 컴퓨터
- 오른쪽 칸: 크기, 화면 칸 수·미니맵 밝힘 범위, 별 2·별 3 조건, 고른 오브젝트 속성
- **검증**: 저장 전에 문서 규칙(출구 1개, 열쇠 없는 문, 체크포인트 번호, 컴퓨터 설정, JSON 모양 등)을 경고로 보여 준다
- **최소 턴 계산**: 구간마다 최소 턴과 추천 기준 턴(× 1.5)을 계산하고 "추천값 적용"으로 넣는다

## 빌드·배포

```bash
npm run build      # dist/ 에 정적 파일 생성
npm run lint
```

- 배포 빌드의 API 주소는 `VITE_API_BASE` (예: `https://executor-server-production-032d.up.railway.app/api`)
- Railway에 배포 예정. 배포 주소를 서버의 CORS 허용 목록에 넣어야 한다.

## 메뉴

| 메뉴 | 하는 일 |
| --- | --- |
| 메일 발송 | 전체 또는 지정한 사용자에게 코인·아이템 보상 |
| 공지사항 | 작성, 예약 게시, 상단 고정, 숨김 |
| 유저 관리 | 검색(닉네임·ID), 상세(기록·보유 아이템), 코인 조정, 권한 변경, 정지·해제 |
| 신고 | 접수된 신고 확인과 상태 변경 (접수 → 처리 중 → 완료) |
| 레이어·작전 | 레이어(대주제) > 작전 > 공식 스테이지 트리, 스테이지 등록·맵 편집 |
| 아이템 | 상점 아이템(스킨·테마) 등록, 판매 중단 |
| 도감 | 이상 개체·용어 항목 (맵의 이상 개체가 도감 ID로 해금) |
| 단어 목록 | 감염된 컴퓨터 타자 해킹 단어 (맵의 컴퓨터가 목록을 고른다) |
