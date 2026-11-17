import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/context'
import Layout from './components/Layout.tsx'
import HomePage from './pages/HomePage.tsx'
import LoginPage from './pages/LoginPage.tsx'
import MailPage from './pages/MailPage.tsx'
import NoticeEditPage from './pages/NoticeEditPage.tsx'
import NoticesPage from './pages/NoticesPage.tsx'
import ReportsPage from './pages/ReportsPage.tsx'
import UserDetailPage from './pages/UserDetailPage.tsx'
import UsersPage from './pages/UsersPage.tsx'

export default function App() {
  const { admin } = useAuth()

  // 저장된 로그인 확인 중
  if (admin === undefined) return <div className="center muted">확인 중...</div>

  if (admin === null) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="mails" element={<MailPage />} />
        <Route path="notices" element={<NoticesPage />} />
        <Route path="notices/new" element={<NoticeEditPage key="new" />} />
        <Route path="notices/:noticeId" element={<NoticeEditPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:userId" element={<UserDetailPage />} />
        {/* 기능 화면은 기능별 작업에서 추가: stages, items, guidebooks */}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
