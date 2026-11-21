import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('accepts the password that was hashed and rejects anything else', async () => {
    const stored = await hashPassword('correct horse');
    expect(stored.startsWith('scrypt$16384$8$1$')).toBe(true);
    expect(stored.includes('correct horse')).toBe(false);
    expect(await verifyPassword('correct horse', stored)).toBe(true);
    expect(await verifyPassword('wrong horse', stored)).toBe(false);
    expect(await verifyPassword('correct horse', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('correct horse', 'scrypt$16384$8$1$salt$not-base64url!!')).toBe(false);
  });
});
