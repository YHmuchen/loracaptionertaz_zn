import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, '.', '');
  
  return {
    plugins: [react()],
    define: {
      // Expose the API_KEY from the environment to the client-side code.
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env': {} 
    },
    server: {
      port: 7860,
      host: true,
      proxy: {
        // Secure Bridge Proxy Implementation
        '/comfy-bridge': {
          target: 'http://localhost:8188', // Fallback target
          changeOrigin: true,
          secure: false,
          ws: true,
          router: (req: any) => { // Added explicit 'any' type
            // Dynamically determine target from header or query param
            const target = req.headers['x-bridge-target'] as string;
            if (target) return target;
            
            // For GET requests like images, target might be in query
            const url = new URL(req.url!, 'http://localhost');
            const queryTarget = url.searchParams.get('target_base');
            if (queryTarget) return queryTarget;

            return 'http://localhost:8188';
          },
          rewrite: (path: string) => path.replace(/^\/comfy-bridge/, ''),
          onProxyReq: (proxyReq: any) => { // Fixed implicit any and removed unused params
            // CRITICAL: Strip security headers that cause 403 on ComfyUI
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
            proxyReq.removeHeader('x-bridge-target'); // Clean up internal header
            
            // Also clean up query params used for routing
            if (proxyReq.path.includes('target_base=')) {
                proxyReq.path = proxyReq.path.replace(/[&?]target_base=[^&]*/, '');
                if (proxyReq.path.endsWith('?') || proxyReq.path.endsWith('&')) {
                    proxyReq.path = proxyReq.path.slice(0, -1);
                }
            }
          },
          onProxyRes: (proxyRes: any) => { // Fixed implicit any and removed unused params
            // Ensure CORS is handled by the proxy
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
          }
        }
      }
    },
    preview: {
      port: 7860,
      host: true,
      allowedHosts: true,
      proxy: {
        // Implementation duplicated for preview mode (HF Spaces production)
        '/comfy-bridge': {
          target: 'http://localhost:8188',
          changeOrigin: true,
          secure: false,
          ws: true,
          router: (req: any) => { // Added explicit 'any' type
            const target = req.headers['x-bridge-target'] as string;
            if (target) return target;
            const url = new URL(req.url!, 'http://localhost');
            const queryTarget = url.searchParams.get('target_base');
            return queryTarget || 'http://localhost:8188';
          },
          rewrite: (path: string) => path.replace(/^\/comfy-bridge/, ''),
          onProxyReq: (proxyReq: any) => { // Fixed implicit any
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
            proxyReq.removeHeader('x-bridge-target');
          }
        }
      }
    }
  };
});