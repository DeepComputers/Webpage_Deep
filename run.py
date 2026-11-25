"""
Deep Computers & Telecom - Complete Store Server & Permanent Live Tunnel Launcher
Runs FastAPI backend and connects high-speed Cloudflare Edge tunnel with auto-sync to Vercel permanent domain.
"""
import atexit
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
import uvicorn

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

PERMANENT_VERCEL_DOMAIN = "deep-computers-ten.vercel.app"
tunnel_process = None


def get_local_ip() -> str:
    """Find the local machine IP on the Wi-Fi/LAN network."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def find_binary(name: str):
    """Find executable in tools/, project root, PATH, or WindowsApps."""
    for candidate_dir in [
        BASE_DIR / "tools",
        BASE_DIR / "tools" / name,
        BASE_DIR,
        Path("D:/Deep Computers/tools"),
        Path("D:/2/tools"),
    ]:
        target = candidate_dir / (f"{name}.exe" if sys.platform == "win32" else name)
        if target.is_file():
            return str(target)

    # WindowsApps / WinGet
    if sys.platform == "win32":
        winapps = os.path.expandvars(rf"%LOCALAPPDATA%\Microsoft\WindowsApps\{name}.exe")
        if os.path.isfile(winapps):
            return winapps

    p = shutil.which(name)
    if p:
        return p

    if sys.platform == "win32":
        for cp in [
            rf"C:\Program Files\{name}\{name}.exe",
            rf"C:\Program Files (x86)\{name}\{name}.exe",
            os.path.expandvars(rf"%LOCALAPPDATA%\{name}\{name}.exe"),
        ]:
            if os.path.isfile(cp):
                return cp
    return None


def free_port(port: int):
    """Free port 8000 and terminate any stale server processes."""
    if os.name == "nt":
        # Do not kill cloudflared if it is running as a permanent Windows Service!
        if not is_cloudflared_service_running():
            subprocess.run("taskkill /F /IM ngrok.exe /IM nginx.exe", shell=True, capture_output=True)
        else:
            subprocess.run("taskkill /F /IM ngrok.exe /IM nginx.exe", shell=True, capture_output=True)
        try:
            output = subprocess.check_output(f"netstat -ano | findstr :{port}", shell=True, text=True)
            for line in output.strip().splitlines():
                if "LISTENING" in line:
                    parts = line.strip().split()
                    pid = int(parts[-1])
                    if pid != os.getpid():
                        print(f"  [CLEANUP] Freeing occupied port {port} (PID {pid})...")
                        subprocess.run(f"taskkill /F /PID {pid}", shell=True, capture_output=True)
                        time.sleep(1)
        except Exception:
            pass


def cleanup():
    global tunnel_process
    if tunnel_process:
        try:
            tunnel_process.terminate()
        except Exception:
            pass
        tunnel_process = None


atexit.register(cleanup)


def load_worker_config() -> dict:
    config_file = BASE_DIR / "worker_config.json"
    cfg = {"worker_url": "", "sync_key": "", "tunnel_token": ""}
    if config_file.exists():
        try:
            data = json.loads(config_file.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                cfg["worker_url"] = (data.get("worker_url") or "").strip().rstrip("/")
                cfg["sync_key"] = (data.get("sync_key") or "").strip()
                cfg["tunnel_token"] = (data.get("tunnel_token") or "").strip()
        except Exception:
            pass
    if os.environ.get("CLOUDFLARE_WORKER_URL"):
        cfg["worker_url"] = os.environ.get("CLOUDFLARE_WORKER_URL", "").strip().rstrip("/")
    if os.environ.get("SYNC_KEY"):
        cfg["sync_key"] = os.environ["SYNC_KEY"].strip()
    if os.environ.get("CLOUDFLARE_TUNNEL_TOKEN"):
        cfg["tunnel_token"] = os.environ.get("CLOUDFLARE_TUNNEL_TOKEN", "").strip()
    return cfg


def sync_to_cloudflare_worker(tunnel_url: str, state: dict):
    """Update permanent Cloudflare Worker endpoint with active tunnel URL."""
    cfg = load_worker_config()
    worker_url = cfg.get("worker_url")
    sync_key = cfg.get("sync_key", "")
    if not worker_url:
        return
    if not sync_key:
        print("  [SYNC NOTICE] SYNC_KEY is not configured; skipping Worker sync.")
        return

    def _worker():
        try:
            req = urllib.request.Request(
                f"{worker_url}/__sync_tunnel",
                data=json.dumps({"url": tunnel_url}).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "X-Sync-Key": sync_key,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status == 200:
                    state["worker_synced"] = True
                    state["worker_url"] = worker_url
                    print(f"  [SYNC SUCCESS] Permanent Cloudflare Worker updated: {worker_url}")
        except Exception as e:
            state["worker_error"] = str(e)
            print(f"  [SYNC NOTICE] Cloudflare Worker sync: {e}")

    threading.Thread(target=_worker, daemon=True).start()


def sync_to_vercel_and_git(tunnel_url: str):
    """Update vercel.json rewrite target and sync to GitHub so permanent Vercel domain stays active."""
    def _worker():
        # Update vercel.json in BASE_DIR and D:\Deep Computers
        for target_dir in [BASE_DIR, Path("D:/Deep Computers")]:
            v_path = target_dir / "vercel.json"
            if v_path.exists():
                try:
                    content = v_path.read_text(encoding="utf-8")
                    updated = re.sub(
                        r'https://[a-zA-Z0-9-]+\.(?:trycloudflare\.com|ngrok-free\.dev)',
                        tunnel_url.rstrip("/"),
                        content,
                    )
                    v_path.write_text(updated, encoding="utf-8")
                except Exception:
                    pass

        # Push to GitHub
        git_dir = Path("D:/Deep Computers") if (Path("D:/Deep Computers") / ".git").is_dir() else BASE_DIR
        try:
            subprocess.run(["git", "add", "vercel.json", "LIVE_SHOP_URL.txt"], cwd=str(git_dir), capture_output=True)
            subprocess.run(
                ["git", "commit", "-m", f"Auto-sync live tunnel to {tunnel_url}"],
                cwd=str(git_dir),
                capture_output=True,
            )
            subprocess.run(["git", "push", "origin", "main"], cwd=str(git_dir), capture_output=True, timeout=12)
        except Exception:
            pass

    threading.Thread(target=_worker, daemon=True).start()


def is_cloudflared_service_running() -> bool:
    """Check if Cloudflared is already installed and running as a Windows Service."""
    if os.name == "nt":
        try:
            res = subprocess.run("sc.exe query Cloudflared", shell=True, capture_output=True, text=True)
            if "RUNNING" in res.stdout:
                return True
        except Exception:
            pass
    return False


def start_tunnel_process(port: int, state: dict):
    """
    Launch Cloudflare Tunnel to expose local port 8000.
    1. If tunnel_token is configured, runs permanent Cloudflare named tunnel.
    2. Otherwise, runs Cloudflare quick tunnel (trycloudflare.com) and auto-syncs
       to the permanent Cloudflare Worker (deepcomputers.workers.dev).
    Cloudflare is the sole tunnel engine (zero third-party bridges).
    """
    cfg = load_worker_config()
    tunnel_token = cfg.get("tunnel_token")
    cloudflared_bin = find_binary("cloudflared")

    if not cloudflared_bin:
        print("  [ERROR] cloudflared.exe not found!")
        print("  Please ensure cloudflared.exe is present in tools/ directory or in PATH.")
        return None, "Error", None

    # 1. Named Cloudflare Tunnel (if token present in worker_config.json or ENV)
    if tunnel_token:
        cmd = [
            cloudflared_bin, "tunnel", "run",
            "--token", tunnel_token,
            "--protocol", "http2",
            "--edge-ip-version", "auto",
            "--retries", "10",
            "--no-autoupdate",
        ]
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        return proc, "Cloudflare-Named", None

    # 2. Cloudflare Quick Tunnel (sole tunnel engine)
    cmd = [
        cloudflared_bin, "tunnel",
        "--url", f"http://127.0.0.1:{port}",
    ]
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )

        t0 = time.time()
        cf_url = None
        # Allow up to 25 seconds for Cloudflare edge routing to register
        while time.time() - t0 < 25:
            if proc.poll() is not None:
                break
            line = proc.stdout.readline()
            if not line:
                time.sleep(0.1)
                continue
            m = re.search(r'https://(?!(?:api|region1|region2)\.)([a-zA-Z0-9-]+\.trycloudflare\.com)', line)
            if m:
                cf_url = "https://" + m.group(1)
                break

        if cf_url:
            return proc, "Cloudflare-Tunnel", cf_url
        else:
            try:
                proc.terminate()
            except Exception:
                pass
            return None, "Cloudflare-Timeout", None
    except Exception as e:
        print(f"  [CLOUDFLARE ERROR] Failed to start tunnel: {e}")
        return None, "Cloudflare-Error", None


def wait_for_local_server(port: int, timeout: float = 12.0) -> bool:
    """Wait until local FastAPI/Uvicorn server is accepting connections."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.2)
    return False


