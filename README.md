# YT Bookmark Cleaner v2

Dark/light, borderless, crimson-accented Chrome extension for managing YouTube bookmarks and downloading audio with yt-dlp.

---

## Features

- **Sync YT ↔ Music** — auto-creates the missing youtube.com or music.youtube.com bookmark for each video, deduplicating by video ID
- **Export** — TXT, CSV, Netscape HTML
- **Download with yt-dlp** — m4a (fast, default) or mp3, real progress bar, skips existing files, URL embedded in metadata
- **Auto-like (Ctrl+D)** — works on youtube.com and music.youtube.com
- **Dark / Light mode** — toggle in header, persisted
- **View modes** — Popup, Window, Tab
- All settings persisted in chrome.storage.local

---

## Extension Setup

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select this folder
4. Note your **Extension ID** (you'll need it for native messaging)

---

## Native Messaging Setup (required for download)

### 1. Install yt-dlp

```bash
pip install yt-dlp
# or
brew install yt-dlp
```

### 2. Edit the manifest

Open `native_host/com.ytbookmark.ytdlp.json` and:
- Replace `/ABSOLUTE/PATH/TO/native_host.py` with the real absolute path
- Replace `YOUR_EXTENSION_ID_HERE` with your actual extension ID

### 3. Make the host executable

```bash
chmod +x native_host/native_host.py
```

### 4. Register the native host

**macOS / Linux:**
```bash
# For Chrome:
cp native_host/com.ytbookmark.ytdlp.json \
   ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/   # macOS
   ~/.config/google-chrome/NativeMessagingHosts/                         # Linux
```

**Windows:**
Add the registry key:
```
HKEY_CURRENT_USER\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.ytbookmark.ytdlp
```
pointing to the absolute path of `com.ytbookmark.ytdlp.json`.

### 5. Reload the extension

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+F` | Open/close the extension UI |
| `Ctrl+D` | Auto-like current YouTube/Music video |

---

## File Naming

Downloaded files are named:
```
Song Title [VIDEO_ID].m4a
```
The video URL is embedded in the file's comment metadata tag.
Files are skipped if a file containing the video ID already exists in the output folder.

---

## Notes

- The **Sync** button only **adds** missing bookmarks — it never deletes
- **Undo** reverts the last sync operation
- Download requires the native host to be set up
