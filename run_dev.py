from __future__ import annotations

import argparse
import signal
import subprocess
import sys
import time
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent
RUN_BACKEND = REPO_ROOT / "run_backend.py"
RUN_FRONTEND = REPO_ROOT / "run_frontend.py"


def terminate_process(process: subprocess.Popen[bytes] | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()


def main() -> int:
    parser = argparse.ArgumentParser(description="Start backend and frontend together.")
    parser.add_argument("--api-base-url", default="", help="Override EXPO_PUBLIC_API_BASE_URL.")
    parser.add_argument("--update-deps", action="store_true", help="Upgrade backend and frontend dependencies while installing.")
    parser.add_argument("--web", action="store_true", help="Start the Expo frontend in web mode.")
    parser.add_argument("--backend-no-reload", action="store_true", help="Disable uvicorn auto-reload.")
    args = parser.parse_args()

    backend_cmd = [sys.executable, str(RUN_BACKEND)]
    if args.update_deps:
        backend_cmd.append("--update-deps")
    if args.backend_no_reload:
        backend_cmd.append("--no-reload")

    frontend_cmd = [sys.executable, str(RUN_FRONTEND)]
    if args.update_deps:
        frontend_cmd.append("--update-deps")
    if args.api_base_url:
        frontend_cmd.extend(["--api-base-url", args.api_base_url])
    if args.web:
        frontend_cmd.append("--web")

    print("Starting backend in the background...")
    backend_process = subprocess.Popen(backend_cmd, cwd=REPO_ROOT)
    time.sleep(2)

    try:
        print("Starting frontend in the foreground...")
        completed = subprocess.run(frontend_cmd, cwd=REPO_ROOT)
        return completed.returncode
    except KeyboardInterrupt:
        print("\nStopping development servers...")
        return 130
    finally:
        terminate_process(backend_process)


if __name__ == "__main__":
    if sys.platform != "win32":
        signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    raise SystemExit(main())
