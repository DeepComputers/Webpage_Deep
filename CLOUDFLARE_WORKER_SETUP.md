# 🌐 Permanent Cloudflare Worker Setup (100% Free • Unlimited Bandwidth)

This guide shows you how to deploy the permanent gateway worker in Cloudflare in **less than 2 minutes**.

---

### Step 1: Create a Free Cloudflare Account
If you don't already have one, sign up for a free account at [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) (No credit card required).

---

### Step 2: Create a Cloudflare Worker
1. In your Cloudflare Dashboard, click **Workers & Pages** in the left sidebar.
2. Click **Create Application** -> **Create Worker**.
3. Choose a name for your worker (e.g. `deepcomputers` or `deep-computers-shop`).  
   *(Your permanent URL will be `https://deepcomputers.<your-subdomain>.workers.dev`)*.
4. Click **Deploy**.

---

### Step 3: Paste the Worker Code
1. Click **Edit code** (or **Quick Edit**).
2. Delete whatever template code is in the editor.
3. Open `cloudflare_worker.js` from this folder (`D:\2\cloudflare_worker.js`), copy all the code, and paste it into the editor.
4. Click **Save and Deploy**.

---

### Step 4: Add KV Storage (Takes 30 seconds)
1. In the Cloudflare Dashboard, go to **Workers & Pages** -> **KV**.
2. Click **Create a namespace**, enter `TUNNEL_KV`, and click **Add**.
3. Go back to **Workers & Pages**, click on your worker (`deepcomputers`), and go to **Settings** -> **Variables and Secrets** (or **Bindings**).
4. Under **KV Namespace Bindings**, click **Add binding**:
   - **Variable name**: `TUNNEL_KV`
   - **KV namespace**: Select the `TUNNEL_KV` namespace you just created.
5. Click **Deploy** / **Save**.
6. Under **Settings** -> **Variables and Secrets**, add `SYNC_KEY` as a secret. Use a strong, unique value and configure the same value in your local `SYNC_KEY` environment variable.

---

### Step 5: Save your Permanent URL in `worker_config.json`
Open `D:\2\worker_config.json` and paste your worker URL:

```json
{
  "worker_url": "https://deepcomputers.<your-subdomain>.workers.dev"
}
```

Keep any `SYNC_KEY`, `ADMIN_MASTER_KEY`, and tunnel token in environment variables or local secret configuration only. Do not commit them.

In PowerShell, set the local Worker secret before starting the server:

```powershell
$env:SYNC_KEY = "<the same secret configured on the Worker>"
.\start.bat
```

---

### 🚀 That's it!
Whenever you run `start.bat` or `python run.py`:
- Cloudflare Tunnel connects with **unlimited bandwidth**.
- `run.py` automatically updates your permanent Cloudflare Worker.
- Your store is permanently live at:
  - **Storefront**: `https://deepcomputers.<your-subdomain>.workers.dev/`
  - **Catalog**: `https://deepcomputers.<your-subdomain>.workers.dev/catalog`
  - **On-Demand**: `https://deepcomputers.<your-subdomain>.workers.dev/onorder`
  - **Admin**: `https://deepcomputers.<your-subdomain>.workers.dev/admin`
- **Cost**: **$0.00 forever**
- **Bandwidth Limit**: **NONE (Unmetered global Cloudflare edge)**
