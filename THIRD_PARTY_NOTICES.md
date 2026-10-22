# Third-party notices

Quick Extract Ultra's own code is licensed under the PolyForm Shield License 1.0.0
(see `LICENSE`). That license covers only Quick Extract Ultra's own code. It ships with the
following third-party software, each under its own license.

## 7-Zip

The `7z.exe` / `7z.dll` binaries (via the `7zip-bin-full` npm package) are part of 7-Zip,
Copyright (C) 1999-2026 Igor Pavlov.

- Most of 7-Zip is licensed under the **GNU LGPL** (version 2.1 or later).
- Some code is under the **BSD 3-clause** and **BSD 2-clause** licenses.
- The RAR decompression code is under the **GNU LGPL + unRAR restriction**: the unRAR
  source code may not be used to develop a RAR (WinRAR) compatible archiver.

Quick Extract Ultra only runs the unmodified 7-Zip program. Source code and full license
text: https://www.7-zip.org/

## Electron, Chromium and Node.js

Electron is MIT licensed. Chromium and Node.js licenses are included in the packaged app as
`LICENSES.chromium.html` and `LICENSE.electron.txt`.

## JavaScript libraries

React, React DOM (MIT) and lucide-react (ISC) are bundled into the interface.

## ZIP password recovery tools (not bundled)

The optional **Recover ZIP password** feature (for your own files) runs these
tools as separate programs. They are **not** included with Quick Extract Ultra
and are never re-hosted by it. You add them yourself, from their official
sources, with the in-app download or manually. Each keeps its own license.

- **bkcrack** — zlib license — https://github.com/kimci86/bkcrack
- **hashcat** — MIT license — https://hashcat.net/hashcat/
- **John the Ripper (jumbo)** — GPLv2+ (with some components under other free
  licenses) — https://www.openwall.com/john/

Because these run as separate processes, their licenses (including John's GPL)
do not extend to Quick Extract Ultra's own code.

The built-in `tools/wordlists/common-passwords.txt` is a short list of very
common passwords assembled for this project. It is dedicated to the public
domain under CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/), so
you may use it freely for any purpose.
