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
import tempfile

try:
    import msvcrt
    import os as _os
except Exception:
    msvcrt = None


ACTIVE_PROC = None
ACTIVE_VIDEO_ID = None
ACTIVE_OUTPUT_PATH = None


def configure_stdio_binary_mode():
    if not msvcrt:
        return
    try:
        msvcrt.setmode(sys.stdin.fileno(), _os.O_BINARY)
    except Exception:
        pass
    try:
        msvcrt.setmode(sys.stdout.fileno(), _os.O_BINARY)
    except Exception:
        pass

def read_message():
    try:
        raw_length = sys.stdin.buffer.read(4)
        if not raw_length or len(raw_length) < 4:
            return None
        length = struct.unpack("=I", raw_length)[0]
        payload = sys.stdin.buffer.read(length)
        if len(payload) < length:
            return None
        return json.loads(payload)
    except Exception:
        return None


def send_message(obj):
    try:
        encoded = json.dumps(obj).encode("utf-8")
        sys.stdout.buffer.write(struct.pack("=I", len(encoded)))
        sys.stdout.buffer.write(encoded)
        sys.stdout.buffer.flush()
        return True
    except (BrokenPipeError, OSError):
        return False


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
        # Filename heuristic: [videoId] in name
        if f"[{video_id}]" in f or video_id in f:
            return True
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

        # Write only the video ID into the comment tag, not the full URL
        comment = video_id

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


def build_output_template(folder, filename_template, delimiter, add_number, remove_emoji, title=None):
    """Build yt-dlp output template string from settings."""
    TEMPLATES = {
        'title':                           '%(title)s [%(id)s].%(ext)s',
        'artist-title':                    '%(artist)s%(delimiter)s%(title)s [%(id)s].%(ext)s',
        'title-artist':                    '%(title)s%(delimiter)s%(artist)s [%(id)s].%(ext)s',
        'date-artist-title':               '%(upload_date)s%(delimiter)s%(artist)s%(delimiter)s%(title)s [%(id)s].%(ext)s',
        'date-title':                      '%(upload_date)s%(delimiter)s%(title)s [%(id)s].%(ext)s',
        'date-playlist-artist-title':      '%(upload_date)s%(delimiter)s%(playlist_title)s%(delimiter)s%(artist)s%(delimiter)s%(title)s [%(id)s].%(ext)s',
        'bullet-title':                    '• %(title)s [%(id)s].%(ext)s',
        'video-title':                     '%(title)s [%(id)s].%(ext)s',
        'uploader-video-title':            '%(uploader)s%(delimiter)s%(title)s [%(id)s].%(ext)s',
        'uploader-date-video-title':       '%(uploader)s%(delimiter)s%(upload_date)s%(delimiter)s%(title)s [%(id)s].%(ext)s',
        'date-video-title':                '%(upload_date)s%(delimiter)s%(title)s [%(id)s].%(ext)s',
        'date-playlist-video-title':       '%(upload_date)s%(delimiter)s%(playlist_title)s%(delimiter)s%(title)s [%(id)s].%(ext)s',
        'date-uploader-video-title':       '%(upload_date)s%(delimiter)s%(uploader)s%(delimiter)s%(title)s [%(id)s].%(ext)s',
    }
    tpl = TEMPLATES.get(filename_template, '%(title)s [%(id)s].%(ext)s')
    # Substitute delimiter placeholder
    tpl = tpl.replace('%(delimiter)s', re.escape(delimiter or ' - ').replace('\\', ''))
    if add_number:
        tpl = '%(playlist_index)s. ' + tpl
    return os.path.join(folder, tpl)


