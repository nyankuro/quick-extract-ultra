param([Parameter(Mandatory = $true)][string]$FolderPath)
$ErrorActionPreference = 'Stop'
$normalizedPath = [IO.Path]::GetFullPath($FolderPath).TrimEnd('\')
$folderShell = New-Object -ComObject Shell.Application
$deadline = [DateTime]::UtcNow.AddSeconds(8)
do {
  foreach ($folderWindow in $folderShell.Windows()) {
    try {
      $view = $folderWindow.Document
      if ([IO.Path]::GetFullPath($view.Folder.Self.Path).TrimEnd('\') -ine $normalizedPath) { continue }
      $view.CurrentViewMode = 1
      $view.IconSize = 256
      $view.GroupBy = 'System.Null'
      $view.SortColumns = 'prop:-System.DateModified;'
      if ($view.IconSize -eq 256 -and $view.SortColumns -eq 'prop:-System.DateModified;') {
        Write-Output 'Folder view set: extra large icons, Date modified descending.'
        exit 0
      }
    } catch { }
  }
  Start-Sleep -Milliseconds 150
} while ([DateTime]::UtcNow -lt $deadline)
throw 'Could not apply the preferred view to the opened folder.'
