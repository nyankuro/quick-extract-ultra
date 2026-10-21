const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const exePath = path.join(root, 'dist', 'win-unpacked', 'Quick Extract Ultra.exe');

if (!fs.existsSync(exePath)) {
  console.error(`Packaged executable not found: ${exePath}`);
  process.exit(1);
}

function psQuote(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

const script = `
function New-QuickExtractUltraShortcut($shortcutPath) {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = ${psQuote(exePath)}
  $shortcut.WorkingDirectory = ${psQuote(path.dirname(exePath))}
  $shortcut.Description = 'Quick Extract Ultra archive manager'
  $shortcut.IconLocation = ${psQuote(exePath)}
  $shortcut.Save()
  return (Test-Path -LiteralPath $shortcutPath)
}

$primaryDesktop = [Environment]::GetFolderPath('Desktop')
$candidateDesktops = @(
  [Environment]::GetFolderPath('Desktop'),
  (Join-Path $env:USERPROFILE 'Desktop')
) | Select-Object -Unique

$createdShortcut = $null
foreach ($desktop in $candidateDesktops) {
  if (-not (Test-Path -LiteralPath $desktop)) {
    New-Item -ItemType Directory -Force -Path $desktop | Out-Null
  }

  $shortcutPath = Join-Path $desktop 'Quick Extract Ultra.lnk'
  if (New-QuickExtractUltraShortcut $shortcutPath) {
    $createdShortcut = $shortcutPath
    break
  }
}

if (-not $createdShortcut) {
  throw "Shortcut was not written to any Desktop folder."
}

$primaryShortcut = Join-Path $primaryDesktop 'Quick Extract Ultra.lnk'
if ($createdShortcut -ne $primaryShortcut -and (Test-Path -LiteralPath $primaryDesktop)) {
  Copy-Item -LiteralPath $createdShortcut -Destination $primaryShortcut -Force
  if (Test-Path -LiteralPath $primaryShortcut) {
    Write-Output $primaryShortcut
    exit 0
  }
}

Write-Output $createdShortcut
`;

const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
  encoding: 'utf8'
});

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

console.log(`Desktop shortcut created: ${result.stdout.trim()}`);