def download(msg):
    url         = msg.get("url", "")
    video_id    = msg.get("videoId", "")
    title       = msg.get("title", video_id)
    fmt         = msg.get("format", "fast")
    out_path    = os.path.expanduser(msg.get("outputPath", os.path.expanduser("~")))
    cookie_mode = msg.get("cookieMode", "off")
    cookie_text = msg.get("cookieText", "")

    # ── Settings from extension ──────────────────────────────────
    safe_mode        = msg.get("safeMode", True)
    proxy_type       = msg.get("proxyType", "none")
    proxy_address    = msg.get("proxyAddress", "")
    proxy_port       = msg.get("proxyPort", "")
    proxy_user       = msg.get("proxyUsername", "")
    proxy_pass       = msg.get("proxyPassword", "")
    skip_if_exists   = msg.get("skipIfExists", False)
    # Tags
    tags_enabled     = msg.get("tagsEnabled", True)
    tag_year_mode    = msg.get("tagYearMode", "dont-write")
    tag_album_artist = msg.get("tagAlbumArtist", "")
    tag_comment_mode = msg.get("tagCommentMode", "id-in-comment")
    tag_custom_cmt   = msg.get("tagCustomComment", "")
    tag_artwork      = msg.get("tagArtwork", "yes")
    tag_extraction   = msg.get("tagExtraction", "artist-title")
    tag_write_explicit = msg.get("tagWriteExplicit", False)
    tag_search_desc  = msg.get("tagSearchDesc", False)
    tag_use_uploader = msg.get("tagUseUploader", True)
    tag_remove_quotes= msg.get("tagRemoveQuotes", False)
    tag_remove_emoji = msg.get("tagRemoveEmoji", False)
    tag_save_thumb   = msg.get("tagSaveThumbnail", False)
    tag_track_pos    = msg.get("tagTrackPos", False)
    tag_playlist_album = msg.get("tagPlaylistAlbum", False)
    # Output / filename
    delimiter        = msg.get("outputDelimiter", " - ")
    add_number       = msg.get("outputAddNumber", False)
    remove_emoji_fn  = msg.get("outputRemoveEmoji", False)
    filename_tpl     = msg.get("filenameTemplate", "artist-title")
    audio_bitrate    = msg.get("audioBitrate", "192")
    audio_samplerate = msg.get("audioSampleRate", "44100")

    os.makedirs(out_path, exist_ok=True)

    if check_exists(out_path, video_id):
        send_message({"type": "skipped", "videoId": video_id})
        return

    ffmpeg_ok = has_ffmpeg()

    output_template = build_output_template(
        out_path, filename_tpl, delimiter, add_number, remove_emoji_fn
    )

    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--no-playlist",
        "--newline",
        "--progress",
        "--output", output_template,
    ]

    # ── Skip if already downloaded ───────────────────────────────
    if skip_if_exists:
        cmd.append("--no-overwrites")

    # ── Proxy ────────────────────────────────────────────────────
    if proxy_type and proxy_type != "none" and proxy_address:
        port_part = f":{proxy_port}" if proxy_port else ""
        auth_part = ""
        if proxy_user:
            auth_part = f"{proxy_user}:{proxy_pass}@" if proxy_pass else f"{proxy_user}@"
        proxy_url = f"{proxy_type}://{auth_part}{proxy_address}{port_part}"
        cmd += ["--proxy", proxy_url]

    # ── Safe mode ────────────────────────────────────────────────
    if safe_mode:
        cmd += ["--sleep-interval", "1", "--max-sleep-interval", "5"]

    # ── Format / conversion ──────────────────────────────────────
    if fmt == "mp3":
        if ffmpeg_ok:
            cmd += ["--extract-audio", "--audio-format", "mp3",
                    "--audio-quality", f"{audio_bitrate}k",
                    "--postprocessor-args", f"ffmpeg:-ar {audio_samplerate}"]
        else:
            cmd += ["--format", "bestaudio/best"]
    elif fmt == "ogg":
        if ffmpeg_ok:
            cmd += ["--extract-audio", "--audio-format", "vorbis",
                    "--audio-quality", "5",
                    "--postprocessor-args", f"ffmpeg:-ar {audio_samplerate}"]
        else:
            cmd += ["--format", "bestaudio/best"]
    elif fmt == "wav":
        if ffmpeg_ok:
            cmd += ["--extract-audio", "--audio-format", "wav",
                    "--postprocessor-args", f"ffmpeg:-ar {audio_samplerate}"]
        else:
            cmd += ["--format", "bestaudio/best"]
    elif fmt in ("m4a", "original-m4a"):
        cmd += ["--format", "bestaudio[ext=m4a]/bestaudio"]
    elif fmt == "mp4":
        cmd += ["--format", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"]
    elif fmt == "webm":
        cmd += ["--format", "bestvideo[ext=webm]+bestaudio[ext=webm]/best[ext=webm]/best"]
    elif fmt == "flv":
        cmd += ["--format", "bestvideo[ext=flv]+bestaudio/best"]
    else:
        cmd += ["--format", "bestaudio/best"]

    # ── Tags / Metadata ──────────────────────────────────────────
    if tags_enabled:
        cmd.append("--add-metadata")
        cmd.append("--embed-metadata")

        # Artwork
        if tag_artwork != "no" and ffmpeg_ok:
            cmd.append("--embed-thumbnail")
            if tag_artwork in ("cropped-square", "inscribed-square", "cropped-480", "inscribed-480"):
                vf_map = {
                    "cropped-square":  "crop=min(iw,ih):min(iw,ih)",
                    "inscribed-square":"pad=max(iw,ih):max(iw,ih):(ow-iw)/2:(oh-ih)/2",
                    "cropped-480":     "crop=min(iw,ih):min(iw,ih),scale=480:480",
                    "inscribed-480":   "pad=max(iw,ih):max(iw,ih):(ow-iw)/2:(oh-ih)/2,scale=480:480",
                }
                vf = vf_map.get(tag_artwork, "")
                if vf:
                    cmd += ["--ppa", f"ThumbnailsConvertor+ffmpeg_o:-vf {vf}"]

        # Save separate thumbnail
        if tag_save_thumb:
            cmd.append("--write-thumbnail")

        # Year tag
        if tag_year_mode == "upload-date":
            cmd += ["--parse-metadata", "upload_date:%(date)s"]
        elif tag_year_mode == "current-year":
            import datetime
            yr = str(datetime.datetime.now().year)
            cmd += ["--parse-metadata", f"{yr}:%(date)s"]

        # Comment field
        if tag_comment_mode == "id-in-comment":
            # Write only the video ID (e.g. knXcQ1ubezU), not the full URL
            cmd += ["--parse-metadata", f"%(id)s:%(comment)s"]
        elif tag_comment_mode == "video-link":
            cmd += ["--parse-metadata", "%(webpage_url)s:%(comment)s"]
        elif tag_comment_mode == "description":
            cmd += ["--parse-metadata", "%(description)s:%(comment)s"]
        elif tag_comment_mode == "custom" and tag_custom_cmt:
            cmd += ["--parse-metadata", f"{tag_custom_cmt}:%(comment)s"]
        # dont-write: do nothing

        # Album artist
        if tag_album_artist:
            cmd += ["--parse-metadata", f"{tag_album_artist}:%(album_artist)s"]

        # Tag extraction mode
        if tag_extraction == "artist-title":
            cmd += ["--parse-metadata", "%(title)s:%(artist)s - %(title)s"]
        elif tag_extraction == "title":
            cmd += ["--parse-metadata", "%(title)s:%(title)s"]
        # regex: user would need custom config, skip for now

        # Uploader fallback
        if tag_use_uploader:
            cmd += ["--parse-metadata", "%(uploader)s:%(artist)s"]

        # Track position in playlist
        if tag_track_pos:
            cmd += ["--parse-metadata", "%(playlist_index)s:%(track_number)s"]

        # Playlist as album
        if tag_playlist_album:
            cmd += ["--parse-metadata", "%(playlist_title)s:%(album)s"]

        # Remove emoji from metadata
        if tag_remove_emoji:
            cmd += ["--replace-in-metadata", "title,artist,album", r"[^\x00-\x7F]+", ""]

    # Restrict filenames to ASCII-safe if removing emoji
    if remove_emoji_fn:
        cmd.append("--restrict-filenames")

    # ── Cookies ─────────────────────────────────────────────────
    cookie_file = None
    if cookie_mode == "browser":
        cmd += ["--cookies-from-browser", "chrome"]
    elif cookie_mode == "manual" and cookie_text.strip():
        temp = tempfile.NamedTemporaryFile(delete=False, suffix=".txt", mode="w", encoding="utf-8")
        temp.write(cookie_text)
        temp.close()
        cookie_file = temp.name
        cmd += ["--cookies", cookie_file]

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
            send_message({"type": "error", "videoId": video_id, "error": message})
            return

        # Write source URL as comment (fallback via mutagen)
        meta_warn = None
        if downloaded_file and os.path.isfile(downloaded_file):
            if tag_comment_mode == "id-in-comment":
                ok, err = write_source_comment(downloaded_file, url, video_id)
                if not ok:
                    meta_warn = err

        payload = {"type": "done", "videoId": video_id}
        if meta_warn:
            payload["warning"] = f"Downloaded, but comment metadata could not be written ({meta_warn})."
        if fmt in ("mp3", "ogg", "wav") and not ffmpeg_ok:
            payload["warning"] = f"Downloaded without conversion: install ffmpeg to export true {fmt.upper()}."
        send_message(payload)

    except FileNotFoundError:
        cleanup_partial_files(out_path, video_id)
        send_message({"type": "error", "videoId": video_id, "error": "yt-dlp not found. Install it with: pip install yt-dlp"})
    except Exception as e:
        cleanup_partial_files(out_path, video_id)
        send_message({"type": "error", "videoId": video_id, "error": str(e)})
    finally:
        if cookie_file:
            try:
                os.remove(cookie_file)
            except Exception:
                pass
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
    configure_stdio_binary_mode()
    main()
