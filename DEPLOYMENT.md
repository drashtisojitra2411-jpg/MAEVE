# MAEVE — Production Deployment Guide

This guide details the production deployment architecture for **MAEVE**, including the React + Vite frontend, Node.js + Express backend, Python YOLOv8 computer-vision inference engine, and persistent SQLite database.

---

## 1. Architectural Architecture & Service Separation

MAEVE is composed of three interconnected layers:

1. **Frontend Client**: React 18 + Vite SPA with Tailwind CSS, Lucide icons, and Framer Motion.
2. **Backend API**: Node.js 22 + Express REST API providing session authentication, rate limiting, and wardrobe management.
3. **Computer-Vision AI Worker**: Python 3.10+ running PyTorch, OpenCV (`cv2`), and Ultralytics YOLOv8s-seg (`deepfashion2_yolov8s-seg.pt`) for instance segmentation, fabric continuity recovery, and color calibration.
4. **Data Persistence**: SQLite database (`server/data/maeve.db`) with Write-Ahead Logging (WAL) and persistent garment cutout images (`server/data/images/`).

```
┌─────────────────────────────────────────────────────────────┐
│                       USER BROWSER                          │
└───────────────┬─────────────────────────────▲───────────────┘
                │                             │
    Static Assets & SPA Routing        API Requests & Garment Uploads
                │                             │
┌───────────────▼─────────────┐ ┌─────────────┴───────────────┐
│       VERCEL EDGE CDN       │ │    BACKEND CONTAINER HOST   │
│   (React 18 + Vite Bundle)  │ │ (Railway / Render / VPS)    │
│                             │ │                             │
│ • Global low-latency CDN    │ │ • Node.js 22 Express API    │
│ • vercel.json SPA rewrites  │ │ • Python YOLOv8 AI Worker   │
│ • Zero static server costs  │ │ • 15 MB file upload support │
└─────────────────────────────┘ └──────────────┬──────────────┘
                                               │
                                ┌──────────────▼──────────────┐
                                │      PERSISTENT VOLUME      │
                                │   /app/server/data          │
                                │                             │
                                │ • SQLite DB (maeve.db)      │
                                │ • Garment cutouts (images/) │
                                └─────────────────────────────┘
```

### Why the Backend & AI Cannot Run Purely on Vercel Serverless

| Vercel Serverless Constraint | MAEVE Requirement | Technical Conflict |
| :--- | :--- | :--- |
| **Max Uncompressed Bundle: 250 MB** | PyTorch, Ultralytics, and OpenCV exceed **1.5 GB** | Exceeds Vercel deployment bundle limits by >6x. |
| **Hobby Execution Timeout: 10 seconds** | YOLOv8 CPU segmentation takes **15–25 seconds** | Requests fail with `504 FUNCTION_INVOCATION_TIMEOUT`. |
| **Ephemeral Filesystem (`/tmp` wiped)** | SQLite (`maeve.db`) and uploaded images require durability | User accounts, wardrobes, and garment cutouts vanish on cold restarts. |
| **Max Request Body: 4.5 MB** | High-resolution clothing photos up to **15 MB** | Direct photo uploads fail with `413 Payload Too Large`. |
| **Missing Native Runtimes** | Requires Python 3.10+, `libgl1`, `libglib2.0-0` | Cannot spawn local AI worker sub-processes. |

**Production Strategy**:
- **Frontend** $\rightarrow$ **Vercel** (Global Edge CDN, automatic SSL, instant cache invalidation, $0 cost).
- **Backend + AI Worker + SQLite + Images** $\rightarrow$ **Container Host with Persistent Disk** (Railway, Render, Fly.io, or Self-Hosted VPS).

---

## 2. Hosting Options, Free-Tier Limits & Costs

### Frontend: Vercel
- **Plan**: Hobby Tier ($0 / month, free forever).
- **Includes**: Unlimited deployments, custom domain, automatic SSL, 100 GB bandwidth, Git integration.
- **Configuration**: Uses repository root with `vercel.json` and `VITE_API_URL` environment variable.

### Backend: Persistent Container Hosts (Choose One)

