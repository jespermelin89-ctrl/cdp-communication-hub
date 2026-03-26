import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const ENCODING: BufferEncoding = 'hex';

/**
 * Get encryption key from environment variable.
 * Key must be 32 bytes (64 hex characters).
 */
function getKey(): Buffer {
  const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
  }
  return key;
}

/**
 * Encrypt a plaintext string.
 * Returns: iv:encrypted:authTag (all hex-encoded)
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', ENCODING);
  encrypted += cipher.final(ENCODING);

  const authTag = cipher.getAuthTag();

  return `${iv.toString(ENCODING)}:${encrypted}:${authTag.toString(ENCODING)}`;
}

/**
 * Decrypt an encrypted string.
 * Input format: iv:encrypted:authTag (all hex-encoded)
 */
export function decrypt(encryptedText: string): string {
  const key = getKey();
  const parts = encryptedText.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format');
  }

  const iv = Buffer.from(parts[0], ENCODING);
  const encrypted = parts[1];
  const authTag = Buffer.from(parts[2], ENCODING);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, ENCODING, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generate a random encryption key (for setup).
 * Returns a 64-character hex string (32 bytes).
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
