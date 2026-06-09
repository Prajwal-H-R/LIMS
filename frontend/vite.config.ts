// import { defineConfig, loadEnv } from 'vite'
// import react from '@vitejs/plugin-react'
// import basicSsl from '@vitejs/plugin-basic-ssl'
// import path from 'path'
 
// export default defineConfig(({ mode }) => {
//   const env = loadEnv(mode, path.resolve(__dirname, '..'), '')
 
//   const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:8000'
 
//   return {
//     plugins: [
//       react(),
//       basicSsl()   // ✅ enables HTTPS
//     ],
//     envDir: path.resolve(__dirname, '..'),
//     server: {
//       host: true,
//       port: 3000,
//       https: true,   // ✅ enable HTTPS
//       watch: { usePolling: true },
//       proxy: {
//         '/api': {
//           target: proxyTarget,
//           changeOrigin: true,
//         },
//       },
//     },
//   }
// })
 
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
 
export default defineConfig(({ mode }) => {
  // ensure loadEnv always returns keys (third arg '')
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')
 
  // Proxy target used by Vite server (local -> localhost, docker -> backend)
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:8000'
 
  return {
    plugins: [react()],
    envDir: path.resolve(__dirname, '..'),
    server: {
      host: true,
      port: 3000,
      watch: { usePolling: true },
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          // optional: preserveHostHeader: true
        },
      },
    },
  }
})