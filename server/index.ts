import express from 'express';
import cors from 'cors';
import path from 'path';
import { mkdir } from 'fs/promises';

import gamesRouter from './routes/games.js';
import artworkRouter from './routes/artwork.js';
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
app.use('/api/games', gamesRouter);
app.use('/api/games', artworkRouter);
app.use('/api/sync', syncRouter);
app.use('/api/labels', labelsRouter);
app.use('/api/cart-db', cartDbRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
async function start() {
  await ensureLocalDirs();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`API endpoints:`);
    console.log(`  GET  /api/games             - List all games`);
    console.log(`  GET  /api/games/:id/artwork - Get game artwork`);
    console.log(`  POST /api/games/:id/artwork - Upload artwork`);
    console.log(`  PATCH /api/games/:id        - Update game title/settings`);
    console.log(`  GET  /api/labels/status     - Check if labels are imported`);
    console.log(`  POST /api/labels/import-all - Import all labels from SD card`);
    console.log(`  POST /api/labels/import/:id - Import single label (debug)`);
    console.log(`  POST /api/labels/export     - Export labels to SD card`);
    console.log(`  GET  /api/labels/:cartId    - Get label image (from local)`);
    console.log(`  PUT  /api/labels/:cartId    - Update label image (local)`);
    console.log(`  GET  /api/labels/page/:page - Browse labels (paginated)`);
    console.log(`  GET  /api/sync/sd-cards     - Detect SD cards`);
    console.log(`  POST /api/sync/import       - Import from SD card`);
    console.log(`  POST /api/sync/export       - Export to SD card`);
    console.log(`  GET  /api/sync/diff         - Compare local vs SD`);
  });
}

start().catch(console.error);
