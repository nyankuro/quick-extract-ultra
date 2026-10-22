# Quick Extract Ultra Changelog

Version notes are required for every future app change. Each release should record:

- Version number and date.
- User-facing changes.
- Bugs or confusing behavior found.
- Fix approach.
- Verification performed.
- Package or shortcut changes, if any.

## 2.3.0 - 2026-10-22

### Changed

- **License changed from MIT to the PolyForm Shield License 1.0.0**, at the owner's request to stop others from taking the app and reselling it. MIT (and GPL) both allow resale; PolyForm Shield does not. In plain terms: anyone may use the app for free (at home or at work), share it, and modify it for their own use, but nobody may sell it or offer it, or a renamed/rebranded copy, as a product that competes with Quick Extract Ultra, even for free. `LICENSE` holds the verbatim official text plus the `Required Notice:` copyright line the license asks for.
- The app is now described as "free, with public source code" rather than "open source" (PolyForm Shield is source-available, not an OSI open-source license): About text in all five languages, `package.json` description, READMEs (EN/JA/VI) with a plain-language license summary, and `THIRD_PARTY_NOTICES.md`.
- `package.json` `license` is `SEE LICENSE IN LICENSE` (PolyForm Shield has no SPDX identifier).
- The built-in common-passwords wordlist is now explicitly dedicated to the public domain (CC0 1.0) instead of "same MIT license as the app".
- Bundled third-party software keeps its own licenses (7-Zip LGPL + unRAR restriction, Electron/React MIT, lucide ISC); the recovery tools are still never bundled.

### Docs

- READMEs rewritten in a friendlier, plainer tone (English, Japanese, Vietnamese), plus a new **Simplified Chinese** README (`docs/README.zh-Hans.md`). Every button name matches that language's on-screen label.
- New "What makes it different" section in every README, highlighting what sets the app apart (batches keep going while an archive waits for its password, automatic folder/subfolder scanning, staged extraction that never leaves half-finished folders, smart extraction, password recovery for your own files, free with no trial reminders), plus a short, honest comparison table against 7-Zip and WinRAR (it includes the row WinRAR wins: creating RAR files).
- Brought up to date with current features: the Delete archive switch, ZIP + RAR password recovery (Try automatically, processing levels, realistic expectations, antivirus tip), Check for updates, five languages.
- Ko-fi added to every README: a badge at the top and Ko-fi's official GitHub button in the Support section.
- Fixed an outdated claim: the app is not fully offline. It only goes online when the user presses Check for updates or downloads the recovery tools.
- The UI smoke test also captures `docs/screenshots/extract-zh-Hans.png` for the Chinese README.

### Verification

- `npm run typecheck`, `npm test`, `npm run build`, `npm run test:ui`.

## 2.2.9 - 2026-10-22

### Added

- A **"Check for updates"** button in **Settings → Updates**. It asks GitHub for the project's latest Release, compares it with the running version, and shows one of: a new version is available (with a **Download** button that opens the Release page), you're on the latest version, no published release found yet, or a friendly "couldn't check — check your connection" message.
- Why a check-and-download flow rather than silent auto-install: the app is not code-signed yet, so a silently-downloaded installer would still trigger Windows SmartScreen/antivirus prompts; and the repo isn't published yet, so there is no Release feed to pull from. The check is safe (it never downloads or runs anything itself — it just opens the official download page) and fully testable now. We can move to true one-click auto-update (electron-updater) later, once the repo is public, each version is cut as a GitHub Release, and we have code signing.
- New main-process module `electron/update-check.cjs` (pure `compareVersions` / `interpretLatest` plus a networked `checkForUpdate`), IPC `update:check`, and `window.quickExtract.checkForUpdate()`. Strings added in all five languages.

### Known limitation

- "Check for updates" will report "no published release found yet" until the `nyankuro/quick-extract-ultra` repo is published and versions are tagged as GitHub Releases. A 404 from GitHub (no releases) is treated as a normal "nothing found", not an error.

### Verification

- `npm run typecheck`, `npm test` (43/43 pass, incl. a new version-compare/interpret test), a live check against the GitHub API (correctly returns "none" while the repo is unpublished), `npm run build`.

### Package

