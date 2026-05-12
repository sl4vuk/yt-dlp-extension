<div align="center">

# 🎧 YT Bookmark Cleaner

### Clean, sync, export, and download your YouTube / YouTube Music bookmarks with `yt-dlp`.

<p>
  <img alt="Manifest V3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white">
  <img alt="yt-dlp" src="https://img.shields.io/badge/powered%20by-yt--dlp-111111?style=for-the-badge">
  <img alt="License GPLv3" src="https://img.shields.io/badge/license-GPL--3.0-d50531?style=for-the-badge">
</p>

**A lightweight Chrome extension for people who save music as bookmarks and want one clean place to manage it.**

</div>

---

## ✨ Features

- **Sync YouTube ↔ YouTube Music** — creates the missing YouTube or YouTube Music bookmark for the same video ID.
- **Clean duplicates** — keeps your bookmark folder organized by video ID.
- **Download with `yt-dlp`** — downloads audio or video through a local native host.
- **Audio and video modes** — supports common formats such as MP3, M4A, OGG, WAV, MP4, and WebM depending on availability.
- **Metadata support** — uses `mutagen` when available to write useful audio metadata.
- **Export tools** — export bookmarks as TXT, CSV, or Netscape HTML.
- **Modern UI** — dark/light theme, popup/sidebar/tab modes, queue, progress log, and settings.

---

## 🚀 Quick Start

### 1. Download or clone

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
cd YOUR_REPOSITORY
```

Or download the ZIP from GitHub and extract it.

### 2. Load the extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project folder
5. Copy the extension ID shown by the browser

> Chromium-based browsers are supported when they support Manifest V3 and Native Messaging.

### 3. Install the native host

The native host is required for downloads. It lets the browser extension talk to Python, `yt-dlp`, and `ffmpeg`.

#### Windows

Double-click:

```bat
install_windows.bat
```

The installer will try to:

- Find a real Python installation
- Install Python with `winget` when possible
- Install or upgrade `yt-dlp`
- Install or locate `ffmpeg`
- Generate the native host manifest
- Register the host for Chrome / Chromium / Edge / Brave / Vivaldi when possible

If Windows opens Microsoft Store instead of Python, disable the fake aliases:

```text
Settings > Apps > Advanced app settings > App execution aliases
```

Turn off:

```text
python.exe
python3.exe
```

Then run `install_windows.bat` again.

#### macOS / Linux

```bash
chmod +x install_unix.sh
./install_unix.sh
```

The script will try to use common package managers such as Homebrew, apt, dnf, yum, pacman, zypper, or apk when available.

---

## 🛠️ Repair / Diagnose

Run these from the project folder:

```bash
python install_universal.py --diagnose
python install_universal.py --repair
```

On Windows:

```bat
py install_universal.py --diagnose
py install_universal.py --repair
```

Use repair when you see:

```text
Native host disconnected
Native host not responding
ffmpeg not found
yt-dlp not found
```

---

## 📁 Generated local files

These files are created locally by the installer and should **not** be committed:

```text
com.ytbookmark.ytdlp.json
native_host_launcher.bat
ffmpeg.exe
bin/
file/
```

They are machine-specific, binary, or local user data.

---

## ⚙️ Output folder

Because browsers cannot reliably return full local paths from file pickers, type or paste your output folder manually:

```text
C:\Users\YourName\Downloads\Music
C:\Users\YourName\Music
/home/yourname/Music
/Users/yourname/Music
```

---

## 🧩 Project structure

```text
background.js             Extension service worker
cleaner.js                YouTube page helper / URL cleaner
i18n.js                   UI translation helper
manifest.json             Chrome extension manifest
native_host.py            Native messaging host
install_universal.py      Cross-platform installer / repair script
install_windows.bat       Windows bootstrap installer
install_unix.sh           macOS / Linux bootstrap installer
ui.html / ui.js / ui.css  Main extension UI
settings.*                Settings page
icons/                    Extension icons
```

---

## ❓ Troubleshooting

### `Python was not found`

On Windows, this often means the Microsoft Store alias is enabled but real Python is not installed.

Run:

```bat
install_windows.bat
```

If it still fails, disable `python.exe` and `python3.exe` in App execution aliases.

### `ffmpeg not found`

Run:

```bash
python install_universal.py --repair
```

On Windows, the installer can use `winget` to install ffmpeg. If you have a local `ffmpeg.exe`, place it in either:

```text
ffmpeg.exe
bin/ffmpeg.exe
```

### `Native host disconnected`

Run:

```bash
python install_universal.py --repair
```

Then reload the extension at `chrome://extensions`.

If the extension ID changed, run repair again so the generated native host manifest allows the correct ID.

---

## 🤝 Contributing

Contributions are welcome.

Before opening a pull request, please read:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

Good contributions include installer reliability improvements, better error messages, cross-platform fixes, UI/UX improvements, and documentation updates.

---

## 📜 License

This project is licensed under the **GNU General Public License v3.0**.

See [LICENSE](LICENSE).

---

## 🙏 Credits

YT Bookmark Cleaner uses and integrates with:

- [`yt-dlp`](https://github.com/yt-dlp/yt-dlp)
- [`ffmpeg`](https://ffmpeg.org/)
- [`mutagen`](https://github.com/quodlibet/mutagen)
- Chrome Native Messaging

This project is not affiliated with YouTube, Google, Chrome, `yt-dlp`, or `ffmpeg`.

<div align="right">

[⬆ Back to top](#-yt-bookmark-cleaner)

</div>
