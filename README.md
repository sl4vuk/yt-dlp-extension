# YT Bookmark Cleaner - Universal install guide

YT Bookmark Cleaner is a Chrome/Chromium extension that manages YouTube bookmarks and downloads audio/video through a local Native Messaging host.

The browser extension cannot download by itself. Chrome talks to `native_host.py`, and that Python host runs `yt-dlp`, `mutagen`, and `ffmpeg`.

## Quick install

### Windows 10/11

1. Extract the extension folder.
2. Double-click:

```bat
install_windows.bat
```

The installer will:

- Ignore broken Microsoft Store Python aliases.
- Install Python with `winget` when Python is missing.
- Try Python 3.12, 3.11, 3.10, then 3.8.
- Install `yt-dlp` and `mutagen` with pip.
- Install `ffmpeg` with `winget` if no bundled `ffmpeg.exe` exists.
- Copy bundled `ffmpeg.exe` into `bin\ffmpeg.exe` when available.
- Generate `native_host_launcher.bat`.
- Generate `com.ytbookmark.ytdlp.json` with the real folder path.
- Register Chrome, Edge, Chromium, Brave, and Vivaldi native messaging entries when possible.

After install, open:

```text
chrome://extensions
```

Then click **Reload** on YT Bookmark Cleaner.

### Windows 7 / 8 / 8.1

`winget` usually does not exist on these systems. The script will still try to install Python using the official Python installer fallback.

For old Windows, Python 3.8.x is the safest target. If automatic install fails, manually install Python 3.8.10 and enable:

```text
Add Python to PATH
```

Then run:

```bat
install_windows.bat
```

Important: Manifest V3 and `sidePanel` support depend on your browser version. Very old Chrome/Edge builds may not support the current extension APIs.

### macOS / Linux

Run:

```bash
chmod +x install_unix.sh
./install_unix.sh
```

The Unix installer will try to install missing tools with:

- macOS: Homebrew, when available.
- Debian/Ubuntu: `apt-get`.
- Fedora: `dnf`.
- CentOS/RHEL: `yum`.
- Arch: `pacman`.
- openSUSE: `zypper`.
- Alpine: `apk`.

It installs or verifies:

- Python 3.8+
- pip
- `yt-dlp`
- `mutagen`
- `ffmpeg`

## Manual repair

From the extension folder:

### Windows

```bat
py -3 install_universal.py --repair
```

If `py` is not available:

```bat
python install_universal.py --repair
```

### macOS / Linux

```bash
python3 install_universal.py --repair
```

## Diagnostics

### Windows

```bat
py -3 install_universal.py --diagnose
```

### macOS / Linux

```bash
python3 install_universal.py --diagnose
```

## Fixing `Python was not found`

If Windows prints:

```text
Python was not found; run without arguments to install from the Microsoft Store
```

that means Windows is launching the Microsoft Store alias, not real Python.

The new `install_windows.bat` avoids that alias by testing Python before using it. If the problem still appears, disable aliases here:

```text
Settings > Apps > Advanced app settings > App execution aliases
```

Turn off:

```text
python.exe
python3.exe
```

Then run `install_windows.bat` again.

## Fixing `Native host disconnected`

This usually means the native host path or extension ID is wrong.

Run:

```bat
install_windows.bat
```

or:

```bat
py -3 install_universal.py --repair
```

Then verify these files exist in the extension folder:

```text
native_host_launcher.bat
com.ytbookmark.ytdlp.json
```

Check the Chrome registry entry:

```bat
reg query HKCU\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.ytbookmark.ytdlp /ve
```

It should point to the current folder, not an old path like another user's Desktop or Downloads folder.

## Extension ID

The native host manifest must allow your extension ID.

To find it:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Copy the ID shown under YT Bookmark Cleaner.

Repair with a specific ID:

```bat
py -3 install_universal.py --extension-id YOUR_EXTENSION_ID --repair
```

Example:

```bat
py -3 install_universal.py --extension-id ilealfnjgomollhdmedilijpfepbkllp --repair
```

## Output folder

Type or paste a real full path in the extension, for example:

```text
C:\Users\YourName\Downloads\music
```

The browser file picker may not return full folder paths due to browser security restrictions.

## Included files

Required extension files:

```text
manifest.json
background.js
ui.html
ui.js
ui.css
settings.html
settings.js
settings.css
cleaner.js
i18n.js
native_host.py
install_universal.py
install_windows.bat
install_unix.sh
```

Optional but recommended on Windows:

```text
bin\ffmpeg.exe
```

If `ffmpeg.exe` is in the root folder, `install_windows.bat` copies it into `bin\ffmpeg.exe` automatically.

## What no installer can bypass

A browser extension cannot execute a local installer until the Native Messaging host has already been registered. This is a Chrome/Chromium security rule. Run the installer once manually; after that, the native host can diagnose and repair missing Python packages when reachable.
