<div align="center">

<img src="docs/icon.png" width="96" alt="Quick Extract Ultra icon" />

# Quick Extract Ultra

**A free, friendly archive tool for Windows.**<br />
Open, extract and create ZIP, 7Z, RAR and 30+ other formats in a window that's actually nice to use.

**English** · [日本語](docs/README.ja.md) · [Tiếng Việt](docs/README.vi.md) · [简体中文](docs/README.zh-Hans.md)

[![Download](https://img.shields.io/github/v/release/nyankuro/quick-extract-ultra?label=download&color=19c8ff)](https://github.com/nyankuro/quick-extract-ultra/releases/latest)
![Windows 10 | 11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078d4)
[![License: PolyForm Shield 1.0.0](https://img.shields.io/badge/license-PolyForm%20Shield%201.0.0-a948e8)](LICENSE)
[![Support me on Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20me-ff5e5b?logo=kofi&logoColor=white)](https://ko-fi.com/nyannyankuro)

<img src="docs/screenshots/extract-en.png" alt="Quick Extract Ultra main window" width="900" />

</div>

## ✨ What makes it different

Quick Extract Ultra handles the everyday jobs of WinRAR or 7-Zip, plus a few things they don't do:

- 🔑 **One password doesn't stop the whole batch.** In most archive tools, a single locked archive pops up a password box and everything waits for you. Here it just steps aside: the rest keep extracting, and you type the password whenever you're ready.
- 🔍 **It finds your archives for you.** Point it at a folder and it gathers every archive inside, even deep in subfolders, then extracts them all in one go, each into its own folder.
- 🛡️ **No half-finished folders, ever.** Files are unpacked into a temporary folder first and only moved into place once 7-Zip confirms everything is intact. If something goes wrong, your folders stay exactly as they were, and nothing is ever overwritten.
- 🧹 **No more "folder inside a folder".** One switch (Smart) removes the extra wrapper folder when it isn't needed.
- 🔓 **A way back into your own locked files.** Forgot the password to your own ZIP or RAR? The app can try to find it, using your graphics card when it can. Most archive tools don't offer this at all.
- 💸 **Free, for real.** No ads, no trial period, no "please buy" reminders. It works offline, so your files never leave your computer.
- 🌏 **Easy on the eyes, in your language:** a clean, modern window in English, 日本語, Tiếng Việt, 简体中文 or 繁體中文.

### At a glance

| | Quick Extract Ultra | 7-Zip | WinRAR |
|---|:---:|:---:|:---:|
| Price | Free | Free | Paid (free trial) |
| Opens ZIP, 7Z and RAR | Yes | Yes | Yes |
| Keeps extracting while a locked archive waits for its password | **Yes** | No | No |
| Helps you recover a forgotten password (your own files) | **Yes** | No | No |
| Creates RAR files | No | No | Yes |

<sub>Compared with each app's standard features as of 2026.</sub>

## 📥 Download

1. Open the [**latest release**](https://github.com/nyankuro/quick-extract-ultra/releases/latest).
2. Pick one:
   - **`QuickExtractUltra-Setup-x.y.z.exe`** is the installer, and the easy choice. It adds Start menu and desktop shortcuts and doesn't need admin rights.
   - **`QuickExtractUltra-Portable-x.y.z-win-x64.zip`** is the portable version. Unzip it anywhere (a USB stick works too) and run `Quick Extract Ultra.exe`.
3. Open it. If Windows says *"Windows protected your PC"*, click **More info → Run anyway**. You see this because the app is new and isn't code-signed yet. All of the source code is right here if you'd like to check it.

To uninstall, go to **Windows Settings → Apps**. The right-click menu is removed for you.

### Extract something in 30 seconds

1. Drag your archives into the window, or click **Choose files**.
2. Click **Extract all**.
3. That's it. Each archive is unpacked into a new folder right next to it.

## 📖 Guide

### Extracting

Open the **Extract** tab, then drop archives in or use one of these buttons:

- **Choose files** lets you pick archives yourself.
- **Scan folder** finds every archive in a folder.
- **Deep scan** does the same and also looks inside subfolders.

A few switches let you fine-tune things:

- **Save to** sets where the files you chose are extracted. By default that's next to each archive. Click it to pick another folder, or press × to switch back. (Folder scans always extract next to each archive.)
- **Smart**: if an archive holds just one folder or file, it comes out as is, without an extra folder around it.
- **Main folder** puts everything into one `Main Zip` folder. **New main** starts a fresh `Main Zip (1)` for this run.
- **Delete archive** (the orange switch) **permanently** deletes each archive once it has been extracted successfully. It skips the Recycle Bin, so the app asks you to confirm the first time you turn it on. Nothing is deleted if an extraction fails or is cancelled.

Click **Extract all** and you're done. If a folder name is already taken, the app adds `(1)`, `(2)` and so on, so it never overwrites anything.

If an archive needs a password, a password box appears on its row. Type it in and press **Continue**, or **Skip** it. The other archives keep going in the meantime.

### Making an archive

1. Open **Compress** and drop in files or folders (or use **Add files** / **Add folder**).
2. Choose a name, where to save it, the format and how much to compress.
3. If you like, add a password (7Z or ZIP), hide the file names (7Z), or split it into parts (100 MB, 700 MB, 1 GB or 4 GB).
4. Click **Create archive**, then **Show in folder** when it's ready.

> 💡 ZIP passwords can only use English letters, numbers and symbols (a 7-Zip limitation). If your password has accents or Asian characters, choose 7Z.

### Looking inside an archive

Open **Browse archive** and drop an archive in. Double-click folders to look around, search by name, tick what you need and click **Extract selected**. There's no need to unpack everything.

### Testing and checksums

The **Test & checksums** tab checks that every file inside an archive is intact, without extracting anything. It can also work out CRC32, MD5, SHA-1, SHA-256 and SHA-512 for any file. Paste a checksum from a website to compare the two in one go.

### Right-click menu

Turn on **Settings → Explorer right-click menu** to add *Extract files... (choose folder)*, *Extract here (smart)*, *Extract to folder*, *Add to ZIP*, *Calculate checksums* and more to File Explorer. On Windows 11 they're under **Show more options** (or press Shift+F10). The menu is only added for your own Windows account, and it goes away when you switch the setting off.

### Recovering a forgotten password

Locked out of your own ZIP or RAR file? The **Recover password** tab can try to find the password for you.

> Please use it only on archives that are yours, or that you have permission to open.

- **The first time**, the app needs three free helper tools: bkcrack, hashcat and John the Ripper. They don't come with the app, so you choose **Download all automatically** (from their official websites) or **Add them myself**. You only do this once.
- **After that**, choose the archive and click **Try automatically**. The app tries numbers first, then common passwords and their variations, then a wider search. It uses your graphics card (GPU) for newer ZIP and RAR5 files, and your processor (CPU) for the rest.
- **Processing level**: *Balanced* is a good default. *Economy* keeps your PC cooler and quieter, and *Maximum* is the fastest but runs hot.
- You can **Pause**, **Resume** or **Cancel** at any time. When the password turns up, copy it or click **Extract now**.

Good to know: a short, simple password can turn up in seconds, but a long random one can take days, or may never be found. If you have an older ZIP and still have one of the original files that's inside it, the app can use that file to unlock the ZIP very quickly. Some antivirus programs flag password tools by mistake, so if a tool seems to vanish after downloading, check your antivirus quarantine.

### Settings

| Setting | Default | What it does |
|---|---|---|
| Language | English | English, 日本語, Tiếng Việt, 简体中文 or 繁體中文 |
| Explorer right-click menu | Off | Adds the right-click menu described above |
| Open the folder after extracting | Off | Opens the result in File Explorer when a job finishes |
| Keep download safety warnings | **On** | Files extracted from a downloaded archive keep Windows' "from the internet" mark, so SmartScreen and Office still protect you |
| Move archives to the Recycle Bin after extracting | Off | A gentler option than *Delete archive*, since you can still restore the archive later |
| Check for updates | | Checks whether a newer version is out, and opens the download page if there is one |

## Questions

**Can it make RAR files?**
No. Only WinRAR can create RAR files. Quick Extract Ultra opens RAR files (RAR5 too) and creates 7Z, ZIP and TAR files, which any modern tool can open.

**Does it send my files anywhere?**
No. Everything happens on your computer, using the well-known 7-Zip engine, and there's no tracking of any kind. The app only goes online when you ask it to: when you press **Check for updates**, or when you download the password-recovery tools.

**Which formats can it open?**
ZIP, ZIPX, 7Z, RAR (incl. RAR5), TAR, GZ, TGZ, BZ2, XZ, TXZ, ZST, LZ, LZMA, Z, CAB, ISO, WIM, ARJ, LZH/LHA, CPIO, RPM, DEB, DMG, VHD, VHDX and XAR. Split archives such as `.part1.rar` or `.7z.001` open from their first part.

**Why does Windows warn me the first time?**
New apps without a paid code-signing certificate get a SmartScreen warning. Click **More info → Run anyway**. I'd love to sign the app one day, and your support helps make that happen.

**Where are my settings saved?**
In `%APPDATA%\quick-extract-ultra\settings.json`. Your archive lists and passwords are never saved.

## ☕ Support

Quick Extract Ultra is free, and it's going to stay that way. If it saves you some time, a coffee keeps me going:

<a href="https://ko-fi.com/nyannyankuro"><img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support me on Ko-fi" /></a>

There's also a **Support me** button in the app, just under the title. Other ways to help:

- ⭐ **Give the project a star.** It helps other people find it.
- 🐛 **Tell me about bugs or ideas** in [Issues](https://github.com/nyankuro/quick-extract-ultra/issues).

## For developers

<details>
<summary><b>Build from source</b></summary>

You need [Node.js](https://nodejs.org/) 22 or newer and Windows 10/11.

```bash
git clone https://github.com/nyankuro/quick-extract-ultra.git
cd quick-extract-ultra
npm ci
npm run dev        # run with live reload
npm test           # archive integration tests (real 7-Zip)
npm run test:ui    # Electron UI smoke test
npm run dist       # build the installer and portable zip into dist/
```

Project layout: `electron/` (main process, 7-Zip, Explorer integration), `src/` (React interface), `locales/` (translations), `scripts/` (tests and tools).

Bug reports, ideas and translations are all welcome in [Issues](https://github.com/nyankuro/quick-extract-ultra/issues). To add a language, copy `locales/en.json`, translate the values, and register it in `src/i18n.tsx` and `electron/settings.cjs`.

</details>

## 📄 License

© 2026 nyankuro. Quick Extract Ultra is **free** and its source code is public, under the [PolyForm Shield License 1.0.0](LICENSE). In plain words:

- ✅ You can use it for free, at home or at work, share it, and change it for your own use.
- ❌ You can't sell it, or put it out (or a renamed copy of it) as a competing product, even for free.

Powered by [7-Zip](https://www.7-zip.org/) by Igor Pavlov (GNU LGPL + unRAR restriction). Other bundled parts keep their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
Thanks to the great archivers that inspired this one: [7-Zip](https://www.7-zip.org/), [NanaZip](https://github.com/M2Team/NanaZip) and [PeaZip](https://github.com/peazip/PeaZip).

<div align="center">

Made with ❤️ by nyankuro 🐈‍⬛

</div>
