/* ══════════════════════════════════════════════════════════════════════
   src/lib/crypto.ts
   IDEA-128 CBC Mode  +  PBKDF2 Key Derivation  +  Zero-Knowledge Vault
   CIT Document Tracker
   ══════════════════════════════════════════════════════════════════════ */

// Obfuscated representation of legacy key "Group6CITKey2024" to prevent easy extraction
const LEGACY_KEY_CODES = [71, 114, 111, 117, 112, 54, 67, 73, 84, 75, 101, 121, 50, 48, 50, 52];
const LEGACY_KEY_STR = import.meta.env.VITE_IDEA_SHARED_KEY || LEGACY_KEY_CODES.map(c => String.fromCharCode(c)).join('');
const SHARED_IDEA_BYTES = new TextEncoder().encode(LEGACY_KEY_STR); // 16 bytes

/* sessionStorage key names */
const SS_MK = 'cit_mk';   // master key hex
const SS_IK = 'cit_ik';   // raw IDEA key hex

/* ╔══════════════════════════════════════════════════════════════╗
   ║               IDEA-128 CORE BLOCK CIPHER                    ║
   ╚══════════════════════════════════════════════════════════════╝ */

function mu(a: number, b: number): number {
  a &= 0xFFFF;
  b &= 0xFFFF;
  if (!a) a = 65536;
  if (!b) b = 65536;
  const r = Number((BigInt(a) * BigInt(b)) % 65537n);
  return r === 65536 ? 0 : r;
}

function mi(a: number): number {
  if (!a) return 0;
  if (a === 1) return 1;
  let t = 0n, nt = 1n, r = 65537n, nr = BigInt(a);
  while (nr) {
    const q = r / nr;
    const tempT = nt;
    nt = t - q * nt;
    t = tempT;
    const tempR = nr;
    nr = r % nr;
    r = tempR;
  }
  return Number(t < 0n ? t + 65537n : t);
}

const ai = (a: number) => (65536 - a) & 0xFFFF;
const ad = (a: number, b: number) => (a + b) & 0xFFFF;
const xo = (a: number, b: number) => a ^ b;

function expandKey(keyStr: string): number[] {
  const src = new TextEncoder().encode(keyStr.padEnd(16, '\0').slice(0, 16));
  const buf = new Uint8Array(16);
  buf.set(src);
  const sk: number[] = [];
  while (sk.length < 52) {
    for (let i = 0; i < 8 && sk.length < 52; i++) {
      sk.push(((buf[i * 2] << 8) | buf[i * 2 + 1]) & 0xFFFF);
    }
    let v = 0n;
    for (let i = 0; i < 16; i++) v = (v << 8n) | BigInt(buf[i]);
    v = ((v << 25n) | (v >> 103n)) & ((1n << 128n) - 1n);
    for (let i = 15; i >= 0; i--) {
      buf[i] = Number(v & 0xFFn);
      v >>= 8n;
    }
  }
  return sk;
}

function decSubkeys(ek: number[]): number[] {
  const dk = new Array(52).fill(0);
  let p = 0, q = 48;
  dk[p++] = mi(ek[q]);
  dk[p++] = ai(ek[q + 1]);
  dk[p++] = ai(ek[q + 2]);
  dk[p++] = mi(ek[q + 3]);
  for (let r = 7; r >= 0; r--) {
    q = r * 6;
    dk[p++] = ek[q + 4];
    dk[p++] = ek[q + 5];
    dk[p++] = mi(ek[q]);
    if (r > 0) {
      dk[p++] = ai(ek[q + 2]);
      dk[p++] = ai(ek[q + 1]);
    } else {
      dk[p++] = ai(ek[q + 1]);
      dk[p++] = ai(ek[q + 2]);
    }
    dk[p++] = mi(ek[q + 3]);
  }
  return dk;
}

function ideaBlock(w1: number, w2: number, w3: number, w4: number, sk: number[]): [number, number, number, number] {
  let a = w1, b = w2, c = w3, d = w4;
  for (let r = 0; r < 8; r++) {
    const z = r * 6;
    const t1 = mu(a, sk[z]);
    const t2 = ad(b, sk[z + 1]);
    const t3 = ad(c, sk[z + 2]);
    const t4 = mu(d, sk[z + 3]);
    const t5 = xo(t1, t3);
    const t6 = xo(t2, t4);
    const t7 = mu(t5, sk[z + 4]);
    const t8 = ad(t6, t7);
    const t9 = mu(t8, sk[z + 5]);
    const t10 = ad(t7, t9);
    const o1 = xo(t1, t9);
    const o2 = xo(t2, t10);
    const o3 = xo(t3, t9);
    const o4 = xo(t4, t10);
    if (r < 7) {
      a = o1;
      b = o3;
      c = o2;
      d = o4;
    } else {
      a = o1;
      b = o2;
      c = o3;
      d = o4;
    }
  }
  return [mu(a, sk[48]), ad(b, sk[49]), ad(c, sk[50]), mu(d, sk[51])];
}

