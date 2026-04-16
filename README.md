# YT Bookmark Cleaner v2.4

Dark/light, borderless, crimson-accented Chrome extension for managing YouTube bookmarks and downloading audio with yt-dlp.

---

## Features

- **Sync YT ↔ Music** — auto-creates the missing youtube.com or music.youtube.com bookmark for each video, deduplicating by video ID
- **Export** — TXT, CSV, Netscape HTML
- **Download with yt-dlp** — m4a (fast, default) or mp3, real progress bar, skips existing files, URL embedded in metadata
- **Dark / Light mode** — toggle in header, persisted
- **View modes** — Popup, Window, Tab
- All settings persisted in chrome.storage.local

---

## Extension Setup

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked** → select this folder
4. Note your **Extension ID** — you'll need it in the next step  
   *(looks like `abcdefghijklmnopqrstuvwxyz123456`)*

---

## Download Setup (Native Host — required for yt-dlp)

Downloads require a small Python script (`native_host.py`) that Chrome talks to in the background. Without it, the Download button does nothing.

---

### Windows (easiest — use the installer)

**Step 1 — Install Python** (if you don't have it)  
Download from https://www.python.org/downloads/  
⚠️ Check **"Add Python to PATH"** during installation.

**Step 2 — Run the installer**  
Double-click `install_windows.bat` in this folder.  
It will:
- Install `yt-dlp` automatically
- Ask you to paste your Extension ID
- Write and register everything Chrome needs

**Step 3 — Reload the extension**  
Go to `chrome://extensions` and click the 🔄 reload button on YT Bookmark Cleaner.

**Step 4 — Set the output folder**  
In the extension, type or paste your full output path into the **Output folder** box, e.g.:
```
C:\Users\YourName\Downloads\music
```
The path is saved automatically — you only need to type it once.

---

### macOS

```bash
# 1. Install yt-dlp
pip install yt-dlp
# or: brew install yt-dlp

# 2. Make host executable
chmod +x native_host.py

# 3. Edit com.ytbookmark.ytdlp.json:
#    - Replace /ABSOLUTE/PATH/TO/native_host.py with the real path (use: pwd)
#    - Replace YOUR_EXTENSION_ID_HERE with your actual Extension ID

# 4. Register
cp com.ytbookmark.ytdlp.json \
   ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/

# 5. Reload extension at chrome://extensions
```

---

### Linux

```bash
# 1. Install yt-dlp
pip install yt-dlp

# 2. Make host executable
chmod +x native_host.py

# 3. Edit com.ytbookmark.ytdlp.json:
#    - Replace /ABSOLUTE/PATH/TO/native_host.py with the real path (use: pwd)
#    - Replace YOUR_EXTENSION_ID_HERE with your actual Extension ID

# 4. Register
mkdir -p ~/.config/google-chrome/NativeMessagingHosts/
cp com.ytbookmark.ytdlp.json \
   ~/.config/google-chrome/NativeMessagingHosts/

# 5. Reload extension at chrome://extensions
```

---

## Setting the Output Folder

Due to browser security restrictions, the file picker **cannot return the full path** on Windows. Instead, type or paste the full path directly into the **Output folder** box:

```
C:\Users\YourName\Downloads\music
C:\Users\YourName\Music
```

The path is saved automatically and remembered every time you open the extension.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+F` | Activate the extension |
| `Alt+F` | Download current YouTube / YT Music video with yt-dlp |

---

## File Naming

Downloaded files are named:
```
Song Title [VIDEO_ID].m4a
```
The video URL is embedded in the file's comment metadata tag.  
Files are skipped automatically if a file with that video ID already exists in the output folder.

---

## Notes

- The **Sync** button only **adds** missing bookmarks — it never deletes
- **Undo** reverts the last sync operation
- Download requires the native host to be set up (see above)
- If downloads show "Native host not responding", re-run `install_windows.bat` and reload the extension