| Platform | Plan / Tier | Estimated Cost | Persistent Storage | Pros & Considerations |
| :--- | :--- | :--- | :--- | :--- |
| **Railway** *(Recommended)* | Hobby / Developer | **$5 / month** ($5 free trial credit included) | Persistent volume attached to `/app/server/data` ($0.25/GB/mo) | Turnkey 1-click Dockerfile build. Auto-restarts on failure. Full CPU support for PyTorch. |
| **Render** | Starter Web Service | **$7 / month** | Persistent Disk at `/app/server/data` ($0.25/GB/mo) | Native `render.yaml` blueprint support. Predictable pricing. |
| **Fly.io** | Free / Launch | **$0–$5 / month** | 3 GB persistent volume included in free allowance | Free tier available for light use; scale RAM to 2 GB for AI inference. |
| **Self-Hosted VPS** *(Hetzner / DO / Linode)* | Basic Cloud VPS | **$3.50–$6 / month** | Local SSD/NVMe volume with `docker compose up -d` | Lowest cost per GB RAM; full control over database backups and compute resources. |

> [!NOTE]
> Minimum Recommended Specs for the Backend Container: **2 vCPU, 2 GB RAM, 5–10 GB Persistent Disk**.

---

## 3. Step-by-Step Deployment Instructions

### Step 1: Deploy the Backend Container with Persistent Storage

