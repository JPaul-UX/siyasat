import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

/**
 * Full account flow against Postgres: sign up, stay out of the checker, get approved, check a real
 * reference, then lose access again. Skips when no database was pointed at, so `pnpm test` still passes
 * in an environment with no Postgres.
 */
const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

run('account approval', () => {
  let app: INestApplication;
  const owner = { email: 'owner@example.com', password: 'owner-password-12' };
  const email = `ada-${Date.now()}@example.com`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = databaseUrl;
    process.env.ADMIN_EMAIL = owner.email;
    process.env.ADMIN_PASSWORD = owner.password;
    process.env.CONTACT_EMAIL = owner.email;
    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('../app.module.js');
    const { rejectCrossSiteMutations } = await import('../common/origin.js');
    const compiled = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = compiled.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(rejectCrossSiteMutations);
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('blocks the checker until the owner approves the account, including a direct API call', async () => {
    const http = app.getHttpServer();
    await request(http).get('/api/health').expect(200);
    await request(http).post('/api/workspaces').expect(404);
    await request(http).post('/api/verify').send({ raw: '10.1038/nature14539' }).expect(401);
    await request(http).get('/api/checks').expect(401);

    await request(http)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send(owner)
      .expect(403);

    const visitor = request.agent(http);
    const signedUp = await visitor
      .post('/api/auth/signup')
      .send({ name: 'Ada Lovelace', email, password: 'password12', note: 'Checking a thesis.' })
      .expect(201);
    expect(signedUp.body.user.status).toBe('pending');
    const cookie = String(signedUp.headers['set-cookie'] ?? '');
    expect(cookie).toMatch(/siyasat_session=/);
    expect(cookie).toMatch(/HttpOnly/i);

    const me = await visitor.get('/api/auth/me').expect(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.user.status).toBe('pending');

    const blocked = await visitor.post('/api/verify').send({ raw: '10.1038/nature14539' }).expect(403);
    expect(blocked.body.code).toBe('not_approved');
    expect(String(blocked.body.message)).toMatch(/waiting for approval/i);
    await visitor.get('/api/checks').expect(403);
    await visitor.get('/api/admin/users').expect(403);

    const admin = request.agent(http);
    const loggedIn = await admin.post('/api/auth/login').send(owner).expect(200);
    expect(loggedIn.body.user.role).toBe('admin');
    expect(loggedIn.body.user.status).toBe('approved');

    const list = await admin.get('/api/admin/users').expect(200);
    const person = list.body.users.find((u: { email: string }) => u.email === email);
    const self = list.body.users.find((u: { email: string }) => u.email === owner.email);
    expect(person).toBeTruthy();
    await admin.post(`/api/admin/users/${self.id}/revoke`).expect(403);

    await admin.post(`/api/admin/users/${person.id}/approve`).expect(200);
    const checks = await visitor.get('/api/checks').expect(200);
    expect(checks.body).toEqual([]);

    const verified = await visitor.post('/api/verify').send({ raw: '10.1038/nature14539' }).expect(201);
    expect(verified.body.result.verdict).not.toBe('error');
    expect(verified.body.result.match?.doi).toBe('10.1038/nature14539');

    await admin.post(`/api/admin/users/${person.id}/revoke`).expect(200);
    const after = await visitor.get('/api/auth/me').expect(200);
    expect(after.body.user.status).toBe('rejected');
    const revoked = await visitor.post('/api/verify').send({ raw: '10.1038/nature14539' }).expect(403);
    expect(revoked.body.code).toBe('not_approved');
    expect(String(revoked.body.message)).toMatch(/waiting for approval/i);

    const fresh = request.agent(http);
    const again = await fresh.post('/api/auth/login').send({ email, password: 'password12' }).expect(200);
    expect(again.body.user.status).toBe('rejected');
    await fresh.get('/api/checks').expect(403);
  }, 90_000);
});
