import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/context'
import Layout from './components/Layout.tsx'
import HomePage from './pages/HomePage.tsx'
import LoginPage from './pages/LoginPage.tsx'
import MailPage from './pages/MailPage.tsx'
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
        <Route path="users" element={<UsersPage />} />
        {/* 기능 화면은 기능별 작업에서 추가: notices, reports, stages, items, guidebooks */}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