- Outputs: `QuickExtractUltra-Setup-2.2.9.exe`, `QuickExtractUltra-Portable-2.2.9-win-x64.zip`.

## 2.2.8 - 2026-10-22

### Added

- A prominent **"Delete archive"** slide toggle on the Extract screen (amber/red, with a left/right sliding switch). When ON, each source archive is **permanently deleted** right after it extracts **successfully** — never on failure or cancel. Default OFF.
  - The **first time** it is switched ON, a warning dialog explains that deletion is permanent (files do **not** go to the Recycle Bin and can't be recovered), with **Agree / Cancel** and a **"Don't show this again"** checkbox.
  - Persistence rule (as requested): if the user ticks "Don't show this again" and agrees, their on/off choice is remembered across app launches and the warning never shows again. If they do **not** tick it, the toggle resets to OFF on every future launch and warns again next time. Backed by two new settings, `deleteAfterExtract` and `deleteAfterExtractRemember`.
  - Permanent delete (the toggle) takes precedence over the gentler Settings option "Move archive to Recycle Bin after extract" — they never both run on the same file. Multi-volume sets are deleted together.
  - Toggle label, warning text and checkbox are in all five languages.

### Changed

- The **"Save to:"** control on the Extract screen now stands out: a brighter cyan frame/glow and a clearer, brighter "Save to:" label, so it's easier to spot among the other buttons.

### Safety

- Deletion only ever runs inside the extraction success path (after 7-Zip's exit code and integrity check), so a failed or cancelled extraction never deletes the original. The destructive toggle is off by default, requires an explicit first-run confirmation, and only persists when the user opts in.

### Verification

- `npm run typecheck`, `npm test` (42/42 pass, including the updated settings-persistence test), `npm run build`, `npm run test:ui`.

### Package

- Outputs: `QuickExtractUltra-Setup-2.2.8.exe`, `QuickExtractUltra-Portable-2.2.8-win-x64.zip`.

## 2.2.7 - 2026-10-22

### Changed

- The **"Support me"** button now shows a little coffee-cup-with-heart icon instead of the plain heart, matching the "buy me a coffee" feel of the Ko-fi page. The icon is an original SVG drawn in the app code (`KofiIcon` in `src/App.tsx`), so it ships inside the app and works fully offline — nothing is loaded from a remote server, and it is not a copy of any third-party logo. The button keeps its pink colour and caption.

### Verification

- `npm run typecheck`, `npm test` (all suites pass), `npm run build`.

### Package

- Outputs: `QuickExtractUltra-Setup-2.2.7.exe`, `QuickExtractUltra-Portable-2.2.7-win-x64.zip`.

## 2.2.6 - 2026-10-22

### Added

- A pink **"Support me"** button under the app title that opens the project's Ko-fi page (`ko-fi.com/nyannyankuro`) in the default browser, with a small friendly caption beside it. Implemented as a **native button** that opens the page externally rather than injecting Ko-fi's remote overlay-widget `<script>` — this keeps the Electron renderer free of third-party remote code (safer, and not blocked by the app's isolation). The button label and caption are in all five languages.
- README "Support the project" sections (EN/JA/VI), `.github/FUNDING.yml`, and the Settings "Support the project" link now point to the Ko-fi page.

### Package

- Outputs: `QuickExtractUltra-Setup-2.2.6.exe`, `QuickExtractUltra-Portable-2.2.6-win-x64.zip`.

## 2.2.5 - 2026-10-22

### Added

- A clear note in the password-recovery tab setting expectations: finding a password can take anywhere from seconds to days (or may not succeed at all) depending on its length and complexity — it is not a magic tool. Shown in all five languages, on both the first-run setup screen and the main recovery view, under the ownership reminder.

### Package

- Outputs: `QuickExtractUltra-Setup-2.2.5.exe`, `QuickExtractUltra-Portable-2.2.5-win-x64.zip`.

## 2.2.4 - 2026-10-22

### Fixed

- The **installer window is no longer blurry** on high-DPI displays. electron-builder's NSIS installer was not DPI-aware, so Windows bitmap-stretched it (it looked like a low-res / 720p screen). A `customHeader` hook in `build/installer.nsh` now sets `ManifestDPIAware true`, so Windows renders the installer's text and controls at native resolution. Verified the built `Setup.exe` now carries `dpiAware` in its application manifest.

### Package

- Outputs: `QuickExtractUltra-Setup-2.2.4.exe`, `QuickExtractUltra-Portable-2.2.4-win-x64.zip`.

## 2.2.3 - 2026-10-22

### Fixed

- **RAR5 password recovery now really runs on the GPU** (hashcat mode 13000), instead of falling back to John on the CPU. Before, "Automatic (GPU if possible)" was misleading for RAR and numeric passwords were slow. Measured on this machine's RTX 3060: ~40,500 guesses/s; a 7-digit numeric RAR5 password was recovered in under a minute, where the CPU path was effectively impractical.
- hashcat is now launched **from its own folder** so it finds its GPU kernels/modules; previously it failed to start and the engine silently dropped to John (CPU). A real hashcat launch failure is now surfaced, and only then does it fall back to John.
- Routing is by hash type: ZIP AES → hashcat 13600, RAR5 → hashcat 13000 (both GPU); ZIP ZipCrypto and RAR3 → John (CPU), which have no reliable GPU mode here.

### Verified

- `npm test` 42/42. Real end-to-end on the RTX 3060: `rar2john` hash of a RAR5 archive loaded into hashcat mode 13000 and cracked a 5-digit password in ~25 s and a 7-digit numeric password in ~55 s, all on the GPU (confirmed by the device name NVIDIA GeForce RTX 3060 in hashcat's status), with no fallback to the CPU.

### Package

- Outputs: `QuickExtractUltra-Setup-2.2.3.exe`, `QuickExtractUltra-Portable-2.2.3-win-x64.zip`.

## 2.2.2 - 2026-10-22

### Added

- **Processing level** for password recovery: **Economy / Balanced / Maximum**, so the machine does not overheat. The default is **Balanced**, which uses about half the CPU; it scales to the computer's own core count (Economy ≈ a quarter, Maximum = all). It caps John via `OMP_NUM_THREADS`, hashcat via its workload profile (`-w 1/2/3`), and bkcrack via `-t`.

### Changed

- **Auto recovery tries the most likely passwords first.** New order: digits only (PINs, dates) → the built-in common-password list → a bigger list with mangling rules → a Markov-ordered mixed search. Previously the wordlist ran first, so a numeric password only came out after that finished. Now short numeric and common passwords are found much sooner.

### Verified

- `npm test` 42/42, typecheck, build, UI smoke test. Real end-to-end: a RAR5 archive with a 4-digit numeric password was recovered in ~30 s on Balanced (14 of 28 threads) via the digits-first stage.

### Package

- Outputs: `QuickExtractUltra-Setup-2.2.2.exe`, `QuickExtractUltra-Portable-2.2.2-win-x64.zip`.

## 2.2.1 - 2026-10-22

### Fixed

- Buttons no longer disappear when the window is not maximized. On the Extract tab the control buttons used to stack into a tall two-column grid whose last buttons ("Open folder", "Clear all", and sometimes "Extract all") fell off the bottom. They now pack into as many columns as fit, the whole app scrolls when short, and the minimum window size is smaller (860×580), so no button is ever cut off at any size. Verified across widths from 860 to 1920 and heights down to 560: no control is clipped or unreachable.

### Package

- Outputs: `QuickExtractUltra-Setup-2.2.1.exe`, `QuickExtractUltra-Portable-2.2.1-win-x64.zip`.

## 2.2.0 - 2026-10-22

### Added

- **Password recovery now supports RAR as well as ZIP.** The app auto-detects the archive type: ZIP uses `zip2john` (and bkcrack for the ZipCrypto known-plaintext fast path); RAR uses `rar2john` (bundled with John, no extra dependency) and John the Ripper. Header-encrypted RAR (made with `-hp`) is handled too — 7-Zip can't list it without the password, but `rar2john` reads it. The one-button "Try automatically" flow is unchanged. The tab is now "Recover password" and the picker accepts `.zip` and `.rar`.
  - A note warns that RAR (especially RAR5) uses strong encryption, so recovery is much slower than ZIP and realistically only finds short, numeric, or common passwords.
  - 7z is still not supported (its `7z2john` is a Perl script and John's Windows build ships no Perl).

### Fixed

- Hashes are now written as the **bare token** (`$zip2$…`, `$rar5$…`). `rar2john` prefixes the archive's full path, whose drive-letter colon (`C:\…`) made John mis-split `login:hash` and report "No password hashes loaded". This affected RAR and could affect ZIP.

### Verified

- `npm test` 42/42, typecheck, build, UI smoke test. Real end-to-end on this machine: created RAR5 archives with WinRAR (both `-hp` header-encrypted and `-p` data-encrypted) and the engine's auto mode recovered the password through `rar2john` + John.

### Package

- Outputs: `QuickExtractUltra-Setup-2.2.0.exe`, `QuickExtractUltra-Portable-2.2.0-win-x64.zip`.

## 2.1.2 - 2026-10-22

### Added

- The version number is shown as a small badge next to "Quick Extract Ultra" in the header, so you can always tell which build you are running. It is read from `package.json` (the `app:info` version now comes from `package.json`, not `app.getVersion()`, which returned Electron's version when unpackaged).

### Changed

- Password recovery is ZIP-only (its tools — `zip2john`, `bkcrack` — do not read RAR or 7z). The "Choose ZIP" picker now filters to `.zip`, and a non-ZIP file (e.g. a `.rar`) is rejected up front with a clear message instead of the generic "Could not read a password hash". A short "ZIP files only" note sits under the chooser.

### Verified

- `npm test` 42/42, `npm run typecheck`, `npm run build`, `npm run test:ui`. Version badge confirmed to read the app version (2.1.2). Archive-type check confirmed: `.zip` accepted, `.7z`/`.rar` rejected as NOT_ZIP.

### Package

- Outputs: `QuickExtractUltra-Setup-2.1.2.exe`, `QuickExtractUltra-Portable-2.1.2-win-x64.zip`.

## 2.1.1 - 2026-10-22

### Changed

- **Password recovery now has a one-button "Try automatically" default** that picks the most effective real-world strategy, so an ordinary user who forgot their own password does not have to understand wordlists or charsets. Order: common passwords with mangling rules (John `--rules`, hashcat `best64.rule`), then digits-only (John `--incremental=Digits`, hashcat `?d` increment) for PINs/dates, then a Markov-ordered smart search (John `--incremental`, hashcat mask with `--increment`) that tries the most likely passwords first. The a-z/A-Z/0-9/symbol charset pickers and custom wordlist moved into the "Wordlist" and "Brute force" tabs for advanced users; the default path needs no settings.
- **Scanned folders extract beside each source archive again.** With "Scan folder" or "Deep scan", each archive is extracted into a folder next to itself; the "Save to" destination now applies only to files chosen with "Choose files".
- **The file picker has a visible sort control** (name / date modified / type / size, ascending or descending) in every view, not only by clicking the Details columns.

### Fixed

- `zip2john` hash extraction now writes the bare hash token (`$zip2$…$/zip2$`), so hashcat (AES ZIPs, mode 13600) receives a valid hash; the previous code left a trailing `:name:path` that could break it. When no hash can be read, the error now includes `zip2john`'s own reason.

### Notes

- Windows Defender and some antivirus flag hashcat / John / bkcrack as hacktools and may quarantine the downloaded `.exe`. If a tool disappears or will not run, allow it in the antivirus. The app cannot prevent this; it is the nature of these tools.
- The Windows 11 modern right-click menu is not supported: entries appear under "Show more options" (the classic menu). Appearing in the main Win11 menu next to WinRAR needs a signed MSIX package with an `IExplorerCommand` shell extension, which an unsigned Electron app cannot provide yet.

### Verified

- `npm test` 42/42. Real end-to-end: John auto-mode recovered a numeric ZipCrypto password ("1234") through the engine; the hash-extraction fix produces bare hashes for ZipCrypto and AES. `npm run typecheck`, `npm run build`, `npm run test:ui`, and `scripts/picker-preview.cjs` pass.

### Package

- Outputs: `QuickExtractUltra-Setup-2.1.1.exe`, `QuickExtractUltra-Portable-2.1.1-win-x64.zip`.

## 2.1.0 - 2026-10-21

### Added

- **Recover ZIP password** tab, for ZIP files you own or are allowed to open (an on-screen note states this). It runs three well-known open-source tools as **separate processes** (never compiled in, so their licenses — including John's GPL — do not reach this app's MIT code):
  - **bkcrack** (zlib) for a legacy ZipCrypto archive when you still have one original file from inside it (fastest).
  - **hashcat** (MIT) on the GPU for AES ZIPs, John the Ripper jumbo (GPLv2+) on the CPU otherwise; wordlist first, then brute force by chosen charset/length.
  - The hash itself is read with John's `zip2john`, so John is the base tool; hashcat is an optional GPU accelerator; bkcrack is the standalone fast path.
  - The recovery tab is visually set apart (amber frame, key icon, larger) from the plain tool tabs. When no tool is installed the tab opens a **first-run setup screen** (**Download all automatically**, **Add them myself**, and a circular **(?)** explaining why the tools are needed and how to download safely); the full UI appears once a tool is present.
  - UI: choose ZIP, known-file picker for ZipCrypto, wordlist selector (a small `common-passwords.txt` ships with the app), brute-force charset/length, device choice, progress with speed and ETA, Pause/Resume (via hashcat/John restore sessions) and Cancel, the found password with copy, and "Extract now".
  - Tools are **not bundled** and never re-hosted; downloads go to `%APPDATA%\quick-extract-ultra\tools\`. **Automatic download** fetches the latest version of each tool from its **official source** over HTTPS (bkcrack from its GitHub release, hashcat from hashcat.net, John from openwall.com). bkcrack is checksum-verified against GitHub’s published digest (discarded on mismatch); hashcat and John publish a PGP signature rather than a machine-checkable checksum, so those are trusted to their official HTTPS host and the SHA-256 is recorded for the user to verify later, not gated. A manual button to each official page is always available.
- Two more interface languages: **Simplified Chinese (简体中文)** and **Traditional Chinese (繁體中文)**, as separate options. The app now has five languages.

### Verified

- `npm test` 42/42 (adds recovery: output parsers for hashcat/John/bkcrack, charset/length helpers, no-verified-auto-download for hashcat/John, tool detection under `tools/<id>/`, engine routing AES→hashcat and ZipCrypto→John and bkcrack with a known file, unprotected-ZIP rejection, Cancel, the bundled wordlist, and that all five locales share the same keys and placeholders).
- Real end-to-end checks on this machine: auto-downloaded bkcrack 1.8.1 from its official GitHub release, verified its published SHA-256, extracted and detected it; then recovered the real password of a ZipCrypto archive from a known plaintext file, through the engine, with live progress; and auto-downloaded John 1.9.0-jumbo-1 from openwall.com (official page scraped for the current Windows build), extracted and detected it with its zip2john.
- `npm run typecheck`, `npm run build`; `npm run test:ui` adds a check for five languages and the recovery tab.

### Package

- Bundles `tools/wordlists/common-passwords.txt` as a resource. Outputs: `QuickExtractUltra-Setup-2.1.0.exe`, `QuickExtractUltra-Portable-2.1.0-win-x64.zip`.

## 2.0.2 - 2026-10-21

### Changed

- The archive picker shows the real Windows icons and thumbnails, the same ones Explorer shows (for example the WinRAR icon for archives when WinRAR is installed, and the Windows folder icon), in every view. They come from the Windows Shell image factory through a small PowerShell helper (`electron/shell-icons.ps1`) that stays open for the session; icons are cached and requested at about 1.5x their drawn size so they stay sharp. If the helper fails, `app.getFileIcon` (32 px) and then the built-in drawing are used.

### Found

- `nativeImage.createThumbnailFromPath` only reads Explorer's thumbnail cache and failed for archives and folders; `app.getFileIcon` is limited to 32 px on Windows, too small for the extra large view.

### Verified

- `npm run typecheck`, `npm test` 29/29, `npm run test:ui` pass.
- `scripts/picker-preview.cjs` now waits until all 32 entries show shell icons and checks every view for overflow at 1280x800.
- Packaged build: the helper script is unpacked next to `app.asar` and returns icons.

### Package

- `electron/shell-icons.ps1` added to `asarUnpack`. Outputs: `QuickExtractUltra-Setup-2.0.2.exe`, `QuickExtractUltra-Portable-2.0.2-win-x64.zip`.

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
