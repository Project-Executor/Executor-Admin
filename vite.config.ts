import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// 개발 중에는 /api 요청을 서버로 넘긴다 (같은 출처처럼 동작해서 서버 CORS 설정 없이 개발 가능).
// 대상 서버는 .env.local 의 VITE_PROXY_TARGET (없으면 배포 서버).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_PROXY_TARGET || 'https://executor-server-production-032d.up.railway.app'
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true, secure: true },
      },
    },
  }
})
