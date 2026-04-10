# CIT Document Tracker With QR Generator

**Group 6** · Node.js + Express + MongoDB + IDEA-128 Encryption

A full-stack document tracking system built for CIT. Users submit documents, admins process and release them, and anyone can scan a QR code to check real-time status. All file attachments are encrypted with IDEA-128 on the client before ever leaving the browser.

---

## Project Structure

```
cit-doctracker/
├── server.js                    # Express entry point
├── seed.js                      # One-time admin account seeder
├── package.json
├── package-lock.json
├── .gitignore
├── .env                         # Your local env (never commit this)
│
├── config/
│   └── db.js                    # MongoDB connection + stale index cleanup
│
├── controllers/
│   ├── authController.js        # Register, login, getMe
│   └── documentController.js   # Register, track, download, status update, delete
│
├── middleware/
│   └── authMiddleware.js        # JWT Bearer token guard
│
├── models/
│   ├── User.js                  # User schema (bcrypt passwords)
│   └── Document.js              # Document schema (dual-ID, IDEA fields)
│
├── routes/
│   ├── authRoutes.js            # /api/auth/*
│   └── documentRoutes.js        # /api/documents/*
│
├── lib/
│   ├── core-3.5.2.jar
│   ├── javase-3.5.2.jar
│   └── server.js
│
└── Frontend/
    ├── server.js                # Dev server (serves frontend + proxies API)
    ├── package.json
    ├── .env
    ├── index.html               # Single-page app shell
    ├── style.css                # Global styles
    ├── script.js                # Core app logic, state, UI rendering
    ├── auth.js                  # Login / register / session management
    ├── api.js                   # Centralized fetch helpers (JSON + FormData)
    ├── track.js                 # Public QR tracking page logic
    ├── download.js              # File download & decryption UI
    └── qr.js                    # QR code generation & scan simulation
```

---

## Features

- **Dual-ID system** — every document gets a ULID (internal, used in QR codes) and a human-readable `DOC-YYYYMMDD-XXXX` display ID with a 4-character verification code
- **IDEA-128 client-side encryption** — files are encrypted in the browser before upload; the server never sees plaintext file content
- **QR code tracking** — each document has a permanent QR that resolves to a public tracking page via its ULID
- **Dual-file workflow** — users attach an original file at submission; admins attach a separate processed/final file when approving
- **Download gating** — files are only downloadable once status is `Released`
- **JWT authentication** — 7-day tokens, bcrypt-hashed passwords
- **Offline fallback** — if the backend is unreachable, the app falls back to localStorage-based accounts and documents
- **Admin controls** — status updates, movement logging, user management, activity logs
- **Scan logging** — movement is logged with handler + location on every QR scan (30-second cooldown to prevent duplicates)

---

## Getting Started (Local)

### Prerequisites

- Node.js v18+
- MongoDB running locally, or a [MongoDB Atlas](https://www.mongodb.com/atlas) URI

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Then edit `.env` with your values (see **Environment Variables** below).

### 3. Seed the admin account (run once)

```bash
node seed.js
```

This creates the default admin account:

| Field    | Value      |
|----------|------------|
| Username | `admin`    |
| Password | `admin1234`|
| Role     | `admin`    |

Running `seed.js` again when an admin already exists is safe — it will skip creation.

### 4. Start the server

```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

Open **http://localhost:3000** and log in with `admin / admin1234`.

---

## Environment Variables

```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/cit_doctracker
JWT_SECRET=cit_group6_secret_key_2024
JWT_EXPIRES=7d
APP_BASE_URL=http://localhost:3000
```

| Variable      | Description                                          | Default                                      |
|---------------|------------------------------------------------------|----------------------------------------------|
| `PORT`        | Server port                                          | `3000`                                       |
| `MONGO_URI`   | MongoDB connection string                            | `mongodb://localhost:27017/cit_doctracker`   |
| `JWT_SECRET`  | Secret for signing JWTs — change in production       | `cit_group6_secret_key_2024`                 |
| `JWT_EXPIRES` | JWT expiry duration                                  | `7d`                                         |
| `APP_BASE_URL`| Base URL embedded in QR codes                        | `http://localhost:3000`                      |

Never commit your `.env` file. Only commit `.env.example`.

---

## Deploying to Render

1. Push your repo to GitHub
2. Go to [render.com](https://render.com) and create a **New Web Service**
3. Connect your GitHub repository
4. Configure:

| Setting           | Value         |
|-------------------|---------------|
| **Build Command** | `npm install` |
| **Start Command** | `npm start`   |
| **Environment**   | `Node`        |

5. In the **Environment** tab, add all variables from `.env.example`:
   - Set `MONGO_URI` to your MongoDB Atlas connection string
   - Set `APP_BASE_URL` to your Render URL (e.g. `https://cit-doctracker.onrender.com`)
   - Set a strong random `JWT_SECRET`

6. Click **Deploy**

Use [MongoDB Atlas Free Tier](https://www.mongodb.com/atlas) for the database — Render cannot run a local MongoDB instance.

---

## API Reference

### Auth

| Method | Endpoint             | Auth    | Description                          |
|--------|----------------------|---------|--------------------------------------|
| `POST` | `/api/auth/register` | None    | Create a new user account            |
| `POST` | `/api/auth/login`    | None    | Sign in — returns a JWT token        |
| `GET`  | `/api/auth/me`       | JWT     | Get the currently authenticated user |

### Documents

| Method   | Endpoint                          | Auth | Description                                        |
|----------|-----------------------------------|------|----------------------------------------------------|
| `POST`   | `/api/documents/register`         | JWT  | Register a document (supports multipart upload)    |
| `GET`    | `/api/documents`                  | JWT  | Get documents (admin sees all; users see their own)|
| `GET`    | `/api/documents/track/:id`        | None | Public tracking by ULID, displayId, or fullDisplayId|
| `GET`    | `/api/documents/download/:id`     | None | Download file (only if status is `Released`)       |
| `GET`    | `/api/documents/:id/original-file`| JWT  | Fetch original encrypted file blob                 |
| `PATCH`  | `/api/documents/:id/status`       | JWT  | Update status + optional processed file upload     |
| `DELETE` | `/api/documents/:id`              | JWT  | Delete a document                                  |

### Health Check

```
GET /api/health
-> { status: "ok", message: "CIT DocTracker API running", group: "Group 6" }
```

---

## Security Notes

- Passwords are hashed with **bcrypt** (10 salt rounds) — never stored in plain text
- Files are encrypted with **IDEA-128 entirely in the browser** before upload
- The server stores only the encrypted blob — decryption happens client-side on download
- Every protected route is guarded by the JWT `authMiddleware`
- File uploads are capped at **20 MB** via multer
- A document cannot be set to `Released` unless a processed file has been attached by an admin

---

## Dependencies

| Package          | Purpose                          |
|------------------|----------------------------------|
| `express`        | Web framework                    |
| `mongoose`       | MongoDB ODM                      |
| `bcryptjs`       | Password hashing                 |
| `jsonwebtoken`   | JWT signing & verification       |
| `multer`         | Multipart/form-data file upload  |
| `qrcode`         | Server-side QR code generation   |
| `uuid`           | UUID generation                  |
| `cors`           | Cross-origin request headers     |
| `dotenv`         | Environment variable loading     |
| `nodemon` (dev)  | Auto-restart on file changes     |

---

## Group 6
