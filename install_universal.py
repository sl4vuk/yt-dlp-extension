#!/usr/bin/env python3
import argparse, json, os, platform, shutil, subprocess, sys
from pathlib import Path
HOST_NAME="com.ytbookmark.ytdlp"
DEFAULT_EXTENSION_ID="ilealfnjgomollhdmedilijpfepbkllp"
REQUIRED_PACKAGES=["yt-dlp","mutagen"]
APP_DIR=Path(__file__).resolve().parent
BIN_DIR=APP_DIR/"bin"
HOST_PY=APP_DIR/"native_host.py"
MANIFEST_JSON=APP_DIR/(HOST_NAME+".json")
WIN_LAUNCHER=APP_DIR/"native_host_launcher.bat"
UNIX_LAUNCHER=APP_DIR/"native_host_launcher.sh"
def is_windows(): return sys.platform.startswith("win")
def is_macos(): return sys.platform=="darwin"
def py_exe(): return str(Path(sys.executable).resolve())
def ensure_pip():
    try: subprocess.check_call([sys.executable,"-m","pip","--version"]); return True
    except Exception: pass
    try: subprocess.check_call([sys.executable,"-m","ensurepip","--upgrade"]); return True
    except Exception as e: print("[ERROR] pip unavailable:",e); return False
def install_python_deps():
    if not ensure_pip(): return False
    subprocess.call([sys.executable,"-m","pip","install","--upgrade","pip"])
    for cmd in ([sys.executable,"-m","pip","install","--upgrade","--user"]+REQUIRED_PACKAGES,[sys.executable,"-m","pip","install","--upgrade"]+REQUIRED_PACKAGES):
        if subprocess.call(cmd)==0: return True
    return False
def find_ffmpeg():
    names=["ffmpeg.exe","ffmpeg"] if is_windows() else ["ffmpeg"]
    for folder in [BIN_DIR,APP_DIR]:
        for name in names:
            p=folder/name
            if p.exists(): return str(p)
    for name in names:
        p=shutil.which(name)
        if p: return p
    return None
def try_install_ffmpeg_best_effort():
    if find_ffmpeg(): print("[OK] ffmpeg found:",find_ffmpeg()); return True
    print("[INFO] ffmpeg not found. Trying best-effort install...")
    if is_windows():
        winget=shutil.which("winget")
        if winget:
            for pkg in ("Gyan.FFmpeg","BtbN.FFmpeg.GPL"):
                if subprocess.call([winget,"install","--id",pkg,"-e","--accept-package-agreements","--accept-source-agreements"])==0: return True
        choco=shutil.which("choco")
        if choco and subprocess.call([choco,"install","ffmpeg","-y"])==0: return True
        scoop=shutil.which("scoop")
        if scoop and subprocess.call([scoop,"install","ffmpeg"])==0: return True
    elif is_macos():
        brew=shutil.which("brew")
        if brew and subprocess.call([brew,"install","ffmpeg"])==0: return True
    else:
        if shutil.which("apt-get"): print("[INFO] Debian/Ubuntu: sudo apt-get update && sudo apt-get install -y ffmpeg")
        elif shutil.which("dnf"): print("[INFO] Fedora: sudo dnf install -y ffmpeg")
        elif shutil.which("pacman"): print("[INFO] Arch: sudo pacman -S ffmpeg")
    return bool(find_ffmpeg())
def extension_id(args): return (args.extension_id or os.environ.get("YTBC_EXTENSION_ID") or DEFAULT_EXTENSION_ID).strip()
def write_launchers():
    if is_windows():
        content='@echo off\r\nsetlocal\r\nset "PATH='+str(BIN_DIR)+';%PATH%"\r\n"'+py_exe()+'" -u "'+str(HOST_PY)+'"\r\nexit /b %errorlevel%\r\n'
        WIN_LAUNCHER.write_text(content,encoding="utf-8"); return WIN_LAUNCHER
    content='#!/usr/bin/env sh\nDIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nPATH="$DIR/bin:$PATH"\nexec "'+py_exe()+'" -u "$DIR/native_host.py"\n'
    UNIX_LAUNCHER.write_text(content,encoding="utf-8"); os.chmod(UNIX_LAUNCHER,0o755); return UNIX_LAUNCHER