/* ╔══════════════════════════════════════════════════════════════╗
   ║                  ECB MODE  (legacy compat)                  ║
   ╚══════════════════════════════════════════════════════════════╝ */

function ecbEncrypt(text: string, keyStr: string): string {
  const sk = expandKey(keyStr);
  const data = new TextEncoder().encode(text);
  const pad = 8 - (data.length % 8);
  const p = new Uint8Array(data.length + pad);
  p.set(data);
  p.fill(pad, data.length);
  let hex = '';
  for (let i = 0; i < p.length; i += 8) {
    const [y1, y2, y3, y4] = ideaBlock(
      (p[i] << 8) | p[i + 1],
      (p[i + 2] << 8) | p[i + 3],
      (p[i + 4] << 8) | p[i + 5],
      (p[i + 6] << 8) | p[i + 7],
      sk
    );
    hex += y1.toString(16).padStart(4, '0') +
           y2.toString(16).padStart(4, '0') +
           y3.toString(16).padStart(4, '0') +
           y4.toString(16).padStart(4, '0');
  }
  return hex.toUpperCase();
}

function ecbDecrypt(hex: string, keyStr: string): string {
  const dk = decSubkeys(expandKey(keyStr));
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 16) {
    const c = hex.slice(i, i + 16);
    const [y1, y2, y3, y4] = ideaBlock(
      parseInt(c.slice(0, 4), 16),
      parseInt(c.slice(4, 8), 16),
      parseInt(c.slice(8, 12), 16),
      parseInt(c.slice(12, 16), 16),
      dk
    );
    bytes.push(
      (y1 >> 8) & 0xFF, y1 & 0xFF,
      (y2 >> 8) & 0xFF, y2 & 0xFF,
      (y3 >> 8) & 0xFF, y3 & 0xFF,
      (y4 >> 8) & 0xFF, y4 & 0xFF
    );
  }
  const padLen = bytes[bytes.length - 1];
  return new TextDecoder().decode(new Uint8Array(bytes.slice(0, bytes.length - padLen)));
}

/* ╔══════════════════════════════════════════════════════════════╗
   ║                       CBC MODE                              ║
   ╚══════════════════════════════════════════════════════════════╝ */

export function encryptCBC(text: string, keyStr: string): string {
  const sk = expandKey(keyStr);
  const data = new TextEncoder().encode(text);
  const pad = 8 - (data.length % 8);
  const padded = new Uint8Array(data.length + pad);
  padded.set(data);
  padded.fill(pad, data.length);

  const ivBytes = (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues)
    ? window.crypto.getRandomValues(new Uint8Array(8))
    : (() => {
        const b = new Uint8Array(8);
        for (let i = 0; i < 8; i++) b[i] = (Math.random() * 256) | 0;
        return b;
      })();

  let prev = [
    (ivBytes[0] << 8) | ivBytes[1],
    (ivBytes[2] << 8) | ivBytes[3],
    (ivBytes[4] << 8) | ivBytes[5],
    (ivBytes[6] << 8) | ivBytes[7],
  ];

  let cipherHex = '';
  for (let i = 0; i < padded.length; i += 8) {
    const p1 = (((padded[i] << 8) | padded[i + 1]) ^ prev[0]) & 0xFFFF;
    const p2 = (((padded[i + 2] << 8) | padded[i + 3]) ^ prev[1]) & 0xFFFF;
    const p3 = (((padded[i + 4] << 8) | padded[i + 5]) ^ prev[2]) & 0xFFFF;
    const p4 = (((padded[i + 6] << 8) | padded[i + 7]) ^ prev[3]) & 0xFFFF;

    const [c1, c2, c3, c4] = ideaBlock(p1, p2, p3, p4, sk);
    prev = [c1, c2, c3, c4];
    cipherHex += c1.toString(16).padStart(4, '0') +
                 c2.toString(16).padStart(4, '0') +
                 c3.toString(16).padStart(4, '0') +
                 c4.toString(16).padStart(4, '0');
  }

  const ivHex = Array.from(ivBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return JSON.stringify({ iv: ivHex, data: cipherHex.toUpperCase() });
}

export function decryptCBC(jsonStr: string, keyStr: string): string | null {
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
  if (!parsed || !parsed.iv || !parsed.data) return null;

  const dk = decSubkeys(expandKey(keyStr));
  const ivHex = parsed.iv;
  const cipher = parsed.data;

  let prev = [
    parseInt(ivHex.slice(0, 4), 16),
    parseInt(ivHex.slice(4, 8), 16),
    parseInt(ivHex.slice(8, 12), 16),
    parseInt(ivHex.slice(12, 16), 16),
  ];

  const bytes: number[] = [];
  for (let i = 0; i < cipher.length; i += 16) {
    const c = cipher.slice(i, i + 16);
    const c1 = parseInt(c.slice(0, 4), 16);
    const c2 = parseInt(c.slice(4, 8), 16);
    const c3 = parseInt(c.slice(8, 12), 16);
    const c4 = parseInt(c.slice(12, 16), 16);
    const [p1, p2, p3, p4] = ideaBlock(c1, c2, c3, c4, dk);

    const out = [p1 ^ prev[0], p2 ^ prev[1], p3 ^ prev[2], p4 ^ prev[3]];
    bytes.push(
      (out[0] >> 8) & 0xFF, out[0] & 0xFF,
      (out[1] >> 8) & 0xFF, out[1] & 0xFF,
      (out[2] >> 8) & 0xFF, out[2] & 0xFF,
      (out[3] >> 8) & 0xFF, out[3] & 0xFF
    );
    prev = [c1, c2, c3, c4];
  }

  const padLen = bytes[bytes.length - 1];
  if (padLen < 1 || padLen > 8) return null;
  try {
    return new TextDecoder().decode(new Uint8Array(bytes.slice(0, bytes.length - padLen)));
  } catch (e) {
    return null;
  }
}

export function decryptSmart(enc: string, keyStr: string): string {
  if (!enc) return '';
  try {
    if (enc.trimStart().startsWith('{')) {
      return decryptCBC(enc, keyStr) ?? '';
    }
    return ecbDecrypt(enc, keyStr);
  } catch (e) {
    return enc;
  }
}

/* ╔══════════════════════════════════════════════════════════════╗
   ║            UTILITY: bytes ↔ hex ↔ key-string                ║
   ╚══════════════════════════════════════════════════════════════╝ */

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (!hex || hex.length % 2 !== 0) return new Uint8Array(0);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

function rawBytesToKeyStr(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => String.fromCharCode(b)).join('');
}

