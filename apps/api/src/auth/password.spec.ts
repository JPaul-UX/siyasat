import { describe, expect, it } from 'vitest';
import { hashPassword, needsRehash, passwordProblem, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('accepts the right password and refuses a wrong one', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('correct horse batterz', hash)).toBe(false);
  });

  it('salts every hash, so the same password never hashes the same way twice', async () => {
    expect(await hashPassword('same-password')).not.toBe(await hashPassword('same-password'));
  });

  it('treats the same characters typed differently as one password', async () => {
    // "é" as one code point, and as "e" plus a combining accent.
    const hash = await hashPassword('café-au-lait');
    expect(await verifyPassword('café-au-lait', hash)).toBe(true);
  });

  it('refuses a stored value that is not a hash it made', async () => {
    expect(await verifyPassword('anything', 'plain-text')).toBe(false);
    expect(await verifyPassword('anything', 'scrypt$x$8$1$abc$def')).toBe(false);
  });

  it('asks for a new hash when the parameters were weaker', () => {
    expect(needsRehash('scrypt$16384$8$1$salt$key')).toBe(true);
    expect(needsRehash('scrypt$32768$8$1$salt$key')).toBe(false);
  });
});

describe('choosing a password', () => {
  it('needs eight characters at least', () => {
    expect(passwordProblem('short', 'a@b.co')).toMatch(/at least 8/);
    expect(passwordProblem('long enough', 'a@b.co')).toBeNull();
  });

  it('refuses the passwords guessed first, and one character repeated', () => {
    expect(passwordProblem('Password123', 'a@b.co')).toMatch(/guess/);
    expect(passwordProblem('aaaaaaaaaa', 'a@b.co')).toMatch(/more than one character/);
  });

  it('refuses a password built from the email address', () => {
    expect(passwordProblem('juandelacruz2026', 'juandelacruz@example.com')).toMatch(/email/);
  });
});
