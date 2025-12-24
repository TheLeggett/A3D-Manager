import express from 'express';
import cors from 'cors';
import path from 'path';
import { mkdir } from 'fs/promises';

import syncRouter from './routes/sync.js';
import labelsRouter from './routes/labels.js';
import cartDbRouter from './routes/cart-db.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Ensure local directory structure exists
async function ensureLocalDirs() {
  const localPath = path.join(process.cwd(), '.local', 'Library', 'N64');
  await mkdir(path.join(localPath, 'Games'), { recursive: true });
  await mkdir(path.join(localPath, 'Images'), { recursive: true });
}

// Routes
app.use('/api/sync', syncRouter);
app.use('/api/labels', labelsRouter);
app.use('/api/cart-db', cartDbRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
async function start() {
  await ensureLocalDirs();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch(console.error);
