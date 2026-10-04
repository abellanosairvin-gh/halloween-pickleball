import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Plugin, type ViteDevServer } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Serves the Vercel functions in api/ during `npm run dev`, so the whole app runs locally
 * against the database in .env. On Vercel the same files are deployed as functions.
 */
function localApi(): Plugin {
  return {
    name: 'local-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api', async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const name = (req.url ?? '').split('?')[0].replace(/^\/+|\/+$/g, '');
        if (!/^[a-z-]+$/.test(name)) return next();
        try {
          const mod = (await server.ssrLoadModule(`/api/${name}.ts`)) as Record<string, unknown>;
          const handler = mod[req.method ?? 'GET'] as ((r: Request) => Promise<Response>) | undefined;
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && chunks.length > 0;
          const request = new Request(`http://${req.headers.host}${req.originalUrl ?? req.url}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: hasBody ? Buffer.concat(chunks) : undefined,
          });
          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          server.ssrFixStacktrace(error as Error);
          next();
        }
      });
    },
  };
}

declare module 'node:http' {
  interface IncomingMessage {
    originalUrl?: string;
  }
}

export default defineConfig(({ mode }) => {
  // Server-only settings (DATABASE_URL, ORGANIZER_PASSWORD, SESSION_SECRET) for the local API.
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['DATABASE_URL', 'ORGANIZER_PASSWORD', 'SESSION_SECRET']) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }
  return {
    plugins: [react(), localApi()],
    define: {
      __HAS_DATABASE__: JSON.stringify(Boolean(process.env.DATABASE_URL)),
    },
    test: {
      include: ['tests/**/*.test.ts'],
      testTimeout: 30000,
    },
  };
});
