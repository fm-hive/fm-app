// Local storage encryption service using Web Crypto API
// Derives an encryption key from user's private key

// Derive a stable encryption key from private key using HKDF
export async function deriveEncryptionKey(privateKey) {
  try {
    // Import private key as raw bytes for HKDF
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      privateKey,
      { name: 'HKDF' },
      false,
      ['deriveKey']
    );
    
    // Derive AES-GCM key using HKDF with salt (domain separation)
    const salt = new TextEncoder().encode('fm-protocol-storage-v1');
    const info = new TextEncoder().encode('local-storage-encryption');
    
    const derivedKey = await window.crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        salt,
        info,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    
    return derivedKey;
  } catch (error) {
    console.error('Failed to derive encryption key:', error);
    throw new Error(`Key derivation failed: ${error.message}`);
  }
}

// Encrypt data with AES-GCM
export async function encryptData(key, data) {
  try {
    // Convert data to JSON string
    const dataStr = JSON.stringify(data);
    const dataBytes = new TextEncoder().encode(dataStr);
    
    // Generate random IV (12 bytes for AES-GCM)
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt
    const encryptedBytes = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv
      },
      key,
      dataBytes
    );
    
    // Combine IV + ciphertext for storage
    const combined = new Uint8Array(iv.length + encryptedBytes.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedBytes), iv.length);
    
    // Convert to base64 for localStorage (chunked: spread overflows for large data)
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < combined.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, combined.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

// Decrypt data with AES-GCM
export async function decryptData(key, encryptedBase64) {
  try {
    // Convert from base64
    const binaryStr = atob(encryptedBase64);
    const combined = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      combined[i] = binaryStr.charCodeAt(i);
    }
    
    // Extract IV (first 12 bytes) and ciphertext
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    
    // Decrypt
    const decryptedBytes = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv
      },
      key,
      ciphertext
    );
    
    // Convert back to JSON
    const decryptedStr = new TextDecoder().decode(decryptedBytes);
    return JSON.parse(decryptedStr);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

// Check if encryption is available (Web Crypto API)
export function isEncryptionAvailable() {
  return typeof window !== 'undefined' && 
         window.crypto && 
         window.crypto.subtle &&
         typeof window.crypto.subtle.importKey === 'function';
}

// Generate a backup key for migration if private key changes (future use)
export async function generateBackupKey() {
  const key = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  
  // Export as raw bytes for storage (encrypted with user's key)
  const exported = await window.crypto.subtle.exportKey('raw', key);
  return new Uint8Array(exported);
}

// Simple fallback encryption for browsers without Web Crypto (should not happen)
export function fallbackEncrypt(data) {
  console.warn('Using fallback encryption (not secure)');
  return btoa(JSON.stringify(data));
}

export function fallbackDecrypt(encryptedBase64) {
  console.warn('Using fallback decryption (not secure)');
  return JSON.parse(atob(encryptedBase64));
}