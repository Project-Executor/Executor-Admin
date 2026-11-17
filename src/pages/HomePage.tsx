import { useAuth } from '../auth/context'

export default function HomePage() {
  const { admin } = useAuth()
  return (
    <section>
      <h2>운영툴</h2>
      <p className="muted">
        {admin?.nickname ?? admin?.email} 님으로 로그인했습니다. 왼쪽 메뉴에서 기능을 고르세요.
      </p>
      <div className="card">
        <h3>준비 중인 기능</h3>
        <ul>
          <li>작전·스테이지·도감 관리</li>
        </ul>
      </div>
    </section>
  )
}
