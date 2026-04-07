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
    length = struct.unpack('=I', raw_length)[0]
    return json.loads(sys.stdin.buffer.read(length))

def send_message(obj):
    encoded = json.dumps(obj).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('=I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()

def check_exists(output_path, video_id, fmt):
    """Check if file with video_id already exists in output_path."""
    if not os.path.isdir(output_path):
        return False
    for f in os.listdir(output_path):
        if video_id in f:
            return True
    return False

def download(msg):
    url       = msg.get('url', '')
    video_id  = msg.get('videoId', '')
    title     = msg.get('title', video_id)
    fmt       = msg.get('format', 'm4a')
    out_path  = msg.get('outputPath', os.path.expanduser('~'))
    add_meta  = msg.get('addMetadata', True)

    # Skip if exists
    if check_exists(out_path, video_id, fmt):
        send_message({'type': 'skipped', 'videoId': video_id})
        return

    # Build yt-dlp command
    output_template = os.path.join(out_path, f'%(title)s [{video_id}].%(ext)s')

    cmd = [
        'yt-dlp',
        '--no-playlist',
        '--extract-audio',
        '--audio-format', fmt,
        '--audio-quality', '0',
        '--output', output_template,
        '--newline',         # one line per progress update
        '--progress',
    ]

    if add_meta:
        cmd += [
            '--add-metadata',
            '--embed-thumbnail',
            '--parse-metadata', f'webpage_url:%(comment)s',  # embed URL in comment tag
        ]

    cmd.append(url)

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )

        for line in proc.stdout:
            line = line.strip()
            # Parse progress line: [download]  72.3% of 4.12MiB at  1.23MiB/s ETA 00:01
            m = re.search(
                r'\[download\]\s+([\d.]+)%\s+of\s+([\d.]+\w+)\s+at\s+[\d.]+\w+/s\s+ETA\s+(\S+)',
                line
            )
            if m:
                send_message({
                    'type': 'progress',
                    'videoId': video_id,
                    'percent': float(m.group(1)),
                    'size': m.group(2),
                    'eta': m.group(3)
                })

        proc.wait()

        if proc.returncode == 0:
            send_message({'type': 'done', 'videoId': video_id})
        else:
            send_message({'type': 'error', 'videoId': video_id, 'error': 'yt-dlp exited with error'})

    except FileNotFoundError:
        send_message({'type': 'error', 'videoId': video_id, 'error': 'yt-dlp not found. Install it with: pip install yt-dlp'})
    except Exception as e:
        send_message({'type': 'error', 'videoId': video_id, 'error': str(e)})


def main():
    while True:
        msg = read_message()
        if msg is None:
            break
        action = msg.get('action')
        if action == 'download':
            t = threading.Thread(target=download, args=(msg,), daemon=True)
            t.start()
            t.join()  # sequential downloads

if __name__ == '__main__':
    main()
