import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { animeRouter } from './routes/anime.js';
import { proxyRouter } from './routes/proxy.js';
import { defaultCache } from './cache.js';
import { openApiSpec } from './swagger.js';

export function createApp() {
  const app = express();

  // Basic security & parsing
  app.set('trust proxy', true);
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Swagger Documentation
  app.get('/openapi.json', (req, res) => res.json(openApiSpec));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'animex-scraper',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      cache: defaultCache.getStats()
    });
  });

  // Cache management
  app.get('/api/cache/stats', (req, res) => {
    res.json({
      success: true,
      data: defaultCache.getStats()
    });
  });

  app.post('/api/cache/clear', (req, res) => {
    defaultCache.clear();
    res.json({
      success: true,
      message: 'Cache cleared successfully'
    });
  });

  // Mount API routers
  app.use('/api/proxy', proxyRouter);
  app.use('/api', animeRouter);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint ${req.method} ${req.originalUrl} not found`
      }
    });
  });

  // Global error handler
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      error: {
        code: err.code || 'INTERNAL_SERVER_ERROR',
        message: err.message || 'An unexpected error occurred'
      }
    });
  });

  return app;
}
