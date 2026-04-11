#!/usr/bin/env python3
"""
native_host.py — YT Bookmark Cleaner native messaging host
Bridges Chrome extension ↔ yt-dlp

INSTALL:
  1. Install yt-dlp:  pip install yt-dlp
  2. Make executable: chmod +x native_host.py
  3. Register the host (see README)
"""

import sys
import json
import struct
import os
import subprocess
import threading
import re


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
    """Check if a file with video_id already exists in output_path."""
    if not os.path.isdir(output_path):
        return False
    for f in os.listdir(output_path):
        if video_id in f:
            return True
    return False


def resolve_path(folder_name):
    """
    Given a folder name (e.g. 'Music'), find its absolute path.
    Searches common locations in order.
    Returns the path if found, otherwise returns a path inside the home dir.
    """
    home = os.path.expanduser("~")

    # Exact match search in common locations
    search_roots = [
        home,
        os.path.join(home, "Music"),
        os.path.join(home, "Downloads"),
        os.path.join(home, "Desktop"),
        os.path.join(home, "Documents"),
        "/media",
        "/mnt",
    ]

    # 1. If folder_name is already an absolute path, return it directly
    if os.path.isabs(folder_name) and os.path.isdir(folder_name):
        send_message({"type": "resolved_path", "path": folder_name})
        return

    # 2. Check if folder_name matches a known common folder directly
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

    # 3. Search one level deep in home and common roots
    for root in search_roots:
        candidate = os.path.join(root, folder_name)
        if os.path.isdir(candidate):
            send_message({"type": "resolved_path", "path": candidate})
            return

    # 4. Fallback: return home/folder_name (will be created by yt-dlp if needed)
    fallback = os.path.join(home, folder_name)
    send_message({"type": "resolved_path", "path": fallback})


def download(msg):
    url = msg.get("url", "")
    video_id = msg.get("videoId", "")
    title = msg.get("title", video_id)
    fmt = msg.get("format", "m4a")
    out_path = msg.get("outputPath", os.path.expanduser("~"))
    add_meta = msg.get("addMetadata", True)

    # Expand ~ in case the path comes through unexpanded
    out_path = os.path.expanduser(out_path)
    os.makedirs(out_path, exist_ok=True)

    # Skip if exists
    if check_exists(out_path, video_id):
        send_message({"type": "skipped", "videoId": video_id})
        return

    # Build yt-dlp command
    output_template = os.path.join(out_path, f"%(title)s [{video_id}].%(ext)s")

    cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--no-playlist",
        "--extract-audio",
        "--audio-format",
        fmt,
        "--audio-quality",
        "0",
        "--output",
        output_template,
        "--newline",
        "--progress",
    ]

    if add_meta:
        cmd += [
            "--add-metadata",
            "--parse-metadata",
            "webpage_url:%(comment)s",
        ]

    cmd.append(url)

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

        last_lines = []

        for line in proc.stdout:
            line = line.rstrip()
            if line:
                last_lines.append(line)
                if len(last_lines) > 12:
                    last_lines.pop(0)

            m = re.search(
                r"\[download\]\s+([\d.]+)%\s+of\s+([\d.]+\w+)\s+at\s+[\d.]+\w+/s\s+ETA\s+(\S+)",
                line,
            )
            if m:
                send_message(
                    {
                        "type": "progress",
                        "videoId": video_id,
                        "percent": float(m.group(1)),
                        "size": m.group(2),
                        "eta": m.group(3),
                    }
                )

        proc.wait()

        if proc.returncode == 0:
            send_message({"type": "done", "videoId": video_id})
        else:
            detail = last_lines[-1] if last_lines else ""
            send_message(
                {
                    "type": "error",
                    "videoId": video_id,
                    "error": f"yt-dlp exited with code {proc.returncode}: {detail}".strip(),
                }
            )

    except FileNotFoundError:
        send_message(
            {
                "type": "error",
                "videoId": video_id,
                "error": "yt-dlp not found. Install it with: pip install yt-dlp",
            }
        )
    except Exception as e:
        send_message({"type": "error", "videoId": video_id, "error": str(e)})


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

        elif action == "resolve_path":
            # Synchronous — fast, no thread needed
            resolve_path(msg.get("folderName", ""))


if __name__ == "__main__":
    main()
