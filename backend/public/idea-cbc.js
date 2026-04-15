/* ══════════════════════════════════════════════════════════════════════
   public/js/idea-cbc.js
   IDEA-128 CBC Mode  +  PBKDF2 Key Derivation  +  Zero-Knowledge Vault
   CIT Document Tracker - Group 6

   LOAD ORDER:  include this AFTER script.js in index.html so it can
                patch the existing window.IDEA object with CBC methods.

   Globals added:
     window.IDEACBC     – full IDEA-128 ECB + CBC cipher object
     window.CIT_VAULT   – zero-knowledge key manager

   Patches added to window.IDEA (from script.js):
     IDEA.encryptCBC(text, keyStr)   → CBC JSON string  {iv, data}
     IDEA.decryptCBC(json, keyStr)   → plaintext | null
     IDEA.decryptSmart(enc, keyStr)  → handles both CBC and legacy ECB

   Key-management flow:
     REGISTER  → CIT_VAULT.generateAndWrap(password)
                   generates random salt, derives master key via PBKDF2,
                   XOR-wraps the shared deployment IDEA key,
                   returns { saltHex, encryptedKeyHex } to send to backend.

     LOGIN     → CIT_VAULT.deriveAndActivate(password, saltHex, encKeyHex)
                   re-derives master key, unwraps raw IDEA key,
                   stores masterKey in sessionStorage (survives refresh,
                   deleted automatically on tab close).

     REFRESH   → CIT_VAULT.restoreFromSession(encryptedKeyHex)
                   reads master key from sessionStorage,
                   re-unwraps IDEA key — NO password needed.

     LOGOUT    → CIT_VAULT.clearAll()
                   clears sessionStorage + cit_* localStorage entries.
                   After this, "Go Back" in browser cannot recover keys.

   Encrypted field storage format  (CBC):
     JSON string  →  { "iv": "<16-char hex>", "data": "<UPPER hex>" }
   Legacy field format              (ECB, for backward compatibility):
     Plain uppercase hex string — decryptSmart handles both transparently.
══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  /* ╔══════════════════════════════════════════════════════════════╗
     ║               IDEA-128 CORE BLOCK CIPHER                    ║
     ╚══════════════════════════════════════════════════════════════╝ */

  /** Multiplication mod 2^16 + 1 */
  function mu(a, b) {
    a &= 0xFFFF; b &= 0xFFFF;
    if (!a) a = 65536;
    if (!b) b = 65536;
    const r = Number(BigInt(a) * BigInt(b) % 65537n);
    return r === 65536 ? 0 : r;
  }

  /** Multiplicative inverse mod 2^16 + 1 (extended Euclidean) */
  function mi(a) {
    if (!a) return 0;
    if (a === 1) return 1;
    let t = 0n, nt = 1n, r = 65537n, nr = BigInt(a);
    while (nr) {
      const q = r / nr;
      [t, nt] = [nt, t - q * nt];
      [r, nr] = [nr, r % nr];
    }
    return Number(t < 0n ? t + 65537n : t);
  }

  const ai = a => (65536 - a) & 0xFFFF;   // additive inverse mod 2^16
  const ad = (a, b) => (a + b) & 0xFFFF;  // addition mod 2^16
  const xo = (a, b) => a ^ b;             // XOR

  /** Expand a 128-bit string key into 52 16-bit subkeys */
  function expandKey(keyStr) {
    const src = new TextEncoder().encode(keyStr.padEnd(16, '\0').slice(0, 16));
    const buf = new Uint8Array(16);
    buf.set(src);
    const sk = [];
    while (sk.length < 52) {
      for (let i = 0; i < 8 && sk.length < 52; i++)
        sk.push(((buf[i * 2] << 8) | buf[i * 2 + 1]) & 0xFFFF);
      let v = 0n;
      for (let i = 0; i < 16; i++) v = (v << 8n) | BigInt(buf[i]);
      v = ((v << 25n) | (v >> 103n)) & ((1n << 128n) - 1n);
      for (let i = 15; i >= 0; i--) { buf[i] = Number(v & 0xFFn); v >>= 8n; }
    }
    return sk;
  }

  /** Derive decrypt subkeys from encrypt subkeys */
  function decSubkeys(ek) {
    const dk = new Array(52).fill(0);
    let p = 0, q = 48;
    dk[p++] = mi(ek[q]);   dk[p++] = ai(ek[q + 1]);
    dk[p++] = ai(ek[q + 2]); dk[p++] = mi(ek[q + 3]);
    for (let r = 7; r >= 0; r--) {
      q = r * 6;
      dk[p++] = ek[q + 4]; dk[p++] = ek[q + 5];
      dk[p++] = mi(ek[q]);
      if (r > 0) { dk[p++] = ai(ek[q + 2]); dk[p++] = ai(ek[q + 1]); }
      else        { dk[p++] = ai(ek[q + 1]); dk[p++] = ai(ek[q + 2]); }
      dk[p++] = mi(ek[q + 3]);
    }
    return dk;
  }

  /** Single 8-byte IDEA block operation (8.5 rounds) */
  function ideaBlock(w1, w2, w3, w4, sk) {
    let a = w1, b = w2, c = w3, d = w4;
    for (let r = 0; r < 8; r++) {
      const z  = r * 6;
      const t1 = mu(a, sk[z]),   t2 = ad(b, sk[z + 1]);
      const t3 = ad(c, sk[z + 2]), t4 = mu(d, sk[z + 3]);
      const t5 = xo(t1, t3),    t6 = xo(t2, t4);
      const t7 = mu(t5, sk[z + 4]);
      const t8 = ad(t6, t7),    t9 = mu(t8, sk[z + 5]);
      const t10 = ad(t7, t9);
      const o1 = xo(t1, t9), o2 = xo(t2, t10);
      const o3 = xo(t3, t9), o4 = xo(t4, t10);
      if (r < 7) { a = o1; b = o3; c = o2; d = o4; }
      else        { a = o1; b = o2; c = o3; d = o4; }
    }
    return [mu(a, sk[48]), ad(b, sk[49]), ad(c, sk[50]), mu(d, sk[51])];
  }

  /* ╔══════════════════════════════════════════════════════════════╗
     ║                  ECB MODE  (legacy compat)                  ║
     ╚══════════════════════════════════════════════════════════════╝ */

  function _ecbEncrypt(text, keyStr) {
    const sk   = expandKey(keyStr);
    const data = new TextEncoder().encode(text);
    const pad  = 8 - (data.length % 8);
    const p    = new Uint8Array(data.length + pad);
    p.set(data); p.fill(pad, data.length);
    let hex = '';
    for (let i = 0; i < p.length; i += 8) {
      const [y1, y2, y3, y4] = ideaBlock(
        (p[i] << 8) | p[i + 1], (p[i + 2] << 8) | p[i + 3],
        (p[i + 4] << 8) | p[i + 5], (p[i + 6] << 8) | p[i + 7], sk);
      hex += y1.toString(16).padStart(4, '0') + y2.toString(16).padStart(4, '0') +
             y3.toString(16).padStart(4, '0') + y4.toString(16).padStart(4, '0');
    }
    return hex.toUpperCase();
  }

  function _ecbDecrypt(hex, keyStr) {
    const dk    = decSubkeys(expandKey(keyStr));
    const bytes = [];
    for (let i = 0; i < hex.length; i += 16) {
      const c = hex.slice(i, i + 16);
      const [y1, y2, y3, y4] = ideaBlock(
        parseInt(c.slice(0, 4), 16), parseInt(c.slice(4, 8), 16),
        parseInt(c.slice(8, 12), 16), parseInt(c.slice(12, 16), 16), dk);
      bytes.push((y1 >> 8) & 0xFF, y1 & 0xFF, (y2 >> 8) & 0xFF, y2 & 0xFF,
                 (y3 >> 8) & 0xFF, y3 & 0xFF, (y4 >> 8) & 0xFF, y4 & 0xFF);
    }
    const padLen = bytes[bytes.length - 1];
    return new TextDecoder().decode(new Uint8Array(bytes.slice(0, bytes.length - padLen)));
  }

  /* ╔══════════════════════════════════════════════════════════════╗
     ║          CBC MODE  (new — primary encryption mode)          ║
     ║                                                             ║
     ║  Storage format: JSON  { "iv": "hex16", "data": "HEX" }    ║
     ║  IV: random 64-bit (8 bytes) generated per encryption.      ║
     ║  Integrity: any IV/ciphertext tampering produces garbage.   ║
     ╚══════════════════════════════════════════════════════════════╝ */

  /**
   * Encrypt plaintext with IDEA-128-CBC.
   * @param  {string} text    - UTF-8 plaintext
   * @param  {string} keyStr  - 16-character key string
   * @returns {string}        - JSON  { iv, data }
   */
  function encryptCBC(text, keyStr) {
    const sk   = expandKey(keyStr);
    const data = new TextEncoder().encode(text);
    const pad  = 8 - (data.length % 8);
    const padded = new Uint8Array(data.length + pad);
    padded.set(data);
    padded.fill(pad, data.length);           // PKCS#5-style padding

    /* Random 64-bit Initialization Vector */
    const ivBytes = (typeof crypto !== 'undefined' && crypto.getRandomValues)
      ? crypto.getRandomValues(new Uint8Array(8))
      : (() => { const b = new Uint8Array(8); for (let i=0;i<8;i++) b[i]=Math.random()*256|0; return b; })();

    /* prev = IV split into four 16-bit words */
    let prev = [
      (ivBytes[0] << 8) | ivBytes[1],
      (ivBytes[2] << 8) | ivBytes[3],
      (ivBytes[4] << 8) | ivBytes[5],
      (ivBytes[6] << 8) | ivBytes[7],
    ];

    let cipherHex = '';
    for (let i = 0; i < padded.length; i += 8) {
      /* CBC XOR: plaintext ⊕ previous ciphertext block */
      const p1 = ((padded[i]     << 8) | padded[i + 1]) ^ prev[0];
      const p2 = ((padded[i + 2] << 8) | padded[i + 3]) ^ prev[1];
      const p3 = ((padded[i + 4] << 8) | padded[i + 5]) ^ prev[2];
      const p4 = ((padded[i + 6] << 8) | padded[i + 7]) ^ prev[3];

      const [c1, c2, c3, c4] = ideaBlock(p1, p2, p3, p4, sk);
      prev = [c1, c2, c3, c4];               // update feedback register
      cipherHex += c1.toString(16).padStart(4, '0') + c2.toString(16).padStart(4, '0') +
                   c3.toString(16).padStart(4, '0') + c4.toString(16).padStart(4, '0');
    }

    const ivHex = Array.from(ivBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return JSON.stringify({ iv: ivHex, data: cipherHex.toUpperCase() });
  }

  /**
   * Decrypt IDEA-128-CBC ciphertext.
   * @param  {string} jsonStr  - JSON { iv, data } from encryptCBC
   * @param  {string} keyStr   - 16-character key string
   * @returns {string|null}    - plaintext, or null on failure
   */
  function decryptCBC(jsonStr, keyStr) {
    let parsed;
    try { parsed = JSON.parse(jsonStr); } catch (e) { return null; }
    if (!parsed || !parsed.iv || !parsed.data) return null;

    const dk     = decSubkeys(expandKey(keyStr));
    const ivHex  = parsed.iv;
    const cipher = parsed.data;

    /* Reconstruct 4-word IV */
    let prev = [
      parseInt(ivHex.slice(0, 4),  16),
      parseInt(ivHex.slice(4, 8),  16),
      parseInt(ivHex.slice(8, 12), 16),
      parseInt(ivHex.slice(12, 16), 16),
    ];

    const bytes = [];
    for (let i = 0; i < cipher.length; i += 16) {
      const c   = cipher.slice(i, i + 16);
      const c1  = parseInt(c.slice(0, 4),  16);
      const c2  = parseInt(c.slice(4, 8),  16);
      const c3  = parseInt(c.slice(8, 12), 16);
      const c4  = parseInt(c.slice(12, 16), 16);
      const [p1, p2, p3, p4] = ideaBlock(c1, c2, c3, c4, dk);

      /* XOR IDEA output with previous ciphertext to recover plaintext */
      const out = [p1 ^ prev[0], p2 ^ prev[1], p3 ^ prev[2], p4 ^ prev[3]];
      bytes.push(
        (out[0] >> 8) & 0xFF, out[0] & 0xFF,
        (out[1] >> 8) & 0xFF, out[1] & 0xFF,
        (out[2] >> 8) & 0xFF, out[2] & 0xFF,
        (out[3] >> 8) & 0xFF, out[3] & 0xFF,
      );
      prev = [c1, c2, c3, c4];               // update feedback register
    }

    const padLen = bytes[bytes.length - 1];
    if (padLen < 1 || padLen > 8) return null;  // corrupt padding → reject
    try {
      return new TextDecoder().decode(new Uint8Array(bytes.slice(0, bytes.length - padLen)));
    } catch (e) { return null; }
  }

  /**
   * Smart decrypt: detects CBC (JSON) vs legacy ECB (plain hex) automatically.
   * Always falls back gracefully — never throws.
   */
  function decryptSmart(enc, keyStr) {
    if (!enc) return '';
    try {
      if (enc.trimStart().startsWith('{')) {
        return decryptCBC(enc, keyStr) ?? '';     // CBC path
      }
      return _ecbDecrypt(enc, keyStr);            // legacy ECB path
    } catch (e) { return enc; }                  // last resort: return as-is
  }

  /* ── Expose IDEACBC global ──────────────────────────────────────── */
  const IDEACBC = {
    encrypt:       _ecbEncrypt,   // legacy alias
    decrypt:       _ecbDecrypt,   // legacy alias
    encryptCBC,
    decryptCBC,
    decryptSmart,
  };
  global.IDEACBC = IDEACBC;

  /* ── Patch the existing window.IDEA (from script.js) ───────────── */
  function _patchIDEA() {
    if (!global.IDEA) return;
    global.IDEA.encryptCBC   = encryptCBC;
    global.IDEA.decryptCBC   = decryptCBC;
    global.IDEA.decryptSmart = decryptSmart;
  }
  if (global.IDEA) { _patchIDEA(); }
  else { document.addEventListener('DOMContentLoaded', _patchIDEA); }

  /* ╔══════════════════════════════════════════════════════════════╗
     ║            UTILITY: bytes ↔ hex ↔ key-string                ║
     ╚══════════════════════════════════════════════════════════════╝ */

  function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function hexToBytes(hex) {
    if (!hex || hex.length % 2 !== 0) return new Uint8Array(0);
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2)
      out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    return out;
  }
  /** Convert 16-byte Uint8Array to the 16-character key string IDEA expects */
  function rawBytesToKeyStr(bytes) {
    return Array.from(bytes).map(b => String.fromCharCode(b)).join('');
  }

  /* ╔══════════════════════════════════════════════════════════════╗
     ║           PBKDF2 KEY DERIVATION  (Web Crypto API)           ║
     ║                                                             ║
     ║  Derives a 128-bit "Master Key" from the user's password.   ║
     ║  The Master Key is used ONLY to wrap/unwrap the IDEA key.   ║
     ║  It is NEVER sent to the server.                            ║
     ╚══════════════════════════════════════════════════════════════╝ */

  async function pbkdf2Derive(password, saltBytes) {
    if (!crypto || !crypto.subtle)
      throw new Error('Web Crypto API unavailable. Use HTTPS or localhost.');
    const enc         = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: saltBytes, iterations: 100_000, hash: 'SHA-256' },
      keyMaterial,
      128,          // 128 bits = 16 bytes → matches IDEA key length
    );
    return new Uint8Array(bits);
  }

  /* ╔══════════════════════════════════════════════════════════════╗
     ║           XOR KEY WRAP / UNWRAP                             ║
     ║                                                             ║
     ║  wrapped = rawIdeaKey ⊕ masterKey                          ║
     ║  XOR is self-inverse: unwrap is the same operation.        ║
     ║  The wrapped key is safe to store on the server because     ║
     ║  it is useless without the master key, which never leaves   ║
     ║  the browser.                                               ║
     ╚══════════════════════════════════════════════════════════════╝ */

  function xorWrap(keyBytes, masterBytes) {
    const out = new Uint8Array(16);
    for (let i = 0; i < 16; i++) out[i] = keyBytes[i] ^ masterBytes[i];
    return out;
  }
  const xorUnwrap = xorWrap;  // XOR is self-inverse

  /* ╔══════════════════════════════════════════════════════════════╗
     ║              CIT_VAULT — Zero-Knowledge Key Manager         ║
     ╚══════════════════════════════════════════════════════════════╝

     The shared deployment IDEA key (same raw bytes for all users,
     so any authenticated user can decrypt any document).
     Each user wraps this key with THEIR personal PBKDF2 master key
     before storing on the server — the server always stores the
     WRAPPED version and never the raw key bytes.                   */

  const LEGACY_KEY_STR   = 'Group6CITKey2024';
  const SHARED_IDEA_BYTES = new TextEncoder().encode(LEGACY_KEY_STR); // 16 bytes

  /* sessionStorage key names */
  const SS_MK = 'cit_mk';   // master key hex  (deleted on tab close)
  const SS_IK = 'cit_ik';   // raw IDEA key hex (deleted on tab close)

  const CIT_VAULT = {
    _masterKey: null,  // Uint8Array(16) — in memory, never serialised
    _ideaKey:   null,  // Uint8Array(16) — in memory, never serialised

    /* ── Does the vault have an active decryption key? ── */
    hasKey() { return !!this._ideaKey; },

    /* ── Key as string for the IDEA cipher calls ── */
    getKeyStr() {
      return this._ideaKey
        ? rawBytesToKeyStr(this._ideaKey)
        : LEGACY_KEY_STR;               // graceful fallback during migration
    },

    /* ── Encrypt text using the active CBC key ── */
    encrypt(text) { return encryptCBC(text, this.getKeyStr()); },

    /* ── Decrypt enc using the active key (CBC or legacy ECB) ── */
    decrypt(enc) { return decryptSmart(enc, this.getKeyStr()); },

    /* ── REGISTER: generate salt + wrap IDEA key ─────────────────
       Call this before sending registration payload to the backend.
       Returns { saltHex, encryptedKeyHex } — both safe to store on server. */
    async generateAndWrap(password) {
      const saltBytes = crypto.getRandomValues(new Uint8Array(16));
      const masterKey = await pbkdf2Derive(password, saltBytes);
      const wrapped   = xorWrap(SHARED_IDEA_BYTES, masterKey);

      this._masterKey = masterKey;
      this._ideaKey   = new Uint8Array(SHARED_IDEA_BYTES); // activate

      const saltHex         = bytesToHex(saltBytes);
      const encryptedKeyHex = bytesToHex(wrapped);

      /* Persist master key for same-session refresh resilience */
      try {
        sessionStorage.setItem(SS_MK, bytesToHex(masterKey));
        sessionStorage.setItem(SS_IK, bytesToHex(SHARED_IDEA_BYTES));
      } catch (e) { /* private mode — silently continue */ }

      return { saltHex, encryptedKeyHex };
    },

    /* ── LOGIN: derive master key, unwrap IDEA key ───────────────
       @returns {boolean}  true = vault activated; false = legacy mode */
    async deriveAndActivate(password, saltHex, encryptedKeyHex) {
      if (!saltHex || !encryptedKeyHex) {
        /* Legacy account created before the vault system was added */
        this._masterKey = null;
        this._ideaKey   = new Uint8Array(SHARED_IDEA_BYTES);
        try { sessionStorage.setItem(SS_IK, bytesToHex(SHARED_IDEA_BYTES)); } catch(e){}
        return false;
      }
      try {
        const saltBytes = hexToBytes(saltHex);
        const masterKey = await pbkdf2Derive(password, saltBytes);
        const wrapped   = hexToBytes(encryptedKeyHex);
        const ideaKey   = xorUnwrap(wrapped, masterKey);

        this._masterKey = masterKey;
        this._ideaKey   = ideaKey;

        sessionStorage.setItem(SS_MK, bytesToHex(masterKey));
        sessionStorage.setItem(SS_IK, bytesToHex(ideaKey));
        return true;
      } catch (err) {
        console.error('[CIT_VAULT.deriveAndActivate]', err);
        /* Fail-safe: activate with shared bytes so app still works */
        this._ideaKey = new Uint8Array(SHARED_IDEA_BYTES);
        return false;
      }
    },

    /* ── PAGE REFRESH: restore from sessionStorage ────────────────
       sessionStorage persists across page refreshes in the SAME tab.
       When the tab is closed, sessionStorage is wiped automatically,
       so the key is gone and data appears masked until next login.

       @param {string} encryptedKeyHex  from currentUser.encryptedIdeaKey */
    restoreFromSession(encryptedKeyHex) {
      try {
        /* Fast path: cached raw IDEA key bytes */
        const ikHex = sessionStorage.getItem(SS_IK);
        if (ikHex) {
          this._ideaKey = hexToBytes(ikHex);
          const mkHex = sessionStorage.getItem(SS_MK);
          if (mkHex) this._masterKey = hexToBytes(mkHex);
          return true;
        }

        /* Slower path: re-derive from stored master key + wrapped key blob */
        const mkHex = sessionStorage.getItem(SS_MK);
        if (mkHex && encryptedKeyHex) {
          const masterKey = hexToBytes(mkHex);
          const wrapped   = hexToBytes(encryptedKeyHex);
          this._masterKey = masterKey;
          this._ideaKey   = xorUnwrap(wrapped, masterKey);
          sessionStorage.setItem(SS_IK, bytesToHex(this._ideaKey));
          return true;
        }

        /* Legacy accounts: activate with shared bytes */
        if (!encryptedKeyHex) {
          this._ideaKey = new Uint8Array(SHARED_IDEA_BYTES);
          return true;
        }

        return false;  // no session data → must log in again
      } catch (e) {
        return false;
      }
    },

    /* ── LOGOUT: wipe ALL session and relevant local storage ──────
       After this, "Go Back" in the browser shows encrypted blobs
       as masked ● characters — keys are gone.                      */
    clearAll() {
      this._masterKey = null;
      this._ideaKey   = null;
      try {
        sessionStorage.clear();
        /* Remove every cit_* localStorage entry except scan-cooldown keys
           (those are benign and keep the spam prevention working).       */
        const toRemove = Object.keys(localStorage)
          .filter(k => k.startsWith('cit_') && !k.startsWith('cit_lastscan_'));
        toRemove.forEach(k => localStorage.removeItem(k));
      } catch (e) { /* private-mode browsers — silently continue */ }
    },
  };

  global.CIT_VAULT = CIT_VAULT;

})(window);
