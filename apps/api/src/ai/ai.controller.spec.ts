import { type INestApplication, StandardSchemaValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SessionGuard, type AuthedRequest } from '../auth/auth.guard.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';

describe('the AI routes', () => {
  let app: INestApplication;
  const ai = {
    status: vi.fn(async () => ({ enabled: true, model: 'fake/model', search: 'native', remainingToday: 5 })),
    webCheck: vi.fn(async () => ({ finding: { outcome: 'not_found' }, cached: false, remainingToday: 4 })),
  };
  let signedIn = true;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [AiController], providers: [{ provide: AiService, useValue: ai }] })
      .overrideGuard(SessionGuard)
      .useValue({
        canActivate: (ctx: { switchToHttp: () => { getRequest: () => AuthedRequest } }) => {
          if (!signedIn) return false;
          ctx.switchToHttp().getRequest().auth = { sessionId: 's', user: { id: 'u1', role: 'user' } } as AuthedRequest['auth'];
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
  });
  afterAll(() => app.close());

  it('answers the status for the signed-in account', async () => {
    const res = await request(app.getHttpServer()).get('/api/ai/status').expect(200);
    expect(res.body).toEqual({ enabled: true, model: 'fake/model', search: 'native', remainingToday: 5 });
    expect(ai.status).toHaveBeenCalledWith({ id: 'u1', role: 'user' });
  });

  it('runs a web check with the checked body and a cancellation signal', async () => {
    const res = await request(app.getHttpServer()).post('/api/ai/web-check').send({ raw: '  Smith (2020). A title.  ', verdict: 'not_found' }).expect(200);
    expect(res.body.remainingToday).toBe(4);
    const [user, body, signal] = ai.webCheck.mock.calls[0]! as unknown as [unknown, unknown, AbortSignal];
    expect(user).toEqual({ id: 'u1', role: 'user' });
    expect(body).toEqual({ raw: 'Smith (2020). A title.', verdict: 'not_found' });
    expect(signal).toBeInstanceOf(AbortSignal);
    // The answer was sent, so the run is not treated as abandoned.
    expect(signal.aborted).toBe(false);
  });

  it.each([
    [{ verdict: 'not_found' }],
    [{ raw: '', verdict: 'not_found' }],
    [{ raw: 'x'.repeat(4001), verdict: 'not_found' }],
    [{ raw: 'Smith (2020)', verdict: 'made_up' }],
    [{ raw: 'Smith (2020)', verdict: 'not_found', fresh: 'yes' }],
  ])('refuses a malformed body %#', async (body) => {
    ai.webCheck.mockClear();
    await request(app.getHttpServer()).post('/api/ai/web-check').send(body).expect(400);
    expect(ai.webCheck).not.toHaveBeenCalled();
  });

  it('needs a session', async () => {
    signedIn = false;
    try {
      await request(app.getHttpServer()).get('/api/ai/status').expect(403);
    } finally {
      signedIn = true;
    }
  });
});
