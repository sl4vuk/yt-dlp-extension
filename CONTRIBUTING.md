# Contributing

Thanks for wanting to improve **YT Bookmark Cleaner**.

This project is a Chrome / Chromium extension that uses a Python native host to call tools like `yt-dlp`, `ffmpeg`, and `mutagen`. The best contributions are reliable, simple, and easy to test on real machines.

---

## Before opening an issue

Please check existing issues first. If your issue is new, include enough detail to reproduce it.

For bug reports, include:

- Operating system and version
- Browser name and version
- Extension version or commit hash
- The exact error message
- Steps to reproduce
- Whether `install_windows.bat`, `install_unix.sh`, or `install_universal.py --repair` was used
- Output from:

```bash
python install_universal.py --diagnose
```

On Windows:

```bat
py install_universal.py --diagnose
```

---

## Feature requests

Feature requests are welcome, but please keep the project focused:

- Bookmark cleanup
- YouTube / YouTube Music bookmark syncing
- Exporting bookmark data
- Reliable `yt-dlp` downloads
- Native host installation and repair
- Clear UI and simple settings

Features that require unsupported `yt-dlp` behavior may be declined.

---

## Pull requests

Before submitting a large pull request:

1. Open an issue or comment on an existing one.
2. Explain the change you want to make.
3. Keep the pull request focused on one problem.
4. Avoid adding generated files or machine-specific files.

Do not commit:

```text
com.ytbookmark.ytdlp.json
native_host_launcher.bat
ffmpeg.exe
bin/
file/
__pycache__/
```

---

## Development setup

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
cd YOUR_REPOSITORY
python install_universal.py --repair
```

Windows:

```bat
install_windows.bat
```

macOS / Linux:

```bash
chmod +x install_unix.sh
./install_unix.sh
```

Load the extension from `chrome://extensions` using **Load unpacked**.

---

## Code style

Keep code simple and readable.

For JavaScript:

- Use clear function names.
- Prefer small helpers over large blocks.
- Keep browser APIs guarded where compatibility may vary.
- Avoid unnecessary dependencies.

For Python:

- Prefer standard library where possible.
- Keep installer behavior explicit.
- Print useful error messages.
- Never silently fail when a user action is required.

For shell / batch scripts:

- Keep them as bootstrap scripts only.
- Put real logic in `install_universal.py` when possible.
- Avoid hardcoded user paths.

---

## Testing checklist

Before submitting a PR:

- Load the unpacked extension
- Run installer or repair script
- Verify native host manifest is generated
- Verify `yt-dlp` is available
- Verify `ffmpeg` is available or bundled
- Reload the extension
- Try a small download
- Check that generated files remain ignored by Git

---

## Community

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
