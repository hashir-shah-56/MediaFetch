import { app } from './app.js';
import { env } from './config/env.js';
import { downloadService } from './services/download.service.js';

const server = app.listen(env.PORT, () => {
  console.log(`MediaFetch server running at http://localhost:${env.PORT} [${env.NODE_ENV}]`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  downloadService.shutdown();
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

process.on('SIGINT', () => {
  downloadService.shutdown();
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
