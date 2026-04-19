from __future__ import annotations

import argparse
import os
import socket
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent
FRONTEND_DIR = REPO_ROOT / "frontend"
BACKEND_ENV_FILE = REPO_ROOT / "backend" / ".env"
FRONTEND_ENV_LOCAL_FILE = FRONTEND_DIR / ".env.local"
PACKAGE_LOCK = FRONTEND_DIR / "package-lock.json"


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def add_candidate(store: list[str], value: str) -> None:
    normalized = value.strip().strip('"').strip("'").rstrip("/")
    if not normalized:
        return
    if not normalized.startswith(("http://", "https://")):
        normalized = f"http://{normalized}"
    if normalized not in store:
        store.append(normalized)


def detect_local_ips() -> list[str]:
    ips: list[str] = []
    try:
        hostname = socket.gethostname()
        for family, _, _, _, sockaddr in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = sockaddr[0]
            if not ip.startswith(("127.", "169.254.")) and ip not in ips:
                ips.append(ip)
    except OSError:
        pass

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        if not ip.startswith(("127.", "169.254.")) and ip not in ips:
            ips.append(ip)
    except OSError:
        pass

    return ips


def ensure_frontend_deps(update_deps: bool) -> None:
    if not (FRONTEND_DIR / "package.json").exists():
        return

    print(f"Ensuring frontend dependencies (update={update_deps})...")
    if PACKAGE_LOCK.exists():
        subprocess.run(["npm", "ci"], cwd=FRONTEND_DIR, check=True)
    else:
        subprocess.run(["npm", "install"], cwd=FRONTEND_DIR, check=True)

    if update_deps:
        subprocess.run(["npm", "update"], cwd=FRONTEND_DIR, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Start the Expo frontend.")
    parser.add_argument("--api-base-url", default="", help="Override EXPO_PUBLIC_API_BASE_URL.")
    parser.add_argument("--no-start", action="store_true", help="Only generate frontend env and install deps.")
    parser.add_argument("--update-deps", action="store_true", help="Upgrade frontend dependencies while installing.")
    parser.add_argument("--web", action="store_true", help="Start Expo in web mode instead of LAN mode.")
    args = parser.parse_args()

    env_values = parse_env_file(BACKEND_ENV_FILE)
    backend_port = env_values.get("BACKEND_PORT", "8000")
    api_base_url = args.api_base_url or env_values.get("BACKEND_PUBLIC_BASE_URL", "") or env_values.get("EXPO_PUBLIC_API_BASE_URL", "")
    api_candidates: list[str] = []

    candidate_line = env_values.get("EXPO_PUBLIC_API_CANDIDATES", "")
    for value in candidate_line.split(","):
        if value.strip():
            add_candidate(api_candidates, value)

    if api_base_url:
        add_candidate(api_candidates, api_base_url)

    for ip in detect_local_ips():
        add_candidate(api_candidates, f"{ip}:{backend_port}")

    add_candidate(api_candidates, f"10.0.2.2:{backend_port}")
    add_candidate(api_candidates, f"127.0.0.1:{backend_port}")
    add_candidate(api_candidates, f"localhost:{backend_port}")

    if not api_base_url and api_candidates:
        api_base_url = api_candidates[0]

    env_lines = [
        f"EXPO_PUBLIC_API_BASE_URL={api_base_url}",
        f"EXPO_PUBLIC_API_CANDIDATES={','.join(api_candidates)}",
    ]
    FRONTEND_ENV_LOCAL_FILE.write_text("\n".join(env_lines) + "\n", encoding="utf-8")

    print(f"Wrote generated frontend env to {FRONTEND_ENV_LOCAL_FILE}")
    if api_base_url:
        print(f"Using EXPO_PUBLIC_API_BASE_URL={api_base_url}")
    if api_candidates:
        print(f"Using EXPO_PUBLIC_API_CANDIDATES={','.join(api_candidates)}")

    ensure_frontend_deps(args.update_deps)

    if args.no_start:
        return 0

    if args.web:
        command = ["npm", "run", "web"]
    else:
        command = ["npx", "expo", "start", "--clear", "--lan"]

    print(f"Starting frontend from {FRONTEND_DIR}")
    completed = subprocess.run(command, cwd=FRONTEND_DIR)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