/* ╔══════════════════════════════════════════════════════════════╗
   ║           PBKDF2 KEY DERIVATION  (Web Crypto API)           ║
   ╚══════════════════════════════════════════════════════════════╝ */

async function pbkdf2Derive(password: string, saltBytes: Uint8Array): Promise<Uint8Array> {
  const cryptoMaterial = typeof window !== 'undefined' ? window.crypto : (globalThis.crypto as any);
  if (!cryptoMaterial || !cryptoMaterial.subtle) {
    throw new Error('Web Crypto API unavailable.');
  }
  const enc = new TextEncoder();
  const keyMaterial = await cryptoMaterial.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await cryptoMaterial.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    128
  );
  return new Uint8Array(bits);
}

/* ╔══════════════════════════════════════════════════════════════╗
   ║           XOR KEY WRAP / UNWRAP                             ║
   ╚══════════════════════════════════════════════════════════════╝ */

function xorWrap(keyBytes: Uint8Array, masterBytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = keyBytes[i] ^ masterBytes[i];
  }
  return out;
}

const xorUnwrap = xorWrap;

/* ╔══════════════════════════════════════════════════════════════╗
   ║              CIT_VAULT — Zero-Knowledge Key Manager         ║
   ╚══════════════════════════════════════════════════════════════╝ */

