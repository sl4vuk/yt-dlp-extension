#!/usr/bin/env python3
"""
native_host.py — YT Bookmark Cleaner native messaging host
Bridges Chrome extension ↔ yt-dlp
"""

import sys
import json
import struct
import os
import subprocess
import re
import glob
import webbrowser


ACTIVE_PROC = None
ACTIVE_VIDEO_ID = None
ACTIVE_OUTPUT_PATH = None

def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    length = struct.unpack("=I", raw_length)[0]
    return json.loads(sys.stdin.buffer.read(length))


def send_message(obj):
    encoded = json.dumps(obj).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def check_exists(output_path, video_id):
    """Check if a file with video_id already exists in output_path metadata comments."""
    if not os.path.isdir(output_path):
        return False

    try:
        from mutagen import File as MutagenFile
    except Exception:
        # fallback to filename heuristic when mutagen is unavailable
        for f in os.listdir(output_path):
            if f"[{video_id}]" in f or video_id in f:
                return True
        return False

    target_url = f"https://www.youtube.com/watch?v={video_id}"

    for f in os.listdir(output_path):
        full = os.path.join(output_path, f)
        if not os.path.isfile(full):
            continue
        try:
            audio = MutagenFile(full)
            if not audio or not audio.tags:
                continue

            comments = []
            if hasattr(audio.tags, "getall"):
                for frame in audio.tags.getall("COMM"):
                    text = getattr(frame, "text", [])
                    if isinstance(text, list):
                        comments.extend([str(x) for x in text])
                    elif text:
                        comments.append(str(text))
                for frame in audio.tags.getall("\xa9cmt"):
                    text = getattr(frame, "text", [])
                    if isinstance(text, list):
                        comments.extend([str(x) for x in text])
                    elif text:
                        comments.append(str(text))

            for key in ("comment", "comments", "\xa9cmt"):
                if key in audio.tags:
                    val = audio.tags.get(key)
                    if isinstance(val, list):
                        comments.extend([str(x) for x in val])
                    else:
                        comments.append(str(val))

            if any(target_url in c or video_id in c for c in comments):
                return True
        except Exception:
            continue

    return False


def write_source_comment(file_path, url, video_id):
    """Write source URL into Description/Comments metadata."""
    try:
        from mutagen import File as MutagenFile
        from mutagen.id3 import ID3, COMM, ID3NoHeaderError
        from mutagen.mp4 import MP4
    except Exception:
        return False, "mutagen not installed"

    try:
        audio = MutagenFile(file_path)
        if audio is None:
            return False, "unsupported audio format"

        comment = url or f"https://www.youtube.com/watch?v={video_id}"

        if isinstance(audio, MP4):
            if audio.tags is None:
                audio.add_tags()
            audio.tags["\xa9cmt"] = [comment]
            audio.save()
            return True, None

        # MP3 and other ID3 based files
        try:
            tags = ID3(file_path)
        except ID3NoHeaderError:
            tags = ID3()

        tags.delall("COMM")
        tags.add(COMM(encoding=3, lang="eng", desc="", text=comment))
        tags.save(file_path)
        return True, None

    except Exception as e:
        return False, str(e)


def resolve_path(folder_name):
    home = os.path.expanduser("~")
    search_roots = [
        home,
        os.path.join(home, "Music"),
        os.path.join(home, "Downloads"),
        os.path.join(home, "Desktop"),
        os.path.join(home, "Documents"),
        "/media",
        "/mnt",
    ]

    if os.path.isabs(folder_name) and os.path.isdir(folder_name):
        send_message({"type": "resolved_path", "path": folder_name})
        return

    well_known = {
        "music": os.path.join(home, "Music"),
        "downloads": os.path.join(home, "Downloads"),
        "desktop": os.path.join(home, "Desktop"),
        "documents": os.path.join(home, "Documents"),
        "home": home,
    }
    key = folder_name.lower()
    if key in well_known and os.path.isdir(well_known[key]):
        send_message({"type": "resolved_path", "path": well_known[key]})
        return

    for root in search_roots:
        candidate = os.path.join(root, folder_name)
        if os.path.isdir(candidate):
            send_message({"type": "resolved_path", "path": candidate})
            return

    fallback = os.path.join(home, folder_name)
    send_message({"type": "resolved_path", "path": fallback})


def cleanup_partial_files(output_path, video_id):
    if not output_path or not os.path.isdir(output_path):
        return

    patterns = [
        os.path.join(output_path, f"*{video_id}*.part"),
        os.path.join(output_path, f"*{video_id}*.ytdl"),
        os.path.join(output_path, f"*{video_id}*.temp"),
    ]

    for pattern in patterns:
        for path in glob.glob(pattern):
            try:
                os.remove(path)
            except Exception:
                pass


def cancel_active_download():
    global ACTIVE_PROC
    if ACTIVE_PROC and ACTIVE_PROC.poll() is None:
        try:
            ACTIVE_PROC.terminate()
        except Exception:
            try:
                ACTIVE_PROC.kill()
            except Exception:
                pass


