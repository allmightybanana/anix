import dotenv from 'dotenv';
import { createApp } from './app.js';

dotenv.config();

const port = parseInt(process.env.PORT || '3006', 10);
const host = process.env.HOST || '0.0.0.0';

const app = createApp();

const server = app.listen(port, host, () => {
  console.log(`===============================================`);
  console.log(`🚀 Animex Scraper API is running!`);
  console.log(`📍 Local:   http://localhost:${port}`);
  console.log(`📚 Swagger: http://localhost:${port}/docs`);
  console.log(`🩺 Health:  http://localhost:${port}/health`);
  console.log(`⚡ Zero-FlareSolverr direct scraper architecture`);
  console.log(`===============================================`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('\nShutting down server gracefully...');
  server.close(() => {
    console.log('Server closed. Goodbye!');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
