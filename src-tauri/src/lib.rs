use base64::Engine;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, WebviewWindow};
use zeroize::Zeroize;

const VAULT_DATABASE_FILENAME: &str = "aegis_sqlite.db";
#[allow(dead_code)]
const FILE_DIALOG_BUFFER_LEN: usize = 32768;
const MAX_VAULT_FILE_BYTES: u64 = 25 * 1024 * 1024; // 25 MB

mod credential_handler;
mod linux_security;
mod native_messaging;

struct ExtensionState {
    credentials:
        std::sync::Arc<std::sync::Mutex<Option<native_messaging::ExtensionCredentialCache>>>,
    pairing_token: std::sync::Arc<std::sync::Mutex<String>>,
    /// #43: shared with the loopback IPC accept loop. A token rotation has to retire the
    /// sessions that are *already* connected, not just the handshakes that come after it.
    session_generation: native_messaging::RevokeGeneration,
}

#[derive(serde::Serialize)]
struct ImportFilePayload {
    name: String,
    contents: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AssetIntegrityAnchor {
    schema_version: u8,
    algorithm: &'static str,
    root_sha256: &'static str,
    production: bool,
}

/// Diagnostic file written by `record_asset_integrity_result`. Read this when
/// the app reports an asset integrity failure in a release build.
const ASSET_INTEGRITY_RESULT_FILENAME: &str = "aegis_asset_integrity_result.txt";

/// Reduces a caller-supplied reason code to a safe, bounded token.
///
/// `reason` reaches this from the webview, so it is not trusted as free-form
/// text: a diagnostic file that a webview script can write arbitrary bytes into
/// is a way to smuggle content onto disk. Only the lowercase code characters the
/// real reasons use (`manifest-unavailable`, `asset-hash-mismatch`, ...) survive,
/// and the result is length-capped.
///
/// Returns `None` when nothing usable is left, so the caller can refuse to
/// write rather than write an empty file that reads like a verdict.
fn sanitize_asset_integrity_reason(reason: &str) -> Option<String> {
    const MAX_REASON_LEN: usize = 64;
    let sanitized: String = reason
        .chars()
        .filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == '-')
        .take(MAX_REASON_LEN)
        .collect();
    if sanitized.is_empty() {
        None
    } else {
        Some(sanitized)
    }
}

#[tauri::command]
fn get_asset_integrity_anchor() -> AssetIntegrityAnchor {
    AssetIntegrityAnchor {
        schema_version: 1,
        algorithm: "SHA-256",
        root_sha256: option_env!("AEGIS_ASSET_INTEGRITY_ROOT").unwrap_or(""),
        production: !cfg!(debug_assertions),
    }
}

#[tauri::command]
fn restart_app(app_handle: AppHandle) {
    app_handle.restart();
}

/// Records the outcome of the runtime asset-integrity check next to the app's
/// other diagnostic files.
///
/// `verifyRuntimeAssetIntegrity` returns a `reason` for every failure, but it
/// reaches the developer only through `console.error`. A release build has no
/// devtools, so a real user reporting "Application Integrity Warning" cannot
/// say *which* check failed, and neither can we: the control is fail-closed by
/// design, and the string that would explain it is discarded.
///
/// Deliberately not gated on `CredentialSession` and deliberately not treated
/// as vault data. The reason codes are a fixed enum the frontend chooses from
/// (`manifest-unavailable`, `asset-hash-mismatch`, ...) — never anything
/// derived from vault contents or user input — so writing them needs no
/// unlocked session and discloses nothing.
///
/// Overwrites rather than appends: there is one verdict per run, and a log that
/// accumulates would be harder to read than the thing it replaced.
#[tauri::command]
fn record_asset_integrity_result(reason: String) -> Result<(), String> {
    let Some(sanitized) = sanitize_asset_integrity_reason(&reason) else {
        return Err("refusing to record an empty asset integrity reason".to_string());
    };

    let Some(app_dir) = native_messaging::get_app_data_dir() else {
        return Err("app data directory is unavailable".to_string());
    };
    let _ = fs::create_dir_all(&app_dir);

    let path = app_dir.join(ASSET_INTEGRITY_RESULT_FILENAME);
    fs::write(&path, format!("{sanitized}\n"))
        .map_err(|error| format!("failed to record asset integrity result: {error}"))
}

#[cfg(target_os = "windows")]
fn apply_screen_capture_protection_to_window(window: &WebviewWindow) -> Result<bool, String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE,
    };

    let hwnd = window
        .hwnd()
        .map_err(|error| format!("failed to resolve window handle: {error}"))?;
    let applied = unsafe { SetWindowDisplayAffinity(hwnd.0 as _, WDA_EXCLUDEFROMCAPTURE) != 0 };
    if !applied {
        return Err("failed to enable Windows screen capture protection".to_string());
    }

    Ok(true)
}

#[cfg(target_os = "macos")]
fn apply_screen_capture_protection_to_window(window: &WebviewWindow) -> Result<bool, String> {
    use objc2_app_kit::{NSWindow, NSWindowSharingType};

    let ns_window_ptr = window
        .ns_window()
        .map_err(|error| format!("failed to resolve NSWindow pointer: {error}"))?
        as *mut NSWindow;

    if ns_window_ptr.is_null() {
        return Err("NSWindow pointer is null".to_string());
    }

    unsafe {
        let ns_window = &*ns_window_ptr;
        ns_window.setSharingType(NSWindowSharingType::None);
    }

    Ok(true)
}

