; Remove the per-user Explorer menu entries the app may have added.
!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\QuickExtractUltra.Archive"
  DeleteRegKey HKCU "Software\Classes\AllFilesystemObjects\shell\QuickExtractUltra.Add"
!macroend
