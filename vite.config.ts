import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages 처럼 하위 경로(/저장소이름/)로 서비스할 때는
// BASE_PATH=/저장소이름/ npm run build 로 빌드합니다.
// Vercel·Netlify·Cloudflare Pages 는 루트로 서비스하므로 그냥 두면 됩니다.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  resolve: {
    // mermaid 도 내부에서 katex 를 쓰기 때문에 묶어 주지 않으면 같은 코드가 두 벌 실립니다.
    dedupe: ['katex'],
  },
  build: {
    // 큰 청크는 전부 지연 로딩되는 mermaid·katex·highlight.js 입니다.
    // 첫 화면에 실리는 건 메인 번들뿐이라 경고 기준을 올려 둡니다.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        advancedChunks: {
          groups: [{ name: 'katex', test: /[\\/]node_modules[\\/]katex[\\/]/ }],
        },
      },
    },
  },
})
