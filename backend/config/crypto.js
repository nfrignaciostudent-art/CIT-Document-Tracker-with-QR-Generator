/* ══════════════════════════════════════════════════════════════════════
   backend/config/crypto.js
   IDEA-128 CBC/ECB Backend Cryptographic Decryption Engine
   CIT Document Tracker - Group 6
   ══════════════════════════════════════════════════════════════════════ */

const LEGACY_KEY_CODES = [71, 114, 111, 117, 112, 54, 67, 73, 84, 75, 101, 121, 50, 48, 50, 52];
const SHARED_KEY_STR = process.env.IDEA_SHARED_KEY || LEGACY_KEY_CODES.map(c => String.fromCharCode(c)).join(''); // "Group6CITKey2024"

/** Multiplication mod 2^16 + 1 */
function mu(a, b) {
  a &= 0xFFFF;
  b &= 0xFFFF;
  if (!a) a = 65536;
  if (!b) b = 65536;
  const r = Number((BigInt(a) * BigInt(b)) % 65537n);
  return r === 65536 ? 0 : r;
}

/** Multiplicative inverse mod 2^16 + 1 (extended Euclidean) */
function mi(a) {
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

const ai = (a) => (65536 - a) & 0xFFFF;
const ad = (a, b) => (a + b) & 0xFFFF;
const xo = (a, b) => a ^ b;

/** Expand a 128-bit key string into 52 16-bit subkeys */
function expandKey(keyStr) {
  const src = new TextEncoder().encode(keyStr.padEnd(16, '\0').slice(0, 16));
  const buf = new Uint8Array(16);
  buf.set(src);
  const sk = [];
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

/** Derive decrypt subkeys from encrypt subkeys */
function decSubkeys(ek) {
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

/** Single 8-byte IDEA block operation (8.5 rounds) */
function ideaBlock(w1, w2, w3, w4, sk) {
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

/** Decrypt IDEA-128 ECB */
function ecbDecrypt(hex, keyStr) {
  const dk = decSubkeys(expandKey(keyStr));
  const bytes = [];
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
  if (padLen < 1 || padLen > 8) return '';
  try {
    return new TextDecoder().decode(new Uint8Array(bytes.slice(0, bytes.length - padLen)));
  } catch (e) {
    return '';
  }
}

/** Decrypt IDEA-128 CBC */
function decryptCBC(jsonStr, keyStr) {
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

  const bytes = [];
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

/** Smart Decrypt: automatically detects CBC JSON vs ECB hex vs raw plaintext */
function decryptSmart(enc, keyStr = SHARED_KEY_STR) {
  if (!enc) return '';
  const trimmed = String(enc).trim();
  if (trimmed === 'none' || trimmed === 'plaintext') return '';

  if (trimmed.startsWith('{')) {
    try {
      return decryptCBC(trimmed, keyStr) ?? enc;
    } catch (e) {
      return enc;
    }
  }

  // Check if it's a valid ECB hex string (non-empty, characters 0-9A-Fa-f, multiple of 16)
  const isHex = /^[0-9A-Fa-f]+$/.test(trimmed);
  if (isHex && trimmed.length > 0 && trimmed.length % 16 === 0) {
    try {
      const dec = ecbDecrypt(trimmed, keyStr);
      if (dec && dec.length > 0) return dec;
    } catch (e) {
      // ignore
    }
  }

  return enc;
}

module.exports = {
  decryptCBC,
  ecbDecrypt,
  decryptSmart,
  SHARED_KEY_STR,
};
