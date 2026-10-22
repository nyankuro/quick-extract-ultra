; Make the installer DPI-aware so Windows renders its text crisply on high-DPI
; displays instead of bitmap-stretching it (which looked blurry / low-res).
!macro customHeader
  ManifestDPIAware true
!macroend

; Remove the per-user Explorer menu entries the app may have added.
!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\QuickExtractUltra.Archive"
  DeleteRegKey HKCU "Software\Classes\AllFilesystemObjects\shell\QuickExtractUltra.Add"
!macroend
