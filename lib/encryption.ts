import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { logger } from './logger'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const KEY_LENGTH = 32

// Get or derive encryption key from environment
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    // Build-time / missing key: never throw at import time. Runtime is guarded by
    // docker-entrypoint and validateProductionEnvironment.
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
      logger.warn('ENCRYPTION_KEY not set in production')
    } else if (process.env.NODE_ENV !== 'production') {
      logger.warn('ENCRYPTION_KEY not set - using insecure fallback')
    }
    const secret = process.env.AUTH_SECRET || 'development-secret-fallback-build'
    const hash = createHash('sha256').update(secret).digest()
    return hash
  }

  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
  }

  return Buffer.from(key, 'hex')
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  
  const authTag = cipher.getAuthTag()
  
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey()
  const data = Buffer.from(ciphertext, 'base64')
  
  const iv = data.subarray(0, IV_LENGTH)
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ])
  
  return decrypted.toString('utf8')
}

// Store credentials as encrypted JSON
export function encryptCredentials(credentials: Record<string, unknown>): string {
  return encrypt(JSON.stringify(credentials))
}

export function decryptCredentials(ciphertext: string): Record<string, unknown> | null {
  try {
    return JSON.parse(decrypt(ciphertext))
  } catch {
    return null
  }
}

export function encryptionKeyFingerprint(): string {
  return createHash('sha256').update(getEncryptionKey()).digest('hex')
}
