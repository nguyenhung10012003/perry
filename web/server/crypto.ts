import 'server-only';
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

/** 32 random bytes, base64url (43 characters): session ids, CSRF tokens and OAuth states. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function sha256hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Constant-time string comparison (false for different lengths). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Key that seals the Discord tokens kept in sessions: HKDF-SHA256(SESSION_SECRET, salt perry-web, info oauth-token-v1). */
export function deriveSealKey(sessionSecret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', sessionSecret, 'perry-web', 'oauth-token-v1', 32));
}

/** AES-256-GCM with a random 12-byte IV, stored as `v1.<iv>.<ciphertext>.<tag>` (base64url). */
export function seal(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), ciphertext.toString('base64url'), tag.toString('base64url')].join('.');
}

/** The plaintext, or null when the value was tampered with or sealed with another secret. */
export function open(key: Buffer, sealed: string): string | null {
  const [version, ivText, ciphertextText, tagText, extra] = sealed.split('.');
  if (version !== 'v1' || ivText === undefined || ciphertextText === undefined || tagText === undefined || extra !== undefined) {
    return null;
  }
  try {
    const iv = Buffer.from(ivText, 'base64url');
    const tag = Buffer.from(tagText, 'base64url');
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
