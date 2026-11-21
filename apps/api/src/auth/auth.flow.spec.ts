/**
 * The approval flow against a real Postgres. Skipped when DATABASE_URL is not set
 * (unit tests do not need a database). Run with the local database from `pnpm db:up`.
 */
import { StandardSchemaValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Account } from '@siyasat/core';
import request from 'supertest';
import { AppModule } from '../app.module.js';

try {
  process.loadEnvFile();
} catch {
  /* no apps/api/.env */
}
process.env.NODE_ENV = 'test';
process.env.ADMIN_EMAIL ??= 'jp.admin@example.com';
process.env.ADMIN_PASSWORD ??= 'admin-pass-123';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('accounts and approval', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  /** The name=value pair from a Set-Cookie header, which is all a later request should send back. */
  function sessionCookie(setCookie: string | string[] | undefined): string {
    const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    const line = list.find((item) => item.startsWith('siyasat_session='));
    if (!line) throw new Error('no session cookie');
    return line.split(';')[0]!;
  }

  it('refuses the checker until an admin approves the account, then a real citation check works', async () => {
    const email = `person.${Date.now()}@example.com`;
    const password = 'a-long-password';

    const blocked = await http().post('/api/verify').send({ raw: 'Attention is all you need. https://doi.org/10.48550/arXiv.1706.03762' });
    expect(blocked.status).toBe(401);

    const signed = await http().post('/api/auth/signup').send({ name: 'Ada Person', email, password });
    expect(signed.status).toBe(201);
    expect(signed.body.user.status).toBe('PENDING');
    const setCookie = signed.headers['set-cookie'];
    const cookie = sessionCookie(setCookie);
    expect(String(setCookie)).toMatch(/HttpOnly/i);

    const me = await http().get('/api/auth/me').set('Cookie', cookie!);
    expect(me.status).toBe(200);
    expect((me.body.user as Account).status).toBe('PENDING');

    const pendingCheck = await http()
      .post('/api/verify')
      .set('Cookie', cookie!)
      .send({ raw: 'Attention is all you need. https://doi.org/10.48550/arXiv.1706.03762' });
    expect(pendingCheck.status).toBe(403);
    expect(pendingCheck.body.message).toBe('Waiting for approval');

    const admin = await http().post('/api/auth/login').send({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    });
    expect(admin.status).toBe(200);
    expect(admin.body.user.role).toBe('ADMIN');
    const adminCookie = sessionCookie(admin.headers['set-cookie']);

    const users = await http().get('/api/admin/users').set('Cookie', adminCookie);
    expect(users.status).toBe(200);
    const created = (users.body as { id: string; email: string }[]).find((user) => user.email === email);
    expect(created).toBeTruthy();

    const stranger = await http().get('/api/admin/users').set('Cookie', cookie!);
    expect(stranger.status).toBe(403);

    const approved = await http().post(`/api/admin/users/${created!.id}/approve`).set('Cookie', adminCookie);
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('APPROVED');

    const checked = await http()
      .post('/api/verify')
      .set('Cookie', cookie!)
      .send({ raw: 'Vaswani, A. (2017). Attention is all you need. https://doi.org/10.48550/arXiv.1706.03762' });
    expect(checked.status).toBe(201);
    expect(checked.body.result.verdict).not.toBe('error');
    expect(String(checked.body.result.match?.doi ?? '').toLowerCase()).toContain('1706.03762');

    const revoked = await http().post(`/api/admin/users/${created!.id}/revoke`).set('Cookie', adminCookie);
    expect(revoked.status).toBe(200);
    expect(revoked.body.status).toBe('REJECTED');

    const after = await http()
      .post('/api/verify')
      .set('Cookie', cookie!)
      .send({ raw: 'Attention is all you need. https://doi.org/10.48550/arXiv.1706.03762' });
    expect(after.status).toBe(403);

    const gone = await http().post('/api/workspaces');
    expect(gone.status).toBe(404);
  }, 90_000);
});