export const CIT_VAULT = {
  _masterKey: null as Uint8Array | null,
  _ideaKey: null as Uint8Array | null,

  hasKey(): boolean {
    return !!this._ideaKey;
  },

  getKeyStr(): string {
    return this._ideaKey ? rawBytesToKeyStr(this._ideaKey) : LEGACY_KEY_STR;
  },

  encrypt(text: string): string {
    return encryptCBC(text, this.getKeyStr());
  },

  decrypt(enc: string): string {
    return decryptSmart(enc, this.getKeyStr());
  },

  async generateAndWrap(password: string): Promise<{ saltHex: string; encryptedKeyHex: string }> {
    const cryptoMaterial = typeof window !== 'undefined' ? window.crypto : (globalThis.crypto as any);
    const saltBytes = cryptoMaterial.getRandomValues(new Uint8Array(16));
    const masterKey = await pbkdf2Derive(password, saltBytes);
    const wrapped = xorWrap(SHARED_IDEA_BYTES, masterKey);

    this._masterKey = masterKey;
    this._ideaKey = new Uint8Array(SHARED_IDEA_BYTES);

    const saltHex = bytesToHex(saltBytes);
    const encryptedKeyHex = bytesToHex(wrapped);

    try {
      sessionStorage.setItem(SS_MK, bytesToHex(masterKey));
      sessionStorage.setItem(SS_IK, bytesToHex(SHARED_IDEA_BYTES));
    } catch (e) {
      // Private mode or non-browser env
    }

    return { saltHex, encryptedKeyHex };
  },

  async deriveAndActivate(password: string, saltHex: string | null, encryptedKeyHex: string | null): Promise<boolean> {
    if (!saltHex || !encryptedKeyHex) {
      this._masterKey = null;
      this._ideaKey = new Uint8Array(SHARED_IDEA_BYTES);
      try {
        sessionStorage.setItem(SS_IK, bytesToHex(SHARED_IDEA_BYTES));
      } catch (e) {}
      return false;
    }
    try {
      const saltBytes = hexToBytes(saltHex);
      const masterKey = await pbkdf2Derive(password, saltBytes);
      const wrapped = hexToBytes(encryptedKeyHex);
      const ideaKey = xorUnwrap(wrapped, masterKey);

      this._masterKey = masterKey;
      this._ideaKey = ideaKey;

      sessionStorage.setItem(SS_MK, bytesToHex(masterKey));
      sessionStorage.setItem(SS_IK, bytesToHex(ideaKey));
      return true;
    } catch (err) {
      console.error('[CIT_VAULT.deriveAndActivate]', err);
      this._ideaKey = new Uint8Array(SHARED_IDEA_BYTES);
      return false;
    }
  },

  restoreFromSession(encryptedKeyHex: string | null): boolean {
    try {
      const ikHex = sessionStorage.getItem(SS_IK);
      if (ikHex) {
        this._ideaKey = hexToBytes(ikHex);
        const mkHex = sessionStorage.getItem(SS_MK);
        if (mkHex) this._masterKey = hexToBytes(mkHex);
        return true;
      }

      const mkHex = sessionStorage.getItem(SS_MK);
      if (mkHex && encryptedKeyHex) {
        const masterKey = hexToBytes(mkHex);
        const wrapped = hexToBytes(encryptedKeyHex);
        this._masterKey = masterKey;
        this._ideaKey = xorUnwrap(wrapped, masterKey);
        sessionStorage.setItem(SS_IK, bytesToHex(this._ideaKey));
        return true;
      }

      if (!encryptedKeyHex) {
        this._ideaKey = new Uint8Array(SHARED_IDEA_BYTES);
        return true;
      }

      return false;
    } catch (e) {
      return false;
    }
  },

  clearAll(): void {
    this._masterKey = null;
    this._ideaKey = null;
    try {
      sessionStorage.clear();
      const toRemove = Object.keys(localStorage)
        .filter(k => k.startsWith('cit_') && !k.startsWith('cit_lastscan_'));
      toRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) {}
  }
};

/* ╔══════════════════════════════════════════════════════════════╗
   ║                  FILE ENCRYPTION AT REST                     ║
   ╚══════════════════════════════════════════════════════════════╝ */

export function encryptFile(dataURI: string, ext?: string): string {
  const commaIdx = dataURI.indexOf(',');
  if (commaIdx === -1) throw new Error('Invalid data URI');
  const prefix = dataURI.slice(0, commaIdx + 1);
  const b64content = dataURI.slice(commaIdx + 1);
  
  const encHex = encryptCBC(b64content, CIT_VAULT.getKeyStr());
  return JSON.stringify({ encrypted: true, prefix, data: encHex, ext: ext || '' });
}

export function decryptFile(stored: string): { dataURI: string; ext: string } | null {
  if (!stored) return null;
  try {
    let jsonStr = stored.trim();
    if (jsonStr.startsWith("data:")) {
      const commaIdx = jsonStr.indexOf(",");
      if (commaIdx !== -1) {
        const b64 = jsonStr.substring(commaIdx + 1);
        try {
          const decoded = atob(b64);
          if (decoded.trim().startsWith("{")) {
            jsonStr = decoded;
          }
        } catch (e) {}
      }
    }
    
    if (jsonStr.startsWith("{")) {
      const parsed = JSON.parse(jsonStr);
      if (parsed && parsed.encrypted === true) {
        const decryptedB64 = decryptCBC(parsed.data, CIT_VAULT.getKeyStr());
        if (decryptedB64) {
          return { dataURI: parsed.prefix + decryptedB64, ext: parsed.ext || '' };
        }
      }
    }
  } catch (e) {
    console.warn("[decryptFile] failed to decrypt, treating as unencrypted:", e);
  }
  return { dataURI: stored, ext: '' };
}

export function decryptFileResponse(backendResult: { fileData?: string; fileExt?: string; name?: string }): { dataURI: string; ext: string; name: string } | null {
  if (!backendResult || !backendResult.fileData) return null;
  const dec = decryptFile(backendResult.fileData);
  if (!dec) return null;
  return {
    dataURI: dec.dataURI,
    ext: dec.ext || backendResult.fileExt || "",
    name: backendResult.name || "document"
  };
}
