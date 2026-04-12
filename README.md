# CIT Document Tracker

A full-stack document tracking system with QR code scanning, IDEA-128 file encryption, and role-based access control.

---

## Features

- **Document registration** with IDEA-128 encrypted name and file attachment
- **Dual-ID system** — a stable internal ULID for QR codes and a human-readable display ID (DOC-YYYYMMDD-XXXX) for receipts
- **QR code tracking** — every document gets a permanent QR code that always points to live status
- **Automatic scan logging** — scanning a QR code silently logs the event to a separate `scan_logs` collection with no user action required
- **Manual movement logging** — admins can record physical document movements via a form; these go to `doc.history`
- **Two-file system** — original (user-submitted, reference only) and processed (admin-uploaded, downloadable on release)
- **Client-side decryption** — files are decrypted in the browser using IDEA-128; the server never holds unencrypted file data
- **Role-based access** — admin and user roles with JWT authentication; admin-only routes enforced on both client and server
- **Heartbeat-based online status** — users ping the server every 2 minutes; admins see who is currently active
- **Real-time dashboard sync** — polls the backend every 30 seconds and re-fetches on tab focus

---

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Backend   | Node.js, Express                    |
| Database  | MongoDB (Mongoose ODM)              |
| Auth      | JWT (jsonwebtoken) + bcryptjs       |
| File upload | Multer (memory storage)           |
| QR codes  | qrcode (server), QRCode.js (client) |
| Encryption | IDEA-128 (custom client-side impl) |
| Frontend  | Vanilla JS, single HTML file        |

---

## How It Works

### Document Lifecycle

```
User registers document
  → IDEA-128 encrypts document name + file (client-side)
  → Backend generates ULID (internalId) + DOC-YYYYMMDD-XXXX (displayId)
  → QR code generated pointing to ?track=<internalId>
  → Status: Received

Admin processes document
  → Updates status (Processing → For Approval → Approved → Released)
  → On release: must upload the processed/final file
  → Final file encrypted client-side before upload

User scans QR code
  → Public tracking page renders live status
  → Scan event auto-logged to scan_logs collection (no auth required)
  → If status is Released: download button appears for the final file
  → Download decrypts file locally in the browser
```

### ID System

- **internalId** — ULID (time-sortable, used in QR codes, never shown to users)
- **displayId** — `DOC-YYYYMMDD-XXXX` (sequential per day, shown on receipts)
- **verifyCode** — 4-char FNV-1a hash of `displayId:internalId` (anti-tamper)
- **fullDisplayId** — `displayId-verifyCode` (what appears in the UI)

### Scan vs Movement Logs

| Type | Trigger | Storage | Auth |
|------|---------|---------|------|
| QR Scan | Visiting `?track=<id>` URL | `scan_logs` collection | None (public) |
| Movement | Admin submits movement form | `doc.history` (action: `'Movement'`) | Admin JWT |

These are intentionally separate. Scan logs are automatic and immutable. Movement logs are manual admin records.

### File Security

- Files are encrypted with IDEA-128 in the browser before upload
- The server stores only the encrypted payload — never the raw file
- Decryption happens entirely client-side on download
- The original (user-submitted) file is stored as a reference copy and is never publicly downloadable
- Only the admin-uploaded processed file is downloadable, and only after status reaches `Released`

---

## Setup

### Requirements

- Node.js 18+
- MongoDB (local or Atlas)

### Install

```bash
npm install
```

### Environment

Copy `env.example` to `.env` and fill in:

```env
MONGO_URI=mongodb://localhost:27017/cit_doctracker
JWT_SECRET=your_secret_key
JWT_EXPIRES=7d
PORT=3000
APP_BASE_URL=http://localhost:3000
```

### Seed the admin account

```bash
node seed.js
```

Default credentials: `admin` / `admin1234` — **change after first login**.

### Run

```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

The frontend is served as static files from `public/` on the same Express server.

---

## API Overview

### Auth

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/auth/register` | — | Create user account |
| POST | `/api/auth/login` | — | Login, returns JWT |
| GET | `/api/auth/me` | JWT | Get current user |
| GET | `/api/auth/users` | Admin JWT | List all users with stats |
| POST | `/api/auth/heartbeat` | JWT | Update lastSeen timestamp |

### Documents

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/documents/register` | JWT | Register new document |
| GET | `/api/documents` | JWT | List documents (own or all for admin) |
| GET | `/api/documents/track/:id` | — | Public tracking lookup |
| GET | `/api/documents/download/:id` | — | Download released document |
| GET | `/api/documents/:id/original-file` | JWT (owner or admin) | Fetch original file |
| PATCH | `/api/documents/:id/status` | Admin JWT | Update status + optional processed file |
| DELETE | `/api/documents/:id` | Admin JWT | Delete document + scan logs |
| POST | `/api/documents/:id/scan-log` | — | Auto-log QR scan |
| POST | `/api/documents/:id/movement` | Admin JWT | Manual movement log |
| GET | `/api/documents/scan-logs` | Admin JWT | All QR scan events |
| GET | `/api/documents/movement-logs` | Admin JWT | All movement history entries |

---

## Notes

- **Do not manually edit scan logs** — they are auto-generated by the QR scan system and exist in a separate MongoDB collection from document history.
- **Movement logs are admin-only** — regular users cannot log movements. The backend enforces this regardless of the frontend state.
- **Released status requires a processed file** — the backend rejects a status update to `Released` if no processed file has been attached.
- **QR codes are permanent** — the QR always encodes the internal ULID URL. It never needs to be regenerated after status changes.
- **File blobs are excluded from list responses** — `/api/documents` never returns raw file data. Files are fetched on demand via dedicated endpoints to keep list payloads small.
