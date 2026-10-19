import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Порт 5173 уже дозволений у CORS бекенду (CORS_ORIGINS за замовчуванням).
  // strictPort: якщо порт зайнятий, Vite не перейде на інший, з якого API відповідати не буде
  server: { port: 5173, strictPort: true }
})
