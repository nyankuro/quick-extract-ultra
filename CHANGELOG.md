# Quick Extract Ultra Changelog

Version notes are required for every future app change. Each release should record:

- Version number and date.
- User-facing changes.
- Bugs or confusing behavior found.
- Fix approach.
- Verification performed.
- Package or shortcut changes, if any.

## 2.0.1 - 2026-10-21

### Fixed

- Right-click extraction was slow (about 3.3 s per file instead of 0.4 s) and sometimes failed. Cause: the menu pointed at the single-file portable exe, which unpacks the whole app on every launch, and Explorer starts one launch per selected file. Commands arriving while a batch ran could also start a second batch ("already running"). The portable build is now a zip (instant start), the menu refuses to register from a self-extracting exe, the menu re-registers itself to the running copy at startup, and Explorer commands run one after another in a queue (same-action requests are merged).
- Archive picker layout: in the extra large view icons could spill over names and dates in some folders. The CSS also contained a duplicated block. Tiles now size to their content (`grid-auto-rows: max-content`, grid tiles).

### Added

- Choose where to extract: "Save to" control on the Extract tab (default: next to each archive; × resets), works with Main folder. Browse archive shows its destination with a Change button. New Explorer item "Extract files... (choose folder)".
- Archive picker "View" menu like Windows Explorer: extra large, large, medium, small icons, list, details (sortable columns: name, date modified, type, size) and tiles. View and sort are remembered.

### Verified

- `npm run typecheck`; `npm test` 29/29 (new: chosen destination with and without Main folder, relative destination rejected; registry entries include `extract-to`).
- `npm run test:ui` passes, now also sending three Explorer extract commands in quick succession and checking all three finish without errors.
- `scripts/picker-preview.cjs` renders every picker view at 1040x720, 1280x800 and 1920x1080 with 32 entries and checks that no icon or text leaves its tile.
- Timing on this machine: installed build extracts via right-click in 0.4 s; the old portable exe took 3.3 s.

### Package

- `npm run dist` writes `QuickExtractUltra-Setup-2.0.1.exe` and `QuickExtractUltra-Portable-2.0.1-win-x64.zip` (replaces the self-extracting portable exe).

## 2.0.0 - 2026-10-21 (Quick Extract Ultra)

First release under the new name. Copied from Quick Extract 1.0.2; the original app folder is unchanged.

### Added

- Interface in English (default), Japanese and Vietnamese with a switcher in the top bar and in Settings. Translations live in `locales/*.json` and are shared by the window and the main process.
- Tabs: Extract, Compress, Browse archive, Test & checksums.
- Compress: 7Z, ZIP, TAR, TAR.GZ, TAR.XZ, TAR.BZ2; six levels; AES-256 passwords; hidden file names (7Z); split volumes. Built in a staging folder and renamed into place; never overwrites (`name (1).7z`).
- Browse archive: folder navigation, search, sizes/dates, encrypted markers, extract selected entries or all, test, password prompt.
- Test archives and checksums (CRC32, MD5, SHA-1, SHA-256, SHA-512) with copy and compare.
- Smart extraction (single top-level item is published directly; collisions get `(1)`).
- About 30 readable formats (TAR, GZ, XZ, ISO, CAB, WIM, ...). `.tar.gz` style archives unpack the inner TAR automatically. Multi-volume sets are opened through their first part.
- Explorer right-click menu (opt-in, per user, HKCU only): Open, Extract here (smart), Extract to folder, Test, Add to archive, Add to ZIP/7Z, Calculate checksums. Single-instance app collects multi-file selections. Removed when the setting is turned off or the app is uninstalled.
- Drag and drop on every tab; "Open with" support for archive paths.
- Settings: open folder after extracting, keep Mark-of-the-Web (on by default, 7-Zip `-snz`), move archives to Recycle Bin after success (off by default; volume sets together).
- Installer (NSIS, per user) and portable exe; GitHub Actions workflow builds releases from `v*` tags.
- English/Japanese/Vietnamese READMEs, MIT license, third-party notices, issue templates, funding placeholders.

### Fixed / found

- 7-Zip treats `@listfile` after `--` as a literal name; list files are now passed without `--` (all paths are absolute).
- 7-Zip rejects non-ASCII ZIP passwords ("The parameter is incorrect"); the app now explains this and suggests 7Z.
- The packaged app only ships the Windows 7-Zip binaries and runtime dependencies (installer 106 MB instead of 131 MB).

### Verified

- `npm run typecheck` and `npm run build` pass.
- `npm test`: 28/28 (17 original extraction checks + 11 new: formats, 7Z/ZIP/TAR.GZ/split round trips, smart mode, partial extraction, corruption test, checksums vs Node crypto, Mark-of-the-Web, settings, registry script and an isolated registry round trip under `HKCU\Software\QuickExtractUltraTest`).
- `npm run test:ui`: original picker/password flow plus Explorer commands (add-7z, open, hash, extract-here) and language switching; screenshots saved to `docs/screenshots/`.
- Packaged `win-unpacked` exe extracted an archive via `--qe-action=extract-here`.

### Package