def run_tunnel_supervisor(port: int, state: dict):
    """
    Continuous Self-Healing Cloudflare Tunnel Supervisor & Keepalive Engine.
    Ensures the permanent gateway (deepcomputers.workers.dev) stays live 24/7.
    """
    global tunnel_process
    first_boot = True
    stop_event = state.setdefault("stop_event", threading.Event())

    # Ensure local backend is fully bound and ready before starting edge tunnel
    wait_for_local_server(port)

    while not stop_event.is_set():
        proc, engine_type, tunnel_url = start_tunnel_process(port, state)

        if not proc or not tunnel_url:
            print("  [CLOUDFLARE RETRY] Waiting 4 seconds before reconnecting Cloudflare Tunnel...")
            time.sleep(4)
            continue

        tunnel_process = proc
        state["tunnel_proc"] = proc
        state["tunnel_url"] = tunnel_url
        state["tunnel_engine"] = engine_type

        # Save to LIVE_SHOP_URL.txt
        cfg_cur = load_worker_config()
        perm_url = cfg_cur.get("worker_url") or f"https://{PERMANENT_VERCEL_DOMAIN}"
        url_text = (
            "============================================================================\n"
            "  DEEP COMPUTERS & TELECOM - PERMANENT STORE URL (NEVER CHANGES)\n"
            "============================================================================\n\n"
            "  SHARE THIS PERMANENT LINK WITH CUSTOMERS (NEVER EXPIRES):\n"
            f"  👉  {perm_url}/\n\n"
            f"  - Product Catalog  : {perm_url}/catalog\n"
            f"  - Custom / OnOrder : {perm_url}/onorder\n"
            f"  - Admin Portal     : {perm_url}/admin\n\n"
            "============================================================================\n"
            f"  Permanent Vercel Mirror : https://{PERMANENT_VERCEL_DOMAIN}/\n"
            "============================================================================\n"
            "  Current Live Tunnel (Internal Direct Connection):\n"
            f"  {tunnel_url}\n"
            "============================================================================\n"
        )
        for base in [BASE_DIR, Path("D:/Deep Computers")]:
            try:
                (base / "LIVE_SHOP_URL.txt").write_text(url_text, encoding="utf-8")
            except Exception:
                pass

        # Sync to permanent Cloudflare Worker and Vercel domain
        sync_to_cloudflare_worker(tunnel_url, state)
        sync_to_vercel_and_git(tunnel_url)

        if first_boot:
            print_dashboard(state)
            first_boot = False
            # Automatically launch the permanent store URL in default browser
            cfg_cur = load_worker_config()
            open_target = cfg_cur.get("worker_url") or "https://deepcomputers.deepcomputers.workers.dev"
            def _open_store():
                time.sleep(2)
                try:
                    webbrowser.open(open_target)
                except Exception:
                    pass
            threading.Thread(target=_open_store, daemon=True).start()
        else:
            cfg_cur = load_worker_config()
            print(f"\n  [CLOUDFLARE RE-ESTABLISHED] {engine_type} -> {cfg_cur.get('worker_url', tunnel_url)}/")

        # Background thread to drain process stdout so buffer never blocks
        def _drain_stdout(p):
            try:
                for _ in iter(p.stdout.readline, ""):
                    pass
            except Exception:
                pass

        threading.Thread(target=_drain_stdout, args=(proc,), daemon=True).start()

        # Active Keepalive Heartbeat & Health Watchdog (1-second responsive auto-healing)
        consecutive_failures = 0
        last_ping = time.time()
        while not stop_event.is_set():
            time.sleep(1)

            # 1. Fast process termination check (detects any drop within 1s)
            if proc.poll() is not None:
                ret = proc.returncode
                print(f"\n  [WATCHDOG NOTICE] Cloudflare Tunnel disconnected. Auto-healing immediately...")
                break

            # 2. Keepalive ping through tunnel edge every 15s
            now = time.time()
            if now - last_ping >= 15:
                last_ping = now
                try:
                    probe_req = urllib.request.Request(
                        f"{tunnel_url}/api/health",
                        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
                    )
                    with urllib.request.urlopen(probe_req, timeout=5) as probe_resp:
                        if probe_resp.status == 200:
                            consecutive_failures = 0
                        else:
                            consecutive_failures += 1
                except Exception:
                    consecutive_failures += 1

                if consecutive_failures >= 3:
                    print(f"\n  [WATCHDOG ALERT] Cloudflare Tunnel unresponsive. Reconnecting...")
                    try:
                        proc.terminate()
                        proc.wait(timeout=2)
                    except Exception:
                        try:
                            proc.kill()
                        except Exception:
                            pass
                    break

        try:
            proc.terminate()
        except Exception:
            pass

        if not stop_event.is_set():
            time.sleep(2)


