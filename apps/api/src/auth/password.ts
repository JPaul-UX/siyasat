import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEYLEN = 32;
/** Node's default scrypt cost. Written into the stored hash so it can be changed later. */
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function derive(password: string, salt: string, options: { N: number; r: number; p: number; maxmem: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEYLEN, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/** A password hash. The plain password is never stored. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const key = await derive(password, salt, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${key.toString('base64url')}`;
}

/** True when `password` matches a value from hashPassword. False for anything malformed. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  if (![N, R, P].every((x) => Number.isInteger(x) && x > 0) || N > 1_048_576) return false;
  let key: Buffer;
  try {
    key = await derive(password, salt, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  } catch {
    return false;
  }
  const expected = Buffer.from(hash, 'base64url');
  if (key.length !== expected.length) return false;
  return timingSafeEqual(key, expected);
}
