import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

const ivLength = 16;
const saltLength = 64;
const keyLength = 32;
const algorithm = 'aes-256-gcm';

const scryptAsync = promisify(scrypt);

async function getKey(salt: Buffer): Promise<Buffer> {
  const secret = process.env.CRYPTO_SECRET_KEY;
  if (!secret) {
    throw new Error('CRYPTO_SECRET_KEY environment variable is not set.');
  }
  return (await scryptAsync(secret, salt, keyLength)) as Buffer;
}

export async function encrypt(text: string): Promise<string> {
  const salt = randomBytes(saltLength);
  const key = await getKey(salt);
  const iv = randomBytes(ivLength);
  const cipher = createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export async function decrypt(encryptedText: string): Promise<string> {
  try {
    const [saltHex, ivHex, authTagHex, encryptedHex] = encryptedText.split(':');
    if (!saltHex || !ivHex || !authTagHex || !encryptedHex) {
        throw new Error('Invalid encrypted text format');
    }
    const salt = Buffer.from(saltHex, 'hex');
    const key = await getKey(salt);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encryptedHex, 'hex'), decipher.final()]);
    return decrypted.toString();
  } catch(e) {
    console.error("Decryption failed:", e)
    throw new Error("Decryption failed");
  }
}