def has_ffmpeg():
    for candidate in ("ffmpeg", "ffprobe"):
        try:
            subprocess.run([candidate, "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except FileNotFoundError:
            return False
    return True


def download(msg):
    url = msg.get("url", "")
    video_id = msg.get("videoId", "")
    title = msg.get("title", video_id)
    fmt = msg.get("format", "fast")
    out_path = os.path.expanduser(msg.get("outputPath", os.path.expanduser("~")))
    cookie_mode = msg.get("cookieMode", "off")

    os.makedirs(out_path, exist_ok=True)

    if check_exists(out_path, video_id):
        send_message({"type": "skipped", "videoId": video_id})
        return

    output_template = os.path.join(out_path, "%(title)s [%(id)s].%(ext)s")
    ffmpeg_ok = has_ffmpeg()

    cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--no-playlist",
        "--newline",
        "--progress",
        "--output",
        output_template,
    ]

    if fmt == "mp3" and ffmpeg_ok:
        cmd += ["--extract-audio", "--audio-format", "mp3", "--audio-quality", "0"]
    elif fmt == "fast":
        cmd += ["--format", "bestaudio/best"]
    else:
        cmd += ["--format", "bestaudio/best"]

    if cookie_mode == "browser":
        cmd += ["--cookies-from-browser", "chrome"]

    cmd.append(url)

    global ACTIVE_PROC, ACTIVE_VIDEO_ID, ACTIVE_OUTPUT_PATH

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="replace",
        )

        ACTIVE_PROC = proc
        ACTIVE_VIDEO_ID = video_id
        ACTIVE_OUTPUT_PATH = out_path

        last_lines = []
        downloaded_file = None

        for line in proc.stdout:
            line = line.rstrip()
            if line:
                last_lines.append(line)
                if len(last_lines) > 12:
                    last_lines.pop(0)

            dest = re.search(r"\[download\]\s+Destination:\s+(.+)$", line)
            if dest:
                downloaded_file = dest.group(1).strip()

            already = re.search(r"\[download\]\s+(.+)\s+has already been downloaded", line)
            if already and not downloaded_file:
                downloaded_file = already.group(1).strip()

            m = re.search(r"\[download\]\s+([\d.]+)%\s+of\s+([\d.]+\w+)\s+at\s+[\d.]+\w+/s\s+ETA\s+(\S+)", line)
            if m:
                send_message({
                    "type": "progress",
                    "videoId": video_id,
                    "percent": float(m.group(1)),
                    "size": m.group(2),
                    "eta": m.group(3),
                })

        proc.wait()

        if proc.returncode != 0:
            detail = last_lines[-1] if last_lines else ""
            cleanup_partial_files(out_path, video_id)
            cancelled = proc.returncode in (-15, 143) or "interrupted by user" in detail.lower()
            message = "Download cancelled" if cancelled else f"yt-dlp exited with code {proc.returncode}: {detail}".strip()
            send_message({
                "type": "error",
                "videoId": video_id,
                "error": message,
            })
            return

        meta_warn = None
        if downloaded_file and os.path.isfile(downloaded_file):
            ok, err = write_source_comment(downloaded_file, url, video_id)
            if not ok:
                meta_warn = err

        payload = {"type": "done", "videoId": video_id}
        if meta_warn:
            payload["warning"] = f"Downloaded, but comment metadata could not be written ({meta_warn})."
        if fmt == "mp3" and not ffmpeg_ok:
            payload["warning"] = "Downloaded without conversion: install ffmpeg to export true MP3."
        send_message(payload)

    except FileNotFoundError:
        cleanup_partial_files(out_path, video_id)
        send_message({
            "type": "error",
            "videoId": video_id,
            "error": "yt-dlp not found. Install it with: pip install yt-dlp",
        })
    except Exception as e:
        cleanup_partial_files(out_path, video_id)
        send_message({"type": "error", "videoId": video_id, "error": str(e)})
    finally:
        ACTIVE_PROC = None
        ACTIVE_VIDEO_ID = None
        ACTIVE_OUTPUT_PATH = None


def open_folder(folder_path):
    path = os.path.expanduser(folder_path or "")
    if not path or not os.path.isdir(path):
        send_message({"type": "open_folder_result", "ok": False, "error": "Folder not found"})
        return

    try:
        if sys.platform.startswith("win"):
            os.startfile(path)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])
        send_message({"type": "open_folder_result", "ok": True})
    except Exception as e:
        try:
            webbrowser.open(f"file://{path}")
            send_message({"type": "open_folder_result", "ok": True})
        except Exception:
            send_message({"type": "open_folder_result", "ok": False, "error": str(e)})


def main():
    while True:
        msg = read_message()
        if msg is None:
            break
        action = msg.get("action")

        if action == "download":
            download(msg)
        elif action == "resolve_path":
            resolve_path(msg.get("folderName", ""))
        elif action == "open_folder":
            open_folder(msg.get("folderPath", ""))
        elif action == "cancel":
            cancel_active_download()
            if ACTIVE_OUTPUT_PATH and ACTIVE_VIDEO_ID:
                cleanup_partial_files(ACTIVE_OUTPUT_PATH, ACTIVE_VIDEO_ID)


if __name__ == "__main__":
    main()
