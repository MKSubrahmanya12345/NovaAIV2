import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'


// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'react'
          if (id.includes('node_modules/react-router-dom/')) return 'router'
          if (id.includes('node_modules/framer-motion/')) return 'motion'
          if (id.includes('node_modules/axios/')) return 'http'
          if (id.includes('node_modules/zustand/')) return 'state'
          if (id.includes('node_modules/avr8js/')) return 'simulator'
          if (id.includes('node_modules/react-hot-toast/')) return 'toast'
          return 'vendor'
        },
      },
    },
  },
})
