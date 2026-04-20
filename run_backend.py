from __future__ import annotations

import argparse
import hashlib
import os
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent
BACKEND_DIR = REPO_ROOT / "backend"
VENV_DIR = BACKEND_DIR / ".venv"
REQUIREMENTS_FILE = BACKEND_DIR / "requirements.txt"
ENV_FILE = BACKEND_DIR / ".env"
BACKEND_DEPS_STAMP = VENV_DIR / ".requirements-installed"


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


def venv_python() -> Path:
    if os.name == "nt":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"


def ensure_venv() -> Path:
    python_in_venv = venv_python()
    if python_in_venv.exists():
        return python_in_venv

    print(f"Creating backend virtualenv at {VENV_DIR}")
    subprocess.run([sys.executable, "-m", "venv", str(VENV_DIR)], cwd=BACKEND_DIR, check=True)

    if not python_in_venv.exists():
        raise RuntimeError("Failed to create backend virtualenv.")
    return python_in_venv


def backend_dependency_signature() -> str:
    if not REQUIREMENTS_FILE.exists():
        return ""
    return hashlib.sha256(REQUIREMENTS_FILE.read_bytes()).hexdigest()


def ensure_backend_deps(python_bin: Path, update_deps: bool) -> None:
    if not REQUIREMENTS_FILE.exists():
        return

    signature = backend_dependency_signature()
    if not update_deps and VENV_DIR.exists():
        if not BACKEND_DEPS_STAMP.exists() and signature:
            BACKEND_DEPS_STAMP.write_text(signature + "\n", encoding="utf-8")
            print("Backend dependencies detected. Skipping reinstall. Use --update-deps to refresh.")
            return

        if BACKEND_DEPS_STAMP.exists():
            installed_signature = BACKEND_DEPS_STAMP.read_text(encoding="utf-8").strip()
            if installed_signature and installed_signature == signature:
                print("Backend dependencies already installed. Skipping reinstall. Use --update-deps to refresh.")
                return

    install_cmd = [str(python_bin), "-m", "pip", "install", "-r", str(REQUIREMENTS_FILE)]
    if update_deps:
        install_cmd.append("--upgrade")

    if update_deps:
        print("Refreshing backend dependencies...")
    else:
        print("Installing backend dependencies...")
    subprocess.run(install_cmd, cwd=BACKEND_DIR, check=True)

    if signature:
        BACKEND_DEPS_STAMP.write_text(signature + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Start the FastAPI backend.")
    parser.add_argument("--no-reload", action="store_true", help="Disable uvicorn auto-reload.")
    parser.add_argument("--update-deps", action="store_true", help="Upgrade backend dependencies while installing.")
    args = parser.parse_args()

    env_values = parse_env_file(ENV_FILE)
    backend_host = env_values.get("BACKEND_HOST", "0.0.0.0")
    backend_port = env_values.get("BACKEND_PORT", "8000")

    python_bin = ensure_venv()
    ensure_backend_deps(python_bin, args.update_deps)

    command = [
        str(python_bin),
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        backend_host,
        "--port",
        backend_port,
    ]
    if not args.no_reload:
        command.append("--reload")

    print(f"Starting backend from {BACKEND_DIR}")
    print(f"Using Python: {python_bin}")
    print(f"Binding API to http://{backend_host}:{backend_port}")

    completed = subprocess.run(command, cwd=BACKEND_DIR)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
