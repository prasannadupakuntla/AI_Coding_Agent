import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { mentorMiddleware } from './server/index.ts'

function mentorApiPlugin(): Plugin {
  return {
    name: 'mentor-api-plugin',
    configureServer(server) {
      server.middlewares.use(mentorMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(mentorMiddleware);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mentorApiPlugin()],
})
