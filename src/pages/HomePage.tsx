import { Link } from 'react-router-dom'
import { useAuth } from '../auth/context'

const SHORTCUTS: { to: string; title: string; desc: string }[] = [
  { to: '/reports', title: '신고', desc: '접수된 신고 확인과 처리' },
  { to: '/users', title: '유저 관리', desc: '검색, 코인 조정, 권한 변경, 정지' },
  { to: '/mails', title: '우편 발송', desc: '전체 또는 지정한 사용자에게 보상' },
  { to: '/notices', title: '공지사항', desc: '게임 공지 작성, 예약, 숨김' },
  { to: '/stages', title: '레이어·작전', desc: '레이어·작전·공식 스테이지와 맵 편집' },
  { to: '/items', title: '아이템', desc: '상점 아이템 등록, 판매 중단' },
  { to: '/guidebooks', title: '도감', desc: '이상 개체·용어 항목' },
  { to: '/word-lists', title: '단어 목록', desc: '감염된 컴퓨터 타자 해킹 단어' },
]

export default function HomePage() {
  const { admin } = useAuth()
  return (
    <section>
      <h2>운영툴</h2>
      <p className="muted">{admin?.nickname ?? admin?.email} 님으로 로그인했습니다.</p>
      <div className="shortcuts">
        {SHORTCUTS.map((s) => (
          <Link key={s.to} to={s.to} className="card shortcut">
            <b>{s.title}</b>
            <span className="muted small">{s.desc}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
