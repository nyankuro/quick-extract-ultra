# tools/

The **ZIP password recovery** feature (for your own ZIP files) runs three
well-known open-source tools as **separate programs**. None of them is bundled
with Quick Extract Ultra, and the app never re-hosts them. You add them here —
either with the in-app **automatic download** (shown with each tool's name,
license, size and official source, and verified by checksum where the source
publishes one) or **manually**:

| Tool | Folder | Download it from |
|------|--------|------------------|
| bkcrack | `tools/bkcrack/` | https://github.com/kimci86/bkcrack/releases |
| hashcat | `tools/hashcat/` | https://hashcat.net/hashcat/ |
| John the Ripper (jumbo) | `tools/john/` | https://www.openwall.com/john/ |

Each tool keeps its own `LICENSE` file; please keep it next to the tool. The
app looks for `bkcrack.exe`, `hashcat.exe`, and `john.exe` / `zip2john.exe`
inside these folders (one extra nested folder, like `bkcrack-1.7.1-win/`, is
fine).

Downloaded tools actually live in your per-user data folder
(`%APPDATA%\quick-extract-ultra\tools\`); this folder in the app only holds the
built-in wordlist.
