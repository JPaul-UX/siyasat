import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { PASSWORD } from '@siyasat/core';

/*
 * Passwords are hashed with scrypt, which is in Node itself and is slow and memory-hungry on purpose, so a
 * stolen table of hashes is expensive to guess at. The parameters are stored in each hash, so they can be
 * raised later and old hashes still check out (and are upgraded at the next sign-in).
 */

const PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;
const KEY_BYTES = 32;
/** scrypt needs 128 × N × r bytes: 32 MiB with the parameters above. Node's default ceiling is exactly that. */
const MAX_MEMORY = 96 * 1024 * 1024;

const scrypt = (password: string, salt: Buffer, length: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCallback(password.normalize('NFKC'), salt, length, { ...options, maxmem: MAX_MEMORY }, (err, key) => (err ? reject(err) : resolve(key))),
  );

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_BYTES, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [N, r, p] = parts.slice(1, 4).map(Number) as [number, number, number];
  if (![N, r, p].every((n) => Number.isSafeInteger(n) && n > 0)) return false;
  const expected = Buffer.from(parts[5]!, 'base64url');
  if (expected.length < 16) return false;
  const key = await scrypt(password, Buffer.from(parts[4]!, 'base64url'), expected.length, { N, r, p });
  return timingSafeEqual(key, expected);
}

/** Whether a hash was made with weaker parameters than today's. */
export const needsRehash = (stored: string): boolean => !stored.startsWith(`scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$`);

let decoy: Promise<string> | null = null;

/**
 * Do the work of checking a password against nothing. Used when there is no account for the address, so a
 * wrong address takes as long to refuse as a wrong password and the timing does not say which accounts exist.
 */
export async function verifyDecoy(password: string): Promise<void> {
  decoy ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(password, await decoy);
}

/** The passwords tried first by anyone guessing. A short list: length does most of the work. */
const COMMON = new Set(
  [
    'password', 'password1', 'password123', 'passw0rd', '12345678', '123456789', '1234567890', '11111111', '00000000',
    '87654321', 'qwertyui', 'qwerty123', 'qwertyuiop', '1q2w3e4r', '1qaz2wsx', 'asdfghjk', 'iloveyou', 'abc12345',
    'abcd1234', 'welcome1', 'letmein1', 'sunshine', 'princess', 'football', 'baseball', 'superman', 'trustno1',
    'changeme', 'admin123', 'administrator', 'siyasat', 'siyasat1', 'siyasat123', 'msuiit123', 'p@ssw0rd',
  ].map((p) => p.toLowerCase()),
);

/** What is wrong with a new password, in words for the person choosing it, or null if nothing is. */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < PASSWORD.min) return `Use at least ${PASSWORD.min} characters.`;
  if (password.length > PASSWORD.max) return `Use at most ${PASSWORD.max} characters.`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return 'That password is one of the first anyone would guess. Choose another.';
  if (/^(.)\1+$/.test(password)) return 'Use more than one character, repeated.';
  const local = email.split('@')[0]!.toLowerCase();
  if (local.length >= 4 && lower.includes(local)) return "Don't use your email address in your password.";
  return null;
}