#[cfg(target_os = "linux")]
fn apply_screen_capture_protection_to_window(window: &WebviewWindow) -> Result<bool, String> {
    let server = linux_security::get_linux_display_server();
    if server == "x11" {
        log::warn!("Running under X11. Screen capture protection is limited by display server architecture.");
    }
    let app_handle = window.app_handle().clone();
    linux_security::start_linux_screen_capture_monitor(app_handle);
    Ok(true)
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn apply_screen_capture_protection_to_window(_window: &WebviewWindow) -> Result<bool, String> {
    Ok(false)
}

fn apply_screen_capture_protection(app: &AppHandle) -> Result<bool, String> {
    let mut any_supported = false;

    for window in app.webview_windows().values() {
        any_supported |= apply_screen_capture_protection_to_window(window)?;
    }

    Ok(any_supported)
}

#[tauri::command]
fn enable_screen_capture_protection(app: AppHandle) -> Result<bool, String> {
    apply_screen_capture_protection(&app)
}

#[derive(serde::Serialize)]
struct LinuxSecurityStatus {
    is_x11: bool,
    is_recording: bool,
}

#[tauri::command]
fn get_linux_security_status() -> Result<Option<LinuxSecurityStatus>, String> {
    #[cfg(target_os = "linux")]
    {
        let is_x11 = linux_security::get_linux_display_server() == "x11";
        let is_recording = linux_security::check_linux_screen_recording();
        Ok(Some(LinuxSecurityStatus {
            is_x11,
            is_recording,
        }))
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(None)
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn write_clipboard_text_protected(text: String) -> Result<bool, String> {
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
    };
    use windows_sys::Win32::System::Memory::{
        GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE,
    };

    extern "system" {
        fn GlobalFree(hmem: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    }

    // Unicode Text Format ID is 13 (CF_UNICODETEXT)
    const CF_UNICODETEXT: u32 = 13;

    // Convert text to wide string (UTF-16) with null terminator
    let wide_text: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();

    // Register exclusion formats
    let format_exclude_monitor_name: Vec<u16> = "ExcludeClipboardContentFromMonitorProcessing"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let format_exclude_history_name: Vec<u16> = "CanIncludeInClipboardHistory"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let format_exclude_cloud_name: Vec<u16> = "CanUploadToCloudClipboard"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let fmt_monitor = RegisterClipboardFormatW(format_exclude_monitor_name.as_ptr());
        let fmt_history = RegisterClipboardFormatW(format_exclude_history_name.as_ptr());
        let fmt_cloud = RegisterClipboardFormatW(format_exclude_cloud_name.as_ptr());

        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return Err("Failed to open clipboard".to_string());
        }

        // Empty the clipboard first
        EmptyClipboard();

        // Helper to write data to clipboard with proper error memory cleanup
        let write_to_clipboard = |format: u32, data: &[u8]| -> Result<(), String> {
            let hmem = GlobalAlloc(GMEM_MOVEABLE, data.len());
            if hmem.is_null() {
                return Err("Failed to allocate global memory".to_string());
            }
            let ptr = GlobalLock(hmem);
            if ptr.is_null() {
                GlobalFree(hmem);
                return Err("Failed to lock global memory".to_string());
            }
            std::ptr::copy_nonoverlapping(data.as_ptr(), ptr as *mut u8, data.len());
            GlobalUnlock(hmem);
            if SetClipboardData(format, hmem).is_null() {
                GlobalFree(hmem);
                return Err(format!(
                    "Failed to set clipboard data for format {}",
                    format
                ));
            }
            Ok(())
        };

        // 1. Write the Unicode text
        let text_bytes = std::slice::from_raw_parts(
            wide_text.as_ptr() as *const u8,
            wide_text.len() * std::mem::size_of::<u16>(),
        );
        if let Err(e) = write_to_clipboard(CF_UNICODETEXT, text_bytes) {
            CloseClipboard();
            return Err(e);
        }

        // 2. Write exclusion flags (DWORD = 0)
        let zero_dword: u32 = 0;
        let dword_bytes = std::slice::from_raw_parts(
            &zero_dword as *const u32 as *const u8,
            std::mem::size_of::<u32>(),
        );

        if fmt_monitor != 0 {
            let _ = write_to_clipboard(fmt_monitor, dword_bytes);
        }
        if fmt_history != 0 {
            let _ = write_to_clipboard(fmt_history, dword_bytes);
        }
        if fmt_cloud != 0 {
            let _ = write_to_clipboard(fmt_cloud, dword_bytes);
        }

        CloseClipboard();
    }

    Ok(true)
}

/// Non-Windows desktop platforms (macOS/Linux): returns Ok(false) so the frontend
/// gracefully falls back to `navigator.clipboard` with active 30s overwrite timers
/// (`useClipboardFeedback`).
#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn write_clipboard_text_protected(_text: String) -> Result<bool, String> {
    Ok(false)
}

fn vault_database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data directory: {error}"))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("failed to create app data directory: {error}"))?;

    Ok(app_data_dir.join(VAULT_DATABASE_FILENAME))
}

