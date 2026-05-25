# CIT Document Tracker Frontend Deployment Guide
**Deploying to Cloudflare Pages**

This Vite-based React application uses TanStack Start with a Cloudflare Workers/Pages adapter. It is optimized to run serverless at the edge.

---

## Deployment Options

### Option A: GitHub Integration (Recommended)
Cloudflare Pages can automatically rebuild and deploy your application whenever you push changes to your GitHub repository.

1. **Log in** to your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
3. Select your repository and click **Begin setup**.
4. Configure the **Build Settings**:
   * **Project name:** Choose a name (e.g., `cit-doc-tracker`).
   * **Production branch:** `main` (or your default branch).
   * **Framework preset:** `Vite` (or select `None`).
   * **Build command:** `npm run build`
   * **Build output directory:** `dist/client`
5. Configure the **Environment Variables** (under Build settings):
   * Add `VITE_API_URL` pointing to your backend (e.g. `https://your-backend.onrender.com/api`).
   * Add `VITE_IDEA_SHARED_KEY` containing the shared IDEA decryption key (e.g. `Group6CITKey2024`).
6. Configure **Functions / Workers Settings**:
   * Under the **Settings** tab of your project, go to **Functions** or **Build & deployments** > **Compatibility settings**.
   * Set the **Compatibility date** to `2025-09-24` or newer.
   * Add `nodejs_compat` to **Compatibility flags**.
7. Click **Save and Deploy**.

---

### Option B: Deploying via Wrangler CLI

If you prefer to deploy manually from your terminal, you can use the Wrangler CLI:

1. Install Wrangler globally (if not already done):
   ```bash
   npm install -g wrangler
   ```
2. Log in to your Cloudflare account via CLI:
   ```bash
   npx wrangler login
   ```
3. Build the project locally:
   ```bash
   npm run build
   ```
4. Deploy the compiled assets:
   ```bash
   npx wrangler pages deploy dist/client --project-name=your-project-name
   ```
   * *Note: Replace `your-project-name` with your actual Cloudflare Pages project name.*
5. Set environment variables on the Cloudflare dashboard under your project settings.

---

## Development & Testing

To run the production build locally using wrangler to simulate the Cloudflare Pages environment:

```bash
# Build the application
npm run build

# Start wrangler preview
npx wrangler pages dev dist/client
```