def print_dashboard(state: dict):
    port = state["port"]
    local_ip = state["local_ip"]
    tunnel_url = state.get("tunnel_url")
    cfg = load_worker_config()
    worker_url = cfg.get("worker_url") or state.get("worker_url")

    print("\n" + "=" * 76)
    print("      DEEP COMPUTERS & TELECOM - STORE SERVER & PERMANENT GATEWAY")
    print("=" * 76)
    if worker_url:
        print(f"  ⭐ PERMANENT STORE URL (SHARE THIS WITH CUSTOMERS • NEVER DIES):")
        print(f"     👉  {worker_url}/")
        print(f"     👉  {worker_url}/catalog")
        print(f"     👉  {worker_url}/onorder")
        print(f"     👉  {worker_url}/admin")
        print("  [BANDWIDTH LIMIT]      :  NONE (100% UNLIMITED & FREE via Cloudflare Edge)")
    else:
        print(f"  [PERMANENT VERCEL URL] :  https://{PERMANENT_VERCEL_DOMAIN}/")
        print("  [WORKER URL SETUP]     :  Set worker_url in worker_config.json for direct permanent URL")
    print("-" * 76)
    if tunnel_url:
        print(f"  [CLOUDFLARE TUNNEL]    :  {tunnel_url}/")
        print("  [TUNNEL STATUS]        :  ONLINE")
        print("  [NOTE]                 :  Always share the PERMANENT STORE URL above.")
    else:
        print("  [TUNNEL STATUS]        :  Connecting Cloudflare Tunnel...")
    print("-" * 76)
    print(f"  [SHOP WI-FI / LAN]     :  http://{local_ip}:{port}/")
    print(f"  [LOCAL MACHINE]        :  http://127.0.0.1:{port}/")
    print("  [ADMIN ACCESS]         :  Sign in through Firebase on the Admin page")
    print("=" * 76)
    print("  Server is LIVE and running. Press Ctrl+C to stop anytime.\n")


def main():
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))

    # Free port and clean up stale processes
    free_port(port)

    local_ip = get_local_ip()
    state = {
        "port": port,
        "local_ip": local_ip,
        "tunnel_url": None,
        "tunnel_proc": None,
        "tunnel_error": None,
        "stop_event": threading.Event(),
    }

    # Start self-healing tunnel supervisor in background thread
    t = threading.Thread(target=run_tunnel_supervisor, args=(port, state), daemon=True)
    t.start()

    # Initial dashboard display
    time.sleep(1)

    # Launch FastAPI application
    try:
        uvicorn.run(
            "backend.app:app",
            host=host,
            port=port,
            reload=False,
            limit_concurrency=2000,
            backlog=2048,
            timeout_keep_alive=30,
            access_log=False,
        )
    finally:
        state["stop_event"].set()
        cleanup()


if __name__ == "__main__":
    main()
