@echo off
if exist "%~dp0..\src-tauri\target\release\aegis-vault-v7.exe" (
  "%~dp0..\src-tauri\target\release\aegis-vault-v7.exe" --native-messaging-host %*
) else if exist "%~dp0..\src-tauri\target\debug\aegis-vault-v7.exe" (
  "%~dp0..\src-tauri\target\debug\aegis-vault-v7.exe" --native-messaging-host %*
) else (
  aegis-vault-v7.exe --native-messaging-host %*
)
