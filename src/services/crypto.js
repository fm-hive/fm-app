import * as ed25519 from '@noble/ed25519'
import { x25519, ed25519 as ed25519curve } from '@noble/curves/ed25519.js'
import { sha256, sha512 } from '@noble/hashes/sha2.js'
import { chacha20poly1305 } from '@noble/ciphers/chacha.js'

// Generate a new Ed25519 key pair
export async function generateKeyPair() {
  const { secretKey, publicKey } = await ed25519.keygenAsync()
  return { privateKey: secretKey, publicKey }
}

// Sign a message with private key
export async function signMessage(privateKey, message) {
  const signature = await ed25519.signAsync(message, privateKey)
  return signature
}

// Verify a signature with public key
export async function verifySignature(publicKey, signature, message) {
  return ed25519.verifyAsync(signature, message, publicKey)
}

// Convert raw bytes to hex string
export function toHex(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Convert hex string to bytes
export function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

// Compute SHA-256 hash and return hex string.
// Uses @noble/hashes so it works in any context (no Web Crypto dependency).
export function sha256Hex(data) {
  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data))
  return toHex(sha256(bytes))
}

// Base64Url encode (no padding)
export function base64UrlEncode(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  // Chunk the conversion: String.fromCharCode(...spread) overflows the call
  // stack for large payloads (e.g. refill responses bundling many messages).
  let binary = ''
  const CHUNK = 0x8000 // 32768
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  const base64 = btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Base64Url decode
export function base64UrlDecode(str) {
  // Add padding if needed
  let padded = str.replace(/-/g, '+').replace(/_/g, '/')
  while (padded.length % 4) {
    padded += '='
  }
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// Create JWS token compatible with backend (alg: EdDSA, kid: thumbprint)
// If publicKey is not provided, it will be derived from privateKey
export async function createJWS(privateKey, payload, publicKey = null) {
  let actualPublicKey = publicKey
  if (!actualPublicKey) {
    // Derive public key from private key
    actualPublicKey = await getPublicKeyFromPrivate(privateKey)
  }
  
  // Compute thumbprint for kid header
  const thumbprint = await computeThumbprint(actualPublicKey)
  
  const header = { 
    alg: 'EdDSA', 
    typ: 'JWT',
    kid: thumbprint
  }
  const headerEncoded = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)))
  const payloadEncoded = base64UrlEncode(new TextEncoder().encode(payload))
  
  const signingInput = `${headerEncoded}.${payloadEncoded}`
  const signature = await ed25519.signAsync(
    new TextEncoder().encode(signingInput),
    privateKey
  )
  const signatureEncoded = base64UrlEncode(signature)
  
  return `${headerEncoded}.${payloadEncoded}.${signatureEncoded}`
}

// Verify JWS token (for testing)
export async function verifyJWS(token, publicKey) {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWS format')
  }
  
  const [headerEncoded, payloadEncoded, signatureEncoded] = parts
  const signature = base64UrlDecode(signatureEncoded)
  
  const signingInput = `${headerEncoded}.${payloadEncoded}`
  const isValid = await ed25519.verifyAsync(
    signature,
    new TextEncoder().encode(signingInput),
    publicKey
  )
  
  if (!isValid) {
    throw new Error('Invalid signature')
  }
  return new TextDecoder().decode(base64UrlDecode(payloadEncoded))
}

// Decode the data string embedded in a JWS payload without verifying the signature
// (the server already verified it before delivery). Messages travel on the wire
// without a separate `data` field — the JWS payload carries it.
export function decodeJwsPayload(token) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) return ''
  try {
    return new TextDecoder().decode(base64UrlDecode(parts[1]))
  } catch {
    return ''
  }
}

// Generate a shared secret using X25519 (ECDH)
export async function computeSharedSecret(privateKey, publicKey) {
  // privateKey must be 32 bytes (Ed25519 private key can be used as X25519 private key)
  // publicKey must be 32 bytes (Ed25519 public key can be converted to X25519 public key)
  const sharedSecret = x25519.getSharedSecret(privateKey, publicKey)
  return sharedSecret
}

// Convert Ed25519 private key to X25519 private key (following RFC 8032)
export function ed25519PrivateKeyToX25519(privateKey) {
  if (typeof ed25519curve.utils?.toMontgomerySecret === 'function') {
    return ed25519curve.utils.toMontgomerySecret(privateKey)
  }
  const seed = privateKey.slice(0, 32)
  const hash = sha512(seed)
  const scalarBytes = hash.slice(0, 32)
  scalarBytes[0] &= 248
  scalarBytes[31] &= 127
  scalarBytes[31] |= 64
  return scalarBytes
}

