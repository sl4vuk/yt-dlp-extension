# Changelog

All notable changes to **YT Bookmark Cleaner** will be documented in this file.

The format is inspired by [Keep a Changelog](https://keepachangelog.com/), and this project aims to follow semantic versioning when releases are published.

---

## [Unreleased]

### Added

- Universal installer flow using `install_universal.py`.
- Windows bootstrap installer using `winget` where available.
- macOS / Linux bootstrap installer using common package managers where available.
- Native host repair and diagnosis commands.
- `.gitignore` rules for generated native host files and local binaries.
- Project documentation files:
  - `README.md`
  - `CONTRIBUTING.md`
  - `CODE_OF_CONDUCT.md`
  - `LICENSE`
  - `CHANGELOG.md`

### Changed

- README simplified and reorganized for easier installation.
- Native host setup documentation now focuses on repair and generated files.
- Repository cleanup removes machine-specific files from version control.

### Fixed

- Prevent committing machine-specific native host manifest paths.
- Prevent committing local `ffmpeg` binaries.
- Clarify how to fix Windows Microsoft Store Python alias issues.

---

## [2.6] - Initial public structure

### Added

- Chrome extension UI.
- Settings page.
- Bookmark sync and cleanup tools.
- Native messaging host bridge.
- `yt-dlp` download support.
