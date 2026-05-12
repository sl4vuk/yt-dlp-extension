#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

echo
echo "========================================="
echo " YT Bookmark Cleaner - Unix Install"
echo "========================================="
echo

if [ ! -f "./install_universal.py" ]; then
  echo "[ERROR] install_universal.py was not found next to this script."
  exit 1
fi

PY=""
for p in python3 python; do
  if command -v "$p" >/dev/null 2>&1; then
    if "$p" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3,8) else 1)' >/dev/null 2>&1; then
      PY="$p"
      break
    fi
  fi
done

OS="$(uname -s 2>/dev/null || echo unknown)"

install_with_pkg_manager() {
  if [ "$OS" = "Darwin" ]; then
    if command -v brew >/dev/null 2>&1; then
      echo "[INFO] Installing Python/ffmpeg with Homebrew..."
      brew install python ffmpeg || true
      return 0
    fi
    echo "[ERROR] Python 3.8+ is required. Install it from python.org or install Homebrew, then run: brew install python ffmpeg"
    return 1
  fi

  if command -v apt-get >/dev/null 2>&1; then
    echo "[INFO] Installing Python/ffmpeg with apt..."
    sudo apt-get update
    sudo apt-get install -y python3 python3-pip python3-venv ffmpeg
    return 0
  fi
  if command -v dnf >/dev/null 2>&1; then
    echo "[INFO] Installing Python/ffmpeg with dnf..."
    sudo dnf install -y python3 python3-pip ffmpeg
    return 0
  fi
  if command -v yum >/dev/null 2>&1; then
    echo "[INFO] Installing Python/ffmpeg with yum..."
    sudo yum install -y python3 python3-pip ffmpeg
    return 0
  fi
  if command -v pacman >/dev/null 2>&1; then
    echo "[INFO] Installing Python/ffmpeg with pacman..."
    sudo pacman -Sy --needed python python-pip ffmpeg
    return 0
  fi
  if command -v zypper >/dev/null 2>&1; then
    echo "[INFO] Installing Python/ffmpeg with zypper..."
    sudo zypper install -y python3 python3-pip ffmpeg
    return 0
  fi
  if command -v apk >/dev/null 2>&1; then
    echo "[INFO] Installing Python/ffmpeg with apk..."
    sudo apk add python3 py3-pip ffmpeg
    return 0
  fi

  echo "[ERROR] No supported package manager found. Install python3, pip, and ffmpeg manually."
  return 1
}

if [ -z "$PY" ]; then
  echo "[INFO] Python 3.8+ was not found. Trying package manager install..."
  install_with_pkg_manager || exit 1
fi

PY=""
for p in python3 python; do
  if command -v "$p" >/dev/null 2>&1; then
    if "$p" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3,8) else 1)' >/dev/null 2>&1; then
      PY="$p"
      break
    fi
  fi
done

if [ -z "$PY" ]; then
  echo "[ERROR] Python 3.8+ is still not available."
  exit 1
fi

echo "[OK] Python found: $($PY --version 2>&1)"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "[INFO] ffmpeg was not found. Trying package manager install..."
  install_with_pkg_manager || true
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "[WARN] ffmpeg is still not in PATH. Downloads may work, but audio/video conversion can fail."
else
  echo "[OK] ffmpeg found."
fi

echo "[INFO] Preparing pip..."
"$PY" -m ensurepip --upgrade >/dev/null 2>&1 || true

PIP_OK=0
"$PY" -m pip install --user --upgrade pip yt-dlp mutagen && PIP_OK=1 || true
if [ "$PIP_OK" != "1" ]; then
  echo "[WARN] Normal pip install failed. Trying with --break-system-packages..."
  "$PY" -m pip install --user --break-system-packages --upgrade pip yt-dlp mutagen && PIP_OK=1 || true
fi
if [ "$PIP_OK" != "1" ]; then
  echo "[ERROR] Failed to install yt-dlp/mutagen with pip."
  exit 1
fi

echo "[INFO] Running universal installer/repair..."
exec "$PY" ./install_universal.py --repair "$@"
