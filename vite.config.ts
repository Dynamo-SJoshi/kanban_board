import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react' // or '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // 👈 Add this line here
  ],
})