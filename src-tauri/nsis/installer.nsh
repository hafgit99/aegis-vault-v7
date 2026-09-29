; KalderaShield NSIS Custom Hooks
;
; Intentionally empty.
;
; A previous revision removed the user's vault directory on uninstall without
; consent. For a password manager that is unrecoverable data loss: the vault is
; the only copy, and a user who uninstalls to reinstall, to free disk space, or
; to upgrade can silently destroy every credential they own. Uninstalling an
; application must never delete user data.
;
; Vault data lives under %APPDATA%\com.kalderashield.desktop and is left intact
; on uninstall. Users who want to remove it can delete the directory manually.
