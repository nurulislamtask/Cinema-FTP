// Desktop entry: re-uses the ORIGINAL Express backend (api/index.ts) unchanged
// and serves the ORIGINAL built frontend (dist/) from it, exactly like `npm start`.
import express from 'express';
import path from 'path';
import { app } from '../api/index';

export function startServer(distPath: string, port: number): Promise<number> {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : port);
    });
    server.on('error', reject);
  });
}