// Convert Ed25519 public key to X25519 public key
export function ed25519PublicKeyToX25519(publicKey) {
  if (typeof ed25519curve.utils?.toMontgomery === 'function') {
    return ed25519curve.utils.toMontgomery(publicKey)
  }
  throw new Error('ed25519PublicKeyToX25519 requires utils.toMontgomery')
}

// Encrypt JWE compatible with Go backend (X25519 ECDH + ChaCha20-Poly1305)
export async function encryptJWE(plaintext, recipientX25519PublicKey) {
  // Generate ephemeral key pair
  const ephemeral = x25519.keygen()
  const ephemeralPrivateKey = ephemeral.secretKey
  const ephemeralPublicKey = ephemeral.publicKey
  
  // Compute shared secret
  const sharedSecret = x25519.getSharedSecret(ephemeralPrivateKey, recipientX25519PublicKey)
  
  // Derive encryption key: first 32 bytes of shared secret
  if (sharedSecret.length < 32) {
    throw new Error('Shared secret too short')
  }
  const key = sharedSecret.slice(0, 32)
  
  // Generate random nonce (12 bytes for ChaCha20-Poly1305)
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  
  // Encrypt with ChaCha20-Poly1305
  const cipher = chacha20poly1305(key, nonce)
  const ciphertext = cipher.encrypt(plaintext)
  
  // Encode components as base64url (no padding)
  const jwe = {
    ephemeral_public: base64UrlEncode(ephemeralPublicKey),
    nonce: base64UrlEncode(nonce),
    ciphertext: base64UrlEncode(ciphertext)
  }
  
  // Serialize to JSON and then base64url encode
  const jsonStr = JSON.stringify(jwe)
  return base64UrlEncode(new TextEncoder().encode(jsonStr))
}

// Decrypt JWE with X25519 private key
export async function decryptJWE(jweToken, recipientX25519PrivateKey) {
  // Decode base64url token
  const jsonBytes = base64UrlDecode(jweToken)
  const jsonStr = new TextDecoder().decode(jsonBytes)
  const jwe = JSON.parse(jsonStr)
  
  // Decode components
  const ephemeralPublicKey = base64UrlDecode(jwe.ephemeral_public)
  const nonce = base64UrlDecode(jwe.nonce)
  const ciphertext = base64UrlDecode(jwe.ciphertext)
  
  // Compute shared secret
  const sharedSecret = x25519.getSharedSecret(recipientX25519PrivateKey, ephemeralPublicKey)
  if (sharedSecret.length < 32) {
    throw new Error('Shared secret too short')
  }
  const key = sharedSecret.slice(0, 32)
  
  // Decrypt with ChaCha20-Poly1305
  const cipher = chacha20poly1305(key, nonce)
  const plaintext = cipher.decrypt(ciphertext)
  
  return plaintext
}

// Derive a symmetric key from shared secret using HKDF (simplified)
export async function deriveSymmetricKey(sharedSecret, salt, info) {
  // For simplicity, use SHA-256 of sharedSecret + salt + info
  // In production, use proper HKDF
  const data = new Uint8Array([...sharedSecret, ...salt, ...info])
  const hash = await crypto.subtle.digest('SHA-256', data)
  return new Uint8Array(hash)
}

// Encrypt a message with symmetric key (AES-GCM)
export async function encryptMessage(key, message) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encodedMessage = new TextEncoder().encode(message)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  )
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encodedMessage
  )
  return { iv, ciphertext: new Uint8Array(ciphertext) }
}

// Decrypt a message with symmetric key
export async function decryptMessage(key, iv, ciphertext) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertext
  )
  return new TextDecoder().decode(decrypted)
}

// Compute SHA256 thumbprint of public key (base64url encoded)
export async function computeThumbprint(publicKey) {
  // publicKey is Uint8Array
  const hash = await crypto.subtle.digest('SHA-256', publicKey)
  const hashBytes = new Uint8Array(hash)
  return base64UrlEncode(hashBytes)
}

// Get public key from private key (Ed25519)
export async function getPublicKeyFromPrivate(privateKey) {
  // Ed25519 private key is 64 bytes: 32 bytes seed + 32 bytes public key
  // The public key is the second half
  if (privateKey.length === 64) {
    return privateKey.slice(32)
  }
  // If private key is 32 bytes (seed), compute public key
  return ed25519.getPublicKey(privateKey)
}

