import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import healthRoutes from './routes/health.routes.js';
import mediaRoutes from './routes/media.routes.js';
import downloadRoutes from './routes/download.routes.js';
import { notFoundHandler } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';
import { initDownloadService } from './services/download.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const app = express();

// Security & Environment configurations
app.disable('x-powered-by');

// CORS configuration
const allowedOrigins = env.FRONTEND_ORIGIN.split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or same-origin static frontend)
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS not allowed from this origin.'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Request body parser with size limit
app.use(express.json({ limit: env.BODY_LIMIT }));

// Lightweight development logger
if (env.NODE_ENV !== 'test') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
    });
    next();
  });
}

// Serve static frontend from root directory
// NOTE: temp/ directory is intentionally excluded from static serving.
// Explicit public surface. Never serve server code, temp files, tests or configuration.
app.get('/', (req, res) => res.sendFile(path.join(rootDir, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(rootDir, 'index.html')));
for (const directory of ['css', 'js', 'assets']) {
  app.use(`/${directory}`, express.static(path.join(rootDir, directory), {
    dotfiles: 'deny', maxAge: env.NODE_ENV === 'production' ? '1d' : '0'
  }));
}

// API v1 routes
app.use('/api/v1', healthRoutes);
app.use('/api/v1', mediaRoutes);
app.use('/api/v1', downloadRoutes);

// 404 handler for unmatched API routes
app.use('/api/*', notFoundHandler);

// Centralized error handler
app.use(errorHandler);

// Initialize download service (create temp dir, clean stale jobs)
// Run after app is created so it doesn't block the export.
initDownloadService().catch(err => {
  console.error('[MediaFetch] Download storage initialization failed.');
});