def write_manifest(ext_id,launcher):
    m={"name":HOST_NAME,"description":"YT Bookmark Cleaner - yt-dlp bridge","path":str(launcher.resolve()),"type":"stdio","allowed_origins":["chrome-extension://"+ext_id+"/"]}
    MANIFEST_JSON.write_text(json.dumps(m,indent=2),encoding="utf-8"); print("[OK] Native manifest:",MANIFEST_JSON)
def register_windows():
    value=str(MANIFEST_JSON.resolve())
    keys=["HKCU\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\"+HOST_NAME,"HKCU\\SOFTWARE\\Chromium\\NativeMessagingHosts\\"+HOST_NAME,"HKCU\\SOFTWARE\\Microsoft\\Edge\\NativeMessagingHosts\\"+HOST_NAME,"HKCU\\SOFTWARE\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\"+HOST_NAME,"HKCU\\SOFTWARE\\Vivaldi\\NativeMessagingHosts\\"+HOST_NAME]
    ok=False
    for key in keys:
        rc=subprocess.call(["reg","add",key,"/ve","/t","REG_SZ","/d",value,"/f"],stdout=subprocess.DEVNULL)
        print(("[OK] Registered " if rc==0 else "[WARN] Could not register ")+key); ok=ok or rc==0
    return ok
def manifest_dirs_unix():
    home=Path.home()
    if is_macos():
        base=home/"Library"/"Application Support"
        return [base/"Google"/"Chrome"/"NativeMessagingHosts",base/"Chromium"/"NativeMessagingHosts",base/"Microsoft Edge"/"NativeMessagingHosts",base/"BraveSoftware"/"Brave-Browser"/"NativeMessagingHosts",base/"Vivaldi"/"NativeMessagingHosts"]
    return [home/".config"/"google-chrome"/"NativeMessagingHosts",home/".config"/"chromium"/"NativeMessagingHosts",home/".config"/"microsoft-edge"/"NativeMessagingHosts",home/".config"/"BraveSoftware"/"Brave-Browser"/"NativeMessagingHosts",home/".config"/"vivaldi"/"NativeMessagingHosts"]
def register_unix():
    ok=False
    for d in manifest_dirs_unix():
        try: d.mkdir(parents=True,exist_ok=True); shutil.copy2(MANIFEST_JSON,d/(HOST_NAME+".json")); print("[OK] Registered",d); ok=True
        except Exception as e: print("[WARN] Could not register",d,e)
    return ok
def diagnose():
    print("\n=== YT Bookmark Cleaner Diagnostics ===")
    print("OS:",platform.platform()); print("Python:",py_exe(),platform.python_version()); print("Folder:",APP_DIR); print("native_host.py:",HOST_PY.exists()); print("manifest:",MANIFEST_JSON.exists()); print("ffmpeg:",find_ffmpeg() or "NOT FOUND")
    for mod in ("yt_dlp","mutagen"):
        try: __import__(mod); print(mod+": OK")
        except Exception as e: print(mod+": MISSING",e)
def install(args):
    if not HOST_PY.exists(): print("[ERROR] native_host.py missing"); return 1
    ext=extension_id(args); print("[INFO] Extension ID:",ext); print("[INFO] Installing Python dependencies...")
    if not install_python_deps(): print("[WARN] Dependencies not fully installed now; native host will retry on first run.")
    try_install_ffmpeg_best_effort(); launcher=write_launchers(); write_manifest(ext,launcher); ok=register_windows() if is_windows() else register_unix(); diagnose()
    if not ok: print("[ERROR] Native messaging registration failed."); return 2
    print("\n[SUCCESS] Installed/registered. Restart browser or reload extension."); return 0
def main():
    p=argparse.ArgumentParser(); p.add_argument("--extension-id"); p.add_argument("--repair",action="store_true"); p.add_argument("--diagnose",action="store_true"); args=p.parse_args()
    if args.diagnose: diagnose(); return 0
    return install(args)
if __name__=="__main__": raise SystemExit(main())
