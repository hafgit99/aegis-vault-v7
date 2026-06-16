; Aegis Vault 7 NSIS Custom Hooks
; Cleans up application data (vault database) on uninstall so reinstall starts fresh.

!macro NSIS_HOOK_PREUNINSTALL
  ; Remove vault database from Roaming AppData
  RMDir /r "$APPDATA\com.hafgit99.aegisvault7"
  
  ; Remove vault database from Local AppData (WebView2 cache, OPFS, etc.)
  RMDir /r "$LOCALAPPDATA\com.hafgit99.aegisvault7"
!macroend