- `npm run dist` writes `dist/QuickExtractUltra-Setup-2.0.0.exe` and `dist/QuickExtractUltra-Portable-2.0.0.exe`. `npm run package` creates a "Quick Extract Ultra" Desktop shortcut and does not touch the original "Quick Extract" shortcut.

## 1.0.2 - 2026-10-06

### Changed

- Choose files now opens an app-owned archive picker with extra large icons and Date modified descending on every open, navigation, and refresh.
- Added folder navigation, editable folder path, parent folder, refresh, Ctrl multi-select, Shift range selection, and double-click to open folders or select an archive.
- Open folder applies extra large icons (256 px), Date modified descending, and no grouping to the opened Explorer folder through the Windows Shell API. This does not change global Windows defaults.

### Verified

- Passed TypeScript and production build checks.
- Passed the Electron UI smoke test for newest-first ordering, icon size, folder navigation, reopening, Ctrl/Shift selection, and extraction/password completion through real IPC.
- Passed all 17 existing extraction integration checks.
- Applied the Explorer view to the archive source folder and read back icon size 256 and Date modified descending.

### Package

- Updated the Windows desktop build to 1.0.2 at the existing application path, including its unpacked folder-view helper, and refreshed the Desktop shortcut.

## 1.0.1 - 2026-10-06

### Changed

- Password-protected archives now show Waiting for password with a masked input, Continue, and Skip beside the archive row.
- The batch finishes other archives first, then returns to password jobs whose passwords have been submitted. Wrong passwords return to the waiting state without stopping other jobs.
- Passwords stay in memory and are supplied over stdin, outside process arguments and activity logs.
- Added a Waiting counter and per-archive completion times.

### Fixed

- Diagnosed the apparent extraction hang: 7-Zip was waiting on an invisible password prompt. Missing passwords now defer the job promptly.
- Replaced sequential top-level file moves with one directory rename on the destination volume, preserving the matching-root flattening behavior.
- Preserve duplicate archive file entries through automatic renaming, and only publish completed output after 7-Zip succeeds with its integrity checks.
- Failed extraction removes its own staging folder and preserves existing destination folders.
- Prevent overlapping extraction batches and retain distinct destinations when password retries encounter folder collisions.

### Verified

- Passed 17 automated integration checks using real 7-Zip: ZIP/7z contents and SHA-256, Unicode paths/passwords, empty files/folders, missing/wrong passwords, corrupt CRCs, duplicate entries, existing destinations, password queue ordering, skip, Deep scan, Main folder, and New main.
- Passed the production renderer smoke test through real Electron IPC: encrypted row waits while a normal archive completes; entering a password resumes and completes extraction.
- Extracted the supplied Nikke EP1.zip (105 MiB) in 0.344 seconds: all 68 files, 109,608,759 output bytes, sizes and CRCs match the archive listing. Source SHA-256 remained unchanged. Timing is this machine's measured run with the source already cached.
- Passed TypeScript checks and production build.

### Package

- Updated the Windows desktop build to 1.0.1 at the existing application path and refreshed its Desktop shortcut.

## 1.0.0 - 2026-07-06

Initial local Windows release.

### Added

- Built Quick Extract as a local Electron, React, and Vite desktop app.
- Added ZIP, 7Z, RAR, and RAR5 extraction through a bundled 7-Zip-compatible binary.
- Added archive file picker with multi-select support for Ctrl and Shift.
- Added folder scan and Deep scan. Deep scan searches archive files inside nested folders.
- Added Main folder mode using `Main Zip` as the output container.
- Added New main mode to create a fresh `Main Zip`, `Main Zip (1)`, `Main Zip (2)` output container when enabled.
- Added collision handling for extracted archive folders by appending `(1)`, `(2)`, and so on.
- Added Open folder behavior that opens the actual output location after extraction.
- Added Clear all to reset the current session state.
- Added scrollable archive table and activity log.
- Added galaxy/starry-sky visual design for a polished 4K-friendly desktop UI.
- Added packaged portable build and desktop shortcut creation.

### Fixed

- Fixed slow extraction by using the bundled 7-Zip binary directly instead of slow file-by-file handling.
- Fixed duplicate target folders by creating numbered folders instead of skipping or overwriting.
- Fixed nested same-name folder extraction so archives containing a matching root folder do not create redundant nesting.
- Fixed stale state after closing and reopening the app by avoiding persistence of previous jobs.
- Fixed unclear Main folder button by adding visible ON/OFF state.
- Fixed duplicated source controls by simplifying the source area to Choose files, Scan folder, and Deep scan.
- Fixed Deep scan state loss when toggling Main folder or New main.
- Fixed Extract all after Deep scan so extraction keeps using the deep-scan result set.
- Fixed Open folder so it opens `Main Zip` or `Main Zip (1)` after Main folder extraction.

### Verified

- Ran TypeScript checks.
- Ran production build and Electron package.
- Verified file picker scans selected archive files only.
- Verified normal scan and Deep scan return different result sets as expected.
- Verified Main folder and New main output paths.
- Verified extracted files were written correctly without corrupting source archives.
- Verified Desktop shortcut creation.