#[cfg(target_os = "windows")]
fn replace_file_atomically(
    tmp_path: &std::path::Path,
    target_path: &std::path::Path,
) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let mut tmp_wide: Vec<u16> = tmp_path.as_os_str().encode_wide().collect();
    tmp_wide.push(0);
    let mut target_wide: Vec<u16> = target_path.as_os_str().encode_wide().collect();
    target_wide.push(0);

    let moved = unsafe {
        MoveFileExW(
            tmp_wide.as_ptr(),
            target_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };

    if moved == 0 {
        return Err(format!(
            "failed to atomically replace vault database: {}",
            std::io::Error::last_os_error()
        ));
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn replace_file_atomically(
    tmp_path: &std::path::Path,
    target_path: &std::path::Path,
) -> Result<(), String> {
    fs::rename(tmp_path, target_path)
        .map_err(|error| format!("failed to atomically replace vault database: {error}"))
}

#[tauri::command]
fn read_vault_database(app: AppHandle) -> Result<Option<String>, String> {
    // #42: deliberately NOT gated on `CredentialSession`.
    //
    // The session is created by `open_rust_session`, which runs *after* the
    // renderer has read the vault to obtain the salt and Argon2 hash needed to
    // verify the password. `verifyMasterPassword` calls `initializeStorage()`
    // first, which reaches this command. Gating it would make unlocking
    // impossible — the read that bootstraps the session cannot require the
    // session.
    //
    // The storage read is also not secret to the renderer in the way the
    // commands below are: the file is the user's own encrypted vault, and the
    // renderer already has filesystem-mediated access to its own app data.
    // The privilege that genuinely requires an unlocked vault is the
    // extension bridge, and those commands are gated.
    let database_path = vault_database_path(&app)?;

    if !database_path.exists() {
        return Ok(None);
    }

    let metadata = fs::metadata(&database_path)
        .map_err(|error| format!("failed to read vault database metadata: {error}"))?;

    if metadata.len() > MAX_VAULT_FILE_BYTES {
        return Err(format!(
            "vault database file size ({} MB) exceeds the maximum allowed limit of {} MB",
            metadata.len() / (1024 * 1024),
            MAX_VAULT_FILE_BYTES / (1024 * 1024)
        ));
    }

    fs::read_to_string(database_path)
        .map(Some)
        .map_err(|error| format!("failed to read vault database: {error}"))
}

#[tauri::command]
fn write_vault_database(app: AppHandle, contents: String) -> Result<(), String> {
    // #42: not gated — see the note on `read_vault_database`. A write can occur
    // during first-time setup, which also precedes any session.
    let database_path = vault_database_path(&app)?;
    write_vault_database_file(&database_path, &contents)
}

fn write_vault_database_file(
    database_path: &std::path::Path,
    contents: &str,
) -> Result<(), String> {
    // Y-17: the write path had no size ceiling while the read path refused
    // files above MAX_VAULT_FILE_BYTES — an oversized write made the vault
    // permanently unreadable. Enforce the same limit on both sides.
    if (contents.len() as u64) > MAX_VAULT_FILE_BYTES {
        return Err(format!(
            "vault database payload ({} MB) exceeds the maximum allowed limit of {} MB",
            contents.len() / (1024 * 1024),
            MAX_VAULT_FILE_BYTES / (1024 * 1024)
        ));
    }

    let tmp_path = database_path.with_extension(format!("tmp-{}", std::process::id()));

    {
        use std::io::Write;

        let mut tmp_file = fs::File::create(&tmp_path)
            .map_err(|error| format!("failed to create temporary vault database: {error}"))?;
        tmp_file
            .write_all(contents.as_bytes())
            .map_err(|error| format!("failed to write temporary vault database: {error}"))?;
        tmp_file
            .sync_all()
            .map_err(|error| format!("failed to sync temporary vault database: {error}"))?;
    }

    if let Err(error) = replace_file_atomically(&tmp_path, database_path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(error);
    }

    if let Some(parent) = database_path.parent() {
        if let Ok(directory) = fs::File::open(parent) {
            let _ = directory.sync_all();
        }
    }

    Ok(())
}

#[tauri::command]
fn reset_vault_database(app: AppHandle) -> Result<(), String> {
    // #42: not gated on `CredentialSession`, because `resetAll` also runs during
    // first-time setup and system reset, both of which precede a session. The
    // renderer-side gate in `resetSystem` is what requires an unlocked vault
    // before this is reachable.
    let database_path = vault_database_path(&app)?;

    if database_path.exists() {
        fs::remove_file(database_path)
            .map_err(|error| format!("failed to remove vault database: {error}"))?;
    }

    Ok(())
}

#[tauri::command]
fn sync_extension_credentials(
    state: tauri::State<'_, ExtensionState>,
    session: tauri::State<'_, CredentialSession>,
    credentials: Vec<native_messaging::ExtensionCredential>,
    ttl_ms: Option<u64>,
) -> Result<(), String> {
    // #42: pushing credentials into the extension cache is a vault-adjacent
    // write. Without a session a locked renderer could seed the cache that the
    // extension bridge then hands out over loopback IPC.
    session.require_active_session()?;

    let lease_expires_at = native_messaging::credential_lease_expires_at(
        ttl_ms.unwrap_or(native_messaging::EXTENSION_CREDENTIAL_LEASE_MS),
    );
    let cache = native_messaging::ExtensionCredentialCache {
        credentials,
        expires_at_epoch_ms: lease_expires_at,
    };
    {
        let mut creds = state.credentials.lock().map_err(|e| e.to_string())?;
        *creds = Some(cache);
    }
    Ok(())
}

#[tauri::command]
fn clear_extension_credentials(
    state: tauri::State<'_, ExtensionState>,
    session: tauri::State<'_, CredentialSession>,
) -> Result<(), String> {
    // #42: gated for symmetry. Clearing is not destructive to vault data, but
    // leaving it ungated would mean the gate can be side-stepped by toggling
    // the cache from a locked renderer.
    session.require_active_session()?;

    let mut creds = state.credentials.lock().map_err(|e| e.to_string())?;
    *creds = None;
    Ok(())
}

#[tauri::command]
fn rotate_pairing_token(
    state: tauri::State<'_, ExtensionState>,
    session: tauri::State<'_, CredentialSession>,
) -> Result<String, String> {
    // #42: rotating the pairing token is a privilege change for the extension
    // bridge. A locked renderer must not be able to mint a new token.
    session.require_active_session()?;

    // #43: this goes through `rotate_pairing_token_now` so the retire-every-
    // session step cannot be skipped. A token rotation only closes the door to
    // *future* handshakes on its own; without the generation bump an
    // extension that had already authenticated kept its derived session key
    // and went on reading credentials after the user rotated the token away
    // from it.
    let token_path = native_messaging::get_app_data_dir()
        .map(|dir| dir.join(native_messaging::TOKEN_FILENAME))
        .ok_or_else(|| "failed to resolve app data directory".to_string())?;

    let new_token = native_messaging::rotate_pairing_token_now(
        &state.pairing_token,
        &state.session_generation,
        Some(token_path),
    )
    .map_err(|e| format!("failed to write pairing token to file: {e}"))?;

    Ok(new_token)
}

#[cfg(target_os = "windows")]
fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(not(target_os = "windows"))]
fn wide_null(_value: &str) -> Vec<u16> {
    Vec::new()
}

#[cfg(target_os = "windows")]
fn dialog_filter() -> Vec<u16> {
    "Supported vault files (*.aegis;*.json;*.csv)\0*.aegis;*.json;*.csv\0Aegis backups (*.aegis)\0*.aegis\0JSON backups (*.json)\0*.json\0CSV imports (*.csv)\0*.csv\0All files (*.*)\0*.*\0\0"
    .encode_utf16()
    .collect()
}

#[cfg(not(target_os = "windows"))]
fn dialog_filter() -> Vec<u16> {
    Vec::new()
}

#[cfg(target_os = "windows")]
fn attachment_dialog_filter() -> Vec<u16> {
    "All files (*.*)\0*.*\0\0".encode_utf16().collect()
}

#[cfg(not(target_os = "windows"))]
fn attachment_dialog_filter() -> Vec<u16> {
    Vec::new()
}

#[cfg(target_os = "windows")]
fn default_extension(default_filename: &str, fallback: &str) -> Vec<u16> {
    PathBuf::from(default_filename)
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(fallback)
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(not(target_os = "windows"))]
fn default_extension(_default_filename: &str, _fallback: &str) -> Vec<u16> {
    Vec::new()
}

#[cfg(target_os = "windows")]
fn path_from_dialog_buffer(buffer: &[u16]) -> Option<PathBuf> {
    let len = buffer.iter().position(|value| *value == 0)?;
    if len == 0 {
        return None;
    }
    Some(PathBuf::from(String::from_utf16_lossy(&buffer[..len])))
}

#[cfg(target_os = "windows")]
fn native_save_file_path(
    default_filename: &str,
    filter: Vec<u16>,
    default_ext: Vec<u16>,
) -> Result<Option<PathBuf>, String> {
    use windows_sys::Win32::UI::Controls::Dialogs::{
        GetSaveFileNameW, OFN_EXPLORER, OFN_NOCHANGEDIR, OFN_OVERWRITEPROMPT, OFN_PATHMUSTEXIST,
        OPENFILENAMEW,
    };

    let mut file_buffer = vec![0u16; FILE_DIALOG_BUFFER_LEN];
    for (index, unit) in default_filename
        .encode_utf16()
        .take(FILE_DIALOG_BUFFER_LEN - 1)
        .enumerate()
    {
        file_buffer[index] = unit;
    }

    let mut dialog = OPENFILENAMEW {
        lStructSize: std::mem::size_of::<OPENFILENAMEW>() as u32,
        lpstrFilter: filter.as_ptr(),
        lpstrFile: file_buffer.as_mut_ptr(),
        nMaxFile: file_buffer.len() as u32,
        lpstrDefExt: default_ext.as_ptr(),
        Flags: OFN_EXPLORER | OFN_NOCHANGEDIR | OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST,
        ..OPENFILENAMEW::default()
    };

    let selected = unsafe { GetSaveFileNameW(&mut dialog) != 0 };
    if !selected {
        return Ok(None);
    }

    Ok(path_from_dialog_buffer(&file_buffer))
}

#[cfg(target_os = "windows")]
fn native_open_file_path() -> Result<Option<PathBuf>, String> {
    use windows_sys::Win32::UI::Controls::Dialogs::{
        GetOpenFileNameW, OFN_EXPLORER, OFN_FILEMUSTEXIST, OFN_NOCHANGEDIR, OFN_PATHMUSTEXIST,
        OPENFILENAMEW,
    };

    let mut file_buffer = vec![0u16; FILE_DIALOG_BUFFER_LEN];
    let filter = dialog_filter();
    let mut dialog = OPENFILENAMEW {
        lStructSize: std::mem::size_of::<OPENFILENAMEW>() as u32,
        lpstrFilter: filter.as_ptr(),
        lpstrFile: file_buffer.as_mut_ptr(),
        nMaxFile: file_buffer.len() as u32,
        Flags: OFN_EXPLORER | OFN_FILEMUSTEXIST | OFN_NOCHANGEDIR | OFN_PATHMUSTEXIST,
        ..OPENFILENAMEW::default()
    };

    let selected = unsafe { GetOpenFileNameW(&mut dialog) != 0 };
    if !selected {
        return Ok(None);
    }

    Ok(path_from_dialog_buffer(&file_buffer))
}

#[cfg(not(target_os = "windows"))]
fn native_save_file_path(
    _default_filename: &str,
    _filter: Vec<u16>,
    _default_ext: Vec<u16>,
) -> Result<Option<PathBuf>, String> {
    Err("native file dialogs are only implemented for Windows desktop builds".to_string())
}

#[cfg(not(target_os = "windows"))]
fn native_open_file_path() -> Result<Option<PathBuf>, String> {
    Err("native file dialogs are only implemented for Windows desktop builds".to_string())
}

#[tauri::command]
fn save_export_file(default_filename: String, contents: String) -> Result<bool, String> {
    let Some(path) = native_save_file_path(
        &default_filename,
        dialog_filter(),
        if default_filename.ends_with(".json") {
            wide_null("json")
        } else {
            wide_null("aegis")
        },
    )?
    else {
        return Ok(false);
    };

    fs::write(path, contents).map_err(|error| format!("failed to save export file: {error}"))?;
    Ok(true)
}

#[tauri::command]
fn save_binary_file(default_filename: String, contents_base64: String) -> Result<bool, String> {
    let Some(path) = native_save_file_path(
        &default_filename,
        attachment_dialog_filter(),
        default_extension(&default_filename, "bin"),
    )?
    else {
        return Ok(false);
    };

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(contents_base64)
        .map_err(|error| format!("failed to decode binary file payload: {error}"))?;

    fs::write(path, bytes).map_err(|error| format!("failed to save binary file: {error}"))?;
    Ok(true)
}

/// #42: largest import file accepted from the native file dialog.
///
/// Import payloads are user-selected JSON, so this is generous relative to real
/// exports, but it is not optional: `fs::read_to_string` allocates the whole
/// file, so an oversized or sparse selection aborts the process.
const MAX_IMPORT_FILE_BYTES: u64 = 25 * 1024 * 1024; // 25 MB
/// Reads at most `max_bytes` from `reader`, then requires valid UTF-8.
///
/// Split out from `read_text_file_bounded` so the *stream* bound is directly
/// testable. Testing it through a real file cannot prove anything: the
/// `stat`-based pre-check rejects an oversized file first, so removing this
/// bound leaves every file-based test green. A synthetic reader that yields
/// more than the cap is the only way to exercise it.
fn read_stream_bounded(
    reader: &mut impl std::io::Read,
    max_bytes: u64,
    label: &str,
) -> Result<String, String> {
    use std::io::Read;

    let mut limited = reader.take(max_bytes + 1);
    let mut buffer = Vec::new();
    limited
        .read_to_end(&mut buffer)
        .map_err(|error| format!("failed to read {label}: {error}"))?;

    if buffer.len() as u64 > max_bytes {
        return Err(format!(
            "{label} exceeds the maximum allowed size of {} MB",
            max_bytes / (1024 * 1024)
        ));
    }

    String::from_utf8(buffer).map_err(|_| format!("{label} is not valid UTF-8 text"))
}

/// Reads a text file, refusing anything over `max_bytes`.
///
/// The length is checked **before** reading so an obviously-oversized file is
/// rejected cheaply, and the stream is bounded independently so a file that
/// grows between the `stat` and the read — or a special file that reports a
/// small length — still cannot exhaust memory. A `stat`-only check would be a
/// TOCTOU hole.
fn read_text_file_bounded(
    path: &std::path::Path,
    max_bytes: u64,
    label: &str,
) -> Result<String, String> {
    if let Ok(metadata) = fs::metadata(path) {
        if metadata.len() > max_bytes {
            return Err(format!(
                "{label} ({} MB) exceeds the maximum allowed size of {} MB",
                metadata.len() / (1024 * 1024),
                max_bytes / (1024 * 1024)
            ));
        }
    }

    let mut file =
        fs::File::open(path).map_err(|error| format!("failed to open {label}: {error}"))?;
    read_stream_bounded(&mut file, max_bytes, label)
}

#[tauri::command]
fn open_import_file() -> Result<Option<ImportFilePayload>, String> {
    let Some(path) = native_open_file_path()? else {
        return Ok(None);
    };

    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("selected-import")
        .to_string();
    let contents = read_text_file_bounded(&path, MAX_IMPORT_FILE_BYTES, "import file")?;

    Ok(Some(ImportFilePayload { name, contents }))
}

use credential_handler::{get_params, CredentialSession, RustArgon2idOptions};

#[tauri::command]
fn derive_argon2id_key(
    mut password: String,
    salt: String,
    options: Option<RustArgon2idOptions>,
) -> Result<Vec<u8>, String> {
    use argon2::{Algorithm, Argon2, Version};

    // SEC-B3: the master password must never be left unscrubbed in the Rust
    // heap — zeroize it on every exit path (success and error).
    let params = get_params(options)?;
    let output_len = params.output_len().unwrap_or(32);
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut hash = vec![0u8; output_len];
    let derived = argon2
        .hash_password_into(password.as_bytes(), salt.as_bytes(), &mut hash)
        .map_err(|e| format!("Argon2id key derivation failed: {e}"));
    password.zeroize();
    derived?;
    Ok(hash)
}

#[tauri::command]
fn create_argon2id_hash(
    mut password: String,
    salt: String,
    options: Option<RustArgon2idOptions>,
) -> Result<String, String> {
    use argon2::password_hash::PasswordHasher;
    use argon2::{Algorithm, Argon2, Version};

    // SEC-B3: zeroize the master password on every exit path.
    let params = get_params(options)?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    // argon2 0.6: hash_password_with_salt takes the raw salt bytes. The salt
    // string is consumed as raw bytes, matching the KDF path in
    // derive_argon2id_key_internal (also raw bytes) — a consistent
    // interpretation across both call sites.
    let hashed = argon2
        .hash_password_with_salt(password.as_bytes(), salt.as_bytes())
        .map_err(|e| {
            password.zeroize();
            format!("Argon2id hashing failed: {e}")
        })?;
    let encoded = hashed.to_string();
    password.zeroize();
    Ok(encoded)
}

#[tauri::command]
fn verify_argon2id_hash(mut password: String, encoded_hash: String) -> Result<bool, String> {
    use argon2::{password_hash::phc::PasswordHash, password_hash::PasswordVerifier, Argon2};

    // SEC-B3: zeroize the master password on every exit path.
    let parsed_hash = PasswordHash::new(&encoded_hash).map_err(|e| {
        password.zeroize();
        format!("invalid password hash format: {e}")
    })?;

    let verified = Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok();
    password.zeroize();
    Ok(verified)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let is_native_host = args.iter().any(|arg| {
        arg == "--native-messaging-host"
            || arg.starts_with("chrome-extension://")
            || arg.ends_with("com.hafgit99.aegisvault7.json")
            || arg == "aegisvault7@hafgit99.com"
            || (arg.ends_with(".json") && args.iter().any(|a| a.contains('@')))
    });

    if is_native_host {
        native_messaging::run_host();
        return;
    }

    let credentials = std::sync::Arc::new(std::sync::Mutex::new(None));
    let initial_token = native_messaging::generate_token();
    let pairing_token = std::sync::Arc::new(std::sync::Mutex::new(initial_token.clone()));
    let session_generation = native_messaging::RevokeGeneration::new();
    let state = ExtensionState {
        credentials: credentials.clone(),
        pairing_token: pairing_token.clone(),
        session_generation: session_generation.clone(),
    };

    let credential_session = credential_handler::CredentialSession::default();
    let builder = tauri::Builder::default();
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(state)
        .manage(credential_session);

    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_biometric::init());

    let app = builder
        .on_page_load(|webview, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                let _ = webview.window().show();
            }
        })
        .setup(move |app| {
            if let Err(error) = apply_screen_capture_protection(app.handle()) {
                log::warn!("failed to enable screen capture protection: {error}");
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                        .max_file_size(5 * 1024 * 1024)
                        .build(),
                )?;
            }

            // Save initial pairing token to app data directory
            if let Some(app_data_dir) = native_messaging::get_app_data_dir() {
                let _ = fs::create_dir_all(&app_data_dir);
                let token_path = app_data_dir.join(native_messaging::TOKEN_FILENAME);
                let token = initial_token.clone();
                std::thread::spawn(move || {
                    let _ = native_messaging::write_pairing_token_file(&token_path, &token);
                });
            }

            // Start TCP server
            native_messaging::start_tcp_server(
                app.handle().clone(),
                pairing_token,
                credentials.clone(),
                session_generation,
            );

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_asset_integrity_anchor,
            record_asset_integrity_result,
            read_vault_database,
            write_vault_database,
            reset_vault_database,
            enable_screen_capture_protection,
            write_clipboard_text_protected,
            save_export_file,
            save_binary_file,
            open_import_file,
            sync_extension_credentials,
            clear_extension_credentials,
            rotate_pairing_token,
            derive_argon2id_key,
            create_argon2id_hash,
            verify_argon2id_hash,
            get_linux_security_status,
            credential_handler::open_rust_session,
            credential_handler::setup_rust_session,
            credential_handler::rotate_rust_session,
            credential_handler::close_rust_session,
            credential_handler::update_rust_active_vault_key,
            credential_handler::has_rust_session,
            restart_app
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            std::process::exit(0);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    // ─── #42: bounded import file reading ───────────────────────────────────

    fn temp_path(name: &str) -> std::path::PathBuf {
        let mut dir = std::env::temp_dir();
        dir.push(format!("aegis-import-test-{}-{}", std::process::id(), name));
        dir
    }

    #[test]
    fn import_reader_accepts_a_file_within_the_limit() {
        let path = temp_path("within.bin");
        fs::write(&path, br#"{"items":[]}"#).expect("write");

        let contents = read_text_file_bounded(&path, 1024, "import file").expect("must accept");

        assert_eq!(contents, r#"{"items":[]}"#);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn import_reader_rejects_an_oversized_file_before_reading_it() {
        let path = temp_path("oversized.bin");
        // Written sparsely-ish: the point is the length check, not the content.
        fs::write(&path, vec![b'a'; 4096]).expect("write");

        let error = read_text_file_bounded(&path, 1024, "import file")
            .expect_err("must refuse an oversized import");

        assert!(
            error.contains("exceeds the maximum allowed size"),
            "got: {error}"
        );
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn import_reader_refuses_when_the_stream_is_longer_than_the_limit() {
        // A real file whose stream exceeds the limit is rejected by the pre-check,
        // which is the cheap path. The stream bound itself is covered by
        // `stream_bound_refuses_a_reader_that_yields_more_than_the_cap`, since no
        // on-disk file can distinguish the two.
        let path = temp_path("grew.bin");
        fs::write(&path, vec![b'a'; 4096]).expect("write");

        let error = read_text_file_bounded(&path, 2048, "import file")
            .expect_err("must refuse an oversized import");

        assert!(
            error.contains("exceeds the maximum allowed size"),
            "got: {error}"
        );
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn import_reader_accepts_a_file_exactly_at_the_limit() {
        let path = temp_path("exact.bin");
        fs::write(&path, vec![b'a'; 2048]).expect("write");

        let contents = read_text_file_bounded(&path, 2048, "import file")
            .expect("a file exactly at the cap is allowed");

        assert_eq!(contents.len(), 2048);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn import_reader_rejects_non_utf8_content() {
        // Invalid UTF-8 must be a clear error, not a panic or a lossy decode.
        let path = temp_path("binary.bin");
        fs::write(&path, [0xff, 0xfe, 0x00, 0x01]).expect("write");

        let error = read_text_file_bounded(&path, 4096, "import file")
            .expect_err("must refuse binary content");

        assert!(error.contains("not valid UTF-8"), "got: {error}");
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn stream_bound_refuses_a_reader_that_yields_more_than_the_cap() {
        // This is the invariant the `stat` pre-check cannot cover, and the reason
        // `read_stream_bounded` exists as a separate function: the reader reports
        // no size, so only the stream bound can stop it.
        struct Endless {
            remaining: usize,
        }
        impl std::io::Read for Endless {
            fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
                if self.remaining == 0 {
                    return Ok(0);
                }
                let n = buf.len().min(self.remaining);
                for slot in buf.iter_mut().take(n) {
                    *slot = b'a';
                }
                self.remaining -= n;
                Ok(n)
            }
        }

        // Claims nothing about its size, yet yields far more than the cap.
        let mut endless = Endless {
            remaining: 1024 * 1024,
        };
        let error = read_stream_bounded(&mut endless, 2048, "import file")
            .expect_err("must refuse a stream longer than the cap");

        assert!(
            error.contains("exceeds the maximum allowed size"),
            "got: {error}"
        );
    }

    #[test]
    fn stream_bound_accepts_a_reader_exactly_at_the_cap() {
        struct Exact {
            remaining: usize,
        }
        impl std::io::Read for Exact {
            fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
                if self.remaining == 0 {
                    return Ok(0);
                }
                let n = buf.len().min(self.remaining);
                for slot in buf.iter_mut().take(n) {
                    *slot = b'a';
                }
                self.remaining -= n;
                Ok(n)
            }
        }

        let mut exact = Exact { remaining: 2048 };
        let contents = read_stream_bounded(&mut exact, 2048, "import file")
            .expect("exactly at the cap is allowed");

        assert_eq!(contents.len(), 2048);
    }

    #[test]
    fn stream_bound_rejects_non_utf8() {
        let mut binary: &[u8] = &[0xff, 0xfe, 0x00, 0x01];
        let error = read_stream_bounded(&mut binary, 4096, "import file")
            .expect_err("binary content must be refused");

        assert!(error.contains("not valid UTF-8"), "got: {error}");
    }

    #[test]
    fn import_reader_reports_a_missing_file_clearly() {
        let path = temp_path("missing.bin");
        let _ = fs::remove_file(&path);

        let error = read_text_file_bounded(&path, 4096, "import file")
            .expect_err("a missing file must error");

        assert!(error.contains("failed to open import file"), "got: {error}");
    }

    #[test]
    fn import_limit_matches_the_vault_file_limit() {
        // Same order of magnitude as the vault file, so a legitimate encrypted
        // backup can always be imported.
        assert_eq!(MAX_IMPORT_FILE_BYTES, MAX_VAULT_FILE_BYTES);
    }
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_test_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "aegis-vault-v7-{name}-{}-{nanos}",
            std::process::id()
        ))
    }

    #[test]
    fn write_vault_database_file_replaces_existing_contents_and_removes_temp_file() {
        let dir = unique_test_dir("atomic-success");
        fs::create_dir_all(&dir).expect("test directory should be created");
        let database_path = dir.join(VAULT_DATABASE_FILENAME);
        fs::write(&database_path, "old vault contents")
            .expect("existing database should be written");
        let tmp_path = database_path.with_extension(format!("tmp-{}", std::process::id()));

        write_vault_database_file(&database_path, "new vault contents")
            .expect("database write should succeed");

        let contents = fs::read_to_string(&database_path).expect("database should be readable");
        assert_eq!(contents, "new vault contents");
        assert!(
            !tmp_path.exists(),
            "temporary database file should not remain after atomic replace"
        );

        fs::remove_dir_all(&dir).expect("test directory should be removed");
    }

    #[test]
    fn write_vault_database_file_preserves_existing_contents_when_temp_create_fails() {
        let dir = unique_test_dir("atomic-temp-failure");
        fs::create_dir_all(&dir).expect("test directory should be created");
        let database_path = dir.join(VAULT_DATABASE_FILENAME);
        fs::write(&database_path, "old vault contents")
            .expect("existing database should be written");
        let tmp_path = database_path.with_extension(format!("tmp-{}", std::process::id()));
        fs::create_dir(&tmp_path).expect("temp path directory should block File::create");

        let result = write_vault_database_file(&database_path, "new vault contents");

        assert!(
            result.is_err(),
            "database write should fail when temp file cannot be created"
        );
        let contents = fs::read_to_string(&database_path).expect("database should remain readable");
        assert_eq!(contents, "old vault contents");

        fs::remove_dir_all(&dir).expect("test directory should be removed");
    }

    #[test]
    fn sanitize_asset_integrity_reason_keeps_every_real_reason_intact() {
        // The whole point of the diagnostic is to survive being read back, so
        // every reason the frontend can produce has to come out unchanged.
        for reason in [
            "debug-build",
            "browser-runtime",
            "android-signed-package",
            "native-anchor-unavailable",
            "native-anchor-invalid",
            "manifest-unavailable",
            "manifest-invalid",
            "index-html-unlisted",
            "manifest-root-mismatch",
            "asset-unavailable",
            "asset-size-mismatch",
            "asset-hash-mismatch",
            "asset-verification-failed",
            "index-html-unverified",
            "unlisted-asset-reference",
            "asset-integrity-unverifiable",
        ] {
            assert_eq!(
                sanitize_asset_integrity_reason(reason).as_deref(),
                Some(reason),
                "reason {reason} should survive sanitisation unchanged"
            );
        }
    }

    #[test]
    fn sanitize_asset_integrity_reason_strips_anything_that_is_not_a_code_character() {
        // `reason` comes from the webview, so this is the boundary that stops a
        // script from writing arbitrary content into a file on disk.
        assert_eq!(
            sanitize_asset_integrity_reason("asset-hash-mismatch\n../../evil").as_deref(),
            Some("asset-hash-mismatchevil")
        );
        assert_eq!(
            sanitize_asset_integrity_reason("  spaces  and\ttabs\n").as_deref(),
            Some("spacesandtabs")
        );
        assert_eq!(
            sanitize_asset_integrity_reason("drop\r\ntable").as_deref(),
            Some("droptable")
        );
        // Uppercase is dropped rather than lowercased: the filter is a
        // whitelist, not a transform, so `Reason-With-Case` loses its `R`, `W`
        // and `C`. The real reasons are all lowercase, so nothing is lost in
        // practice, and lowercasing would make the function accept shapes the
        // reason codes do not have.
        assert_eq!(
            sanitize_asset_integrity_reason("Reason-With-Case").as_deref(),
            Some("eason-ith-ase")
        );
    }

    #[test]
    fn sanitize_asset_integrity_reason_rejects_input_with_nothing_to_record() {
        // Writing an empty file would be worse than not writing: it would read
        // as a verdict on a run that never happened.
        // `<script>` is *not* here: the filter keeps the letters and drops the
        // angle brackets, so it records "script". That is fine for a one-line
        // diagnostic in a fixed location — the file is never rendered as HTML
        // and never used as a path — and pretending otherwise here would assert
        // a guarantee the function does not make.
        for reason in ["", "   ", "\n\r\t", "//////", "..\\..\\..", "!!!", "..."] {
            assert_eq!(
                sanitize_asset_integrity_reason(reason),
                None,
                "reason {reason:?} should be refused rather than recorded as empty"
            );
        }
    }

    #[test]
    fn sanitize_asset_integrity_reason_neutralises_a_traversal_attempt() {
        // A path is not a reason code, but the filter is a character whitelist
        // rather than a lookup, so the separators are dropped instead of the
        // input being rejected. Worth pinning: the result must not be usable as
        // a path, whatever the caller sent.
        assert_eq!(
            sanitize_asset_integrity_reason("../../etc/passwd").as_deref(),
            Some("etcpasswd")
        );
        assert_eq!(
            sanitize_asset_integrity_reason("..\\..\\Windows\\System32").as_deref(),
            Some("indowsystem32")
        );
    }

    #[test]
    fn sanitize_asset_integrity_reason_caps_the_length() {
        let long = "a".repeat(500);
        let sanitized =
            sanitize_asset_integrity_reason(&long).expect("a long code is still usable");
        assert_eq!(
            sanitized.len(),
            64,
            "recorded reason should be length-capped"
        );
    }
}