#### Option A: Deploy on Railway
1. Push your repository to GitHub.
2. Sign in to [railway.app](https://railway.app) and click **New Project** $\rightarrow$ **Deploy from GitHub repo**.
3. Select your `MAEVE` repository. Railway will detect the `Dockerfile`.
4. In the Railway dashboard:
   - Go to **Volumes** $\rightarrow$ **Add Volume**.
   - Set the Mount Path to `/app/server/data`.
5. Go to **Variables** and configure:
   ```env
   NODE_ENV=production
   PORT=8787
   MAEVE_SESSION_SECRET=generate_a_random_64_character_hex_secret
   MAEVE_DATA_DIR=/app/server/data
   MAEVE_DB=/app/server/data/maeve.db
   MAEVE_CORS_ORIGIN=https://*.vercel.app,https://your-custom-domain.com
   MAEVE_RATE_LIMIT=1
   TRUST_PROXY=1
   ```
6. In **Settings** $\rightarrow$ **Networking**, click **Generate Domain** (e.g., `https://maeve-production.up.railway.app`).
7. Verify backend health by visiting `https://<YOUR-BACKEND-DOMAIN>/api/health`.

#### Option B: Deploy on Render
1. Sign in to [render.com](https://render.com) and click **New +** $\rightarrow$ **Blueprint**.
2. Connect your GitHub repository. Render reads the included `render.yaml` file automatically.
3. Review the environment variables and ensure `MAEVE_CORS_ORIGIN` is set to `https://*.vercel.app`.
4. Click **Apply**. Render will build the Docker container and attach the 10 GB persistent disk.

#### Option C: Deploy on a Self-Hosted VPS via Docker Compose
1. SSH into your VPS (Ubuntu 22.04 / 24.04 with Docker and Docker Compose installed).
2. Clone the repository and copy `.env.example` to `.env`:
   ```bash
   git clone https://github.com/<your-username>/MAEVE.git /opt/maeve
   cd /opt/maeve
   cp .env.example .env
   ```
3. Generate a secure session secret:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
4. Set `MAEVE_SESSION_SECRET` and `MAEVE_CORS_ORIGIN=https://*.vercel.app` in `.env`.
5. Launch the container:
   ```bash
   docker compose up -d --build
   ```
6. Setup a reverse proxy (e.g. Nginx or Caddy) with SSL pointing to `http://localhost:8787`.

---

### Step 2: Deploy the Frontend to Vercel

1. Sign in to [vercel.com](https://vercel.com) and click **Add New...** $\rightarrow$ **Project**.
2. Import your `MAEVE` GitHub repository.
3. Configure the Project Settings:
   - **Framework Preset**: Vite (detected automatically).
   - **Root Directory**: `./` (leave default).
   - **Build Command**: `npm run build`.
   - **Output Directory**: `dist`.
   - **Install Command**: `npm install`.
4. Add the Environment Variable:
   - **Key**: `VITE_API_URL`
   - **Value**: `https://<YOUR-BACKEND-DOMAIN>` (e.g. `https://maeve-production.up.railway.app`, without trailing slash).
5. Click **Deploy**.
6. Vercel will build the React SPA in ~30–45 seconds and provide your live URL (e.g., `https://maeve-wardrobe.vercel.app`).

---

## 4. Environment Variables Reference

### Backend Server (`.env`)

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | `production` | Set to `production` for security headers, strict cookie policies, and static asset caching. |
| `PORT` | Yes | `8787` | HTTP port the Express server listens on. |
| `MAEVE_SESSION_SECRET` | **Yes (in prod)** | *None* | High-entropy random string (32+ chars) used for session signing and auth token hashes. |
| `MAEVE_DATA_DIR` | Yes | `/app/server/data` | Path to persistent storage directory for SQLite and image files. Must be mounted to a persistent volume. |
| `MAEVE_DB` | Yes | `/app/server/data/maeve.db` | Exact path to the SQLite database file. |
| `MAEVE_CORS_ORIGIN` | Yes | `https://*.vercel.app` | Allowed CORS origins. Comma-separated list. Supports wildcards (e.g. `https://*.vercel.app`). |
| `MAEVE_RATE_LIMIT` | No | `1` | Enforces rate limits on authentication endpoints (30 attempts / 15 mins). |
| `MAEVE_MIN_CONF` | No | `0.30` | Minimum confidence threshold for AI garment detection. |
| `MAEVE_CONFIRM_CONF`| No | `0.60` | Threshold above which garments are marked confident without requiring manual review. |
| `TRUST_PROXY` | No | `1` | Enables reverse-proxy IP tracking behind Cloudflare, Railway, or Nginx. |

### Frontend Client (`Vercel Project Settings`)

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `VITE_API_URL` | **Yes (on Vercel)**| `""` (relative) | Full URL of the backend service (e.g. `https://maeve-api.railway.app`). Leave empty only when running same-origin in local Docker. |

---

## 5. Production Verification & Testing Checklist

Once both services are deployed, test the following checklist:

- [ ] **1. Health Endpoint**:
  Visit `https://<YOUR-BACKEND-DOMAIN>/api/health`.
  Expected JSON:
  ```json
  {
    "ok": true,
    "service": "maeve-server",
    "cv": {
      "backend": "python-worker",
      "model": "yolov8s-seg-deepfashion2",
      "available": true
    }
  }
  ```
- [ ] **2. Single-Page Routing (Vercel CDN)**:
  Open `https://<YOUR-VERCEL-URL>/wardrobe` directly and press hard reload (Ctrl+Shift+R / Cmd+Shift+R).
  The page must render without 404 errors (verified via `vercel.json` rewrite).
- [ ] **3. User Registration & Session Auth**:
  Create a new account on `https://<YOUR-VERCEL-URL>/auth`.
  Verify successful account creation and session persistence.
- [ ] **4. "Remember Me" Persistence**:
  Check "Remember Me" during login. Close the browser tab and re-open; user must remain authenticated.
- [ ] **5. Garment Upload & AI Segmentation**:
  Go to **Add to Wardrobe**, upload a photograph of clothing (e.g., Kurta, dress, shirt).
  Verify that the 7-stage progress bar advances, background removal executes, and attributes (color, category, pattern) are accurately extracted.
- [ ] **6. Image Asset Access & Token Verification**:
  Inspect the extracted garment thumbnail on the review card. Ensure the image loads with the authenticated `?token=` parameter.
- [ ] **7. Wardrobe Save & Database Durability**:
  Click **Save Garments to Wardrobe**.
  Restart or redeploy the backend container.
  Verify that all saved garments and images remain intact.
- [ ] **8. Outfit Recommendation & Weather Proxy**:
  Navigate to **Stylist** and verify that outfit recommendations compose and the weather widget displays real-time forecasts.

---

## 6. Disaster Recovery & Database Backups

MAEVE includes automated online SQLite backup scripts that do not lock or disrupt live database transactions:

### Manual Hot Backup
```bash
docker exec -it maeve-app npm run db:backup
```
Creates a point-in-time snapshot using SQLite's atomic `VACUUM INTO` command at `/app/server/data/backups/maeve-backup-<timestamp>.db`.

### Restore Backup
```bash
docker exec -it maeve-app node scripts/dbBackup.mjs restore /app/server/data/backups/maeve-backup-<timestamp>.db
```
Restores the database with automated integrity checks before applying changes.

