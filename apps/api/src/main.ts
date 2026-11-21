import 'reflect-metadata';
import { Logger, StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AppModule } from './app.module.js';
import { rejectCrossSiteMutations } from './common/origin.js';
import { AppConfig } from './config.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(AppConfig);
  const log = new Logger('Bootstrap');

  // The app runs behind the host's proxy; trust it for the client's address (rate limiting is per IP).
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  // A check with thousands of references is saved in one request.
  app.useBodyParser('json', { limit: '25mb' });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          // pdf.js parses uploaded PDFs in a worker; the reader previews free PDFs from other sites.
          workerSrc: ["'self'", 'blob:'],
          frameSrc: ['https:'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          // Only meaningful behind HTTPS; over plain http://localhost it would break the page's own requests.
          upgradeInsecureRequests: config.isProduction ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.setGlobalPrefix('api');
  app.use(rejectCrossSiteMutations);
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();

  // In production this server also serves the built web app. In development Vite serves it instead.
  const webDist = resolve(config.webDist ?? join(import.meta.dirname, '..', '..', 'web', 'dist'));
  const indexHtml = join(webDist, 'index.html');
  if (existsSync(indexHtml)) {
    app.useStaticAssets(webDist, {
      index: false,
      setHeaders: (res, path) => {
        // Built assets have a content hash in their name, so they can be cached for good.
        const hashed = /[\\/]assets[\\/]/.test(path);
        res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    // Link previews need absolute URLs, so the page carries a placeholder for the site's own address.
    const page = readFileSync(indexHtml, 'utf8');
    const siteUrl = (req: Request): string => {
      if (config.publicUrl) return config.publicUrl;
      const host = req.get('host') ?? '';
      // The Host header comes from the client: only echo it back when it is a plain host name.
      return /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host) ? `${req.protocol}://${host}` : '';
    };

    // The web app is a single page with client-side routes such as /results/123. When a browser asks for
    // one of those directly, no file matches: answer with the page and let the app take over. API
    // requests, and requests for files, pass through to their normal handling.
    app.use((req: Request, res: Response, next: NextFunction) => {
      const isPageLoad =
        (req.method === 'GET' || req.method === 'HEAD') &&
        req.path !== '/api' &&
        !req.path.startsWith('/api/') &&
        !/\.[a-z0-9]{2,5}$/i.test(req.path) &&
        !!req.accepts('html');
      if (!isPageLoad) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.type('html').send(page.replaceAll('__SITE_URL__', siteUrl(req)));
    });
    log.log(`Serving the web app from ${webDist}`);
  } else {
    log.log(`No web build at ${webDist}; serving the API only`);
  }

  await app.listen(config.port, '0.0.0.0');
  log.log(`Siyasat API listening on port ${config.port}`);
}

await bootstrap();
