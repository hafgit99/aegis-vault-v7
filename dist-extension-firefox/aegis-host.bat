@echo off
if exist "C:\Users\hrn21\OneDrive\Desktop\aegisvaultv7\src-tauri\target\debug\aegis-vault-v7.exe" (
  "C:\Users\hrn21\OneDrive\Desktop\aegisvaultv7\src-tauri\target\debug\aegis-vault-v7.exe" --native-messaging-host %*
) else (
  "C:\Users\hrn21\OneDrive\Desktop\aegisvaultv7\src-tauri\target\release\aegis-vault-v7.exe" --native-messaging-host %*
)
