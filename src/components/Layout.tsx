import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/context'

/** 메뉴. path가 없으면 아직 만들지 않은 기능 (준비 중으로 표시) */
const MENU: { label: string; path?: string }[] = [
  { label: '홈', path: '/' },
  { label: '우편 발송', path: '/mails' },
  { label: '공지사항', path: '/notices' },
  { label: '유저 관리', path: '/users' },
  { label: '신고', path: '/reports' },
  { label: '레이어·작전', path: '/stages' },
  { label: '아이템', path: '/items' },
  { label: '도감', path: '/guidebooks' },
]

export default function Layout() {
  const { admin, logout } = useAuth()
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          EXECUTOR
          <span>운영툴</span>
        </div>
        <nav>
          {MENU.map((m) =>
            m.path ? (
              <NavLink key={m.label} to={m.path} end={m.path === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                {m.label}
              </NavLink>
            ) : (
              <span key={m.label} className="disabled" title="준비 중">
                {m.label}
                <small>준비 중</small>
              </span>
            ),
          )}
        </nav>
        <div className="account">
          <div>{admin?.nickname ?? admin?.email}</div>
          <div className="muted small">{admin?.email}</div>
          <button className="ghost" onClick={() => void logout()}>
            로그아웃
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
