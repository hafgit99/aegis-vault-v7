# Desktop Manual Smoke Checklist

Use this checklist for every Windows, Linux, or macOS desktop release candidate. Keep the completed copy with the release evidence folder.

Candidate:

- Version:
- Commit:
- Platform:
- Build type:
- Signed artifacts:
- Tester:
- Date:

## Install And Launch

- [ ] Installer/package installs successfully on a clean user profile or clean VM.
- [ ] Portable executable or app bundle launches successfully when included for the platform.
- [ ] App icon, app name, publisher/product metadata, and version are correct.
- [ ] App starts without opening developer tools or debug windows.
- [ ] App relaunch after quit succeeds.

## Vault Setup And Unlock

- [ ] Fresh setup creates a vault with master password and Secret Key.
- [ ] Emergency Kit can be generated and saved.
- [ ] Unlock succeeds with the correct master password and Secret Key.
- [ ] Wrong master password is rejected.
- [ ] Wrong Secret Key is rejected.
- [ ] App restart preserves encrypted vault state and unlock works again.

## Vault Operations

- [ ] Create a login item.
- [ ] Edit title, username, password, URL, notes, category, and favorite state.
- [ ] Search finds the expected item.
- [ ] Item detail view displays fields and security assessment correctly.
- [ ] Move an item to trash.
- [ ] Restore an item from trash.
- [ ] Permanently delete a test item from trash.

## Backup, Import, And Attachments

- [ ] Export encrypted `.aegis` backup through the native save dialog.
- [ ] Exported `.aegis` file is visible at the chosen destination.
- [ ] Import a valid encrypted `.aegis` backup through the native open dialog.
- [ ] Wrong backup password is rejected.
- [ ] Plain `.json` export requires explicit warning/confirmation.
- [ ] Attachment add, download/save, open, delete, and restart persistence work.

## Security Controls

- [ ] Manual Lock Vault clears the active session and sensitive reveal state.
- [ ] Auto-lock clears the active session after the configured timeout.
- [ ] Background/idle behavior matches configured lock policy.
- [ ] Copied secrets are cleared from the clipboard when unchanged.
- [ ] Sensitive reveal state resets after lock and navigation.
- [ ] Windows screenshot protection or platform-specific capture warning behaves as documented.

## Settings And Recovery

- [ ] Master password change warns before re-encryption and keeps existing records readable.
- [ ] Emergency Kit is available from Settings after unlock.
- [ ] Destructive reset requires explicit confirmation and returns to fresh setup.
- [ ] Language switching works for Turkish, English, and Chinese.
- [ ] Donation page remains visible and QR/address copy actions work.

## Platform Packaging

- [ ] Windows NSIS installer works when present.
- [ ] Windows MSI installer works when present.
- [ ] Linux AppImage launches when present.
- [ ] Linux `.deb` installs/uninstalls when present.
- [ ] macOS `.dmg` opens and app can be copied/launched when present.
- [ ] macOS `.app` bundle metadata and icon are correct when present.
- [ ] `SHA256SUMS.txt` matches published file artifacts.
- [ ] `metadata.json` reports the expected commit, version, platform, and clean/dirty status.

## Notes

- Blocking issues:
- Non-blocking issues:
- Follow-up screenshots/videos:
