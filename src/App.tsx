import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/context'
import Layout from './components/Layout.tsx'
import GuidebooksPage from './pages/GuidebooksPage.tsx'
import WordListsPage from './pages/WordListsPage.tsx'
import HomePage from './pages/HomePage.tsx'
import ItemsPage from './pages/ItemsPage.tsx'
import LoginPage from './pages/LoginPage.tsx'
import MailPage from './pages/MailPage.tsx'
import NoticeEditPage from './pages/NoticeEditPage.tsx'
import NoticesPage from './pages/NoticesPage.tsx'
import OperationsPage from './pages/OperationsPage.tsx'
import ReportsPage from './pages/ReportsPage.tsx'
import StageEditPage from './pages/StageEditPage.tsx'
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
        <Route path="items" element={<ItemsPage />} />
        <Route path="stages" element={<OperationsPage />} />
        <Route path="stages/new" element={<StageEditPage key="new" />} />
        <Route path="stages/:stageId" element={<StageEditPage />} />
        <Route path="guidebooks" element={<GuidebooksPage />} />
        <Route path="word-lists" element={<WordListsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:userId" element={<UserDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
