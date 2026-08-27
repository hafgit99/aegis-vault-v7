use base64::Engine;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, WebviewWindow};

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
    let database_path = vault_database_path(&app)?;
    write_vault_database_file(&database_path, &contents)
}

fn write_vault_database_file(
    database_path: &std::path::Path,
    contents: &str,
) -> Result<(), String> {
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
    credentials: Vec<native_messaging::ExtensionCredential>,
    ttl_ms: Option<u64>,
) -> Result<(), String> {
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
fn clear_extension_credentials(state: tauri::State<'_, ExtensionState>) -> Result<(), String> {
    let mut creds = state.credentials.lock().map_err(|e| e.to_string())?;
    *creds = None;
    Ok(())
}

#[tauri::command]
fn rotate_pairing_token(state: tauri::State<'_, ExtensionState>) -> Result<String, String> {
    let new_token = native_messaging::generate_token();

    if let Some(app_data_dir) = native_messaging::get_app_data_dir() {
        let _ = fs::create_dir_all(&app_data_dir);
        let token_path = app_data_dir.join(native_messaging::TOKEN_FILENAME);
        native_messaging::write_pairing_token_file(&token_path, &new_token)
            .map_err(|e| format!("failed to write pairing token to file: {e}"))?;
    } else {
        return Err("failed to resolve app data directory".to_string());
    }

    let mut token_guard = state.pairing_token.lock().map_err(|e| e.to_string())?;
    *token_guard = new_token.clone();

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
    let contents =
        fs::read_to_string(path).map_err(|error| format!("failed to read import file: {error}"))?;

    Ok(Some(ImportFilePayload { name, contents }))
}

use credential_handler::{get_params, RustArgon2idOptions};

#[tauri::command]
fn derive_argon2id_key(
    password: String,
    salt: String,
    options: Option<RustArgon2idOptions>,
) -> Result<Vec<u8>, String> {
    use argon2::{Algorithm, Argon2, Version};

    let params = get_params(options)?;
    let output_len = params.output_len().unwrap_or(32);
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut hash = vec![0u8; output_len];
    argon2
        .hash_password_into(password.as_bytes(), salt.as_bytes(), &mut hash)
        .map_err(|e| format!("Argon2id key derivation failed: {e}"))?;
    Ok(hash)
}

#[tauri::command]
fn create_argon2id_hash(
    password: String,
    salt: String,
    options: Option<RustArgon2idOptions>,
) -> Result<String, String> {
    use argon2::{
        password_hash::{PasswordHasher, SaltString},
        Algorithm, Argon2, Version,
    };

    let params = get_params(options)?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let salt_string = SaltString::from_b64(&salt)
        .or_else(|_| SaltString::encode_b64(salt.as_bytes()))
        .map_err(|e| format!("invalid salt format: {e}"))?;

    let hash = argon2
        .hash_password(password.as_bytes(), &salt_string)
        .map_err(|e| format!("Argon2id hashing failed: {e}"))?;
    Ok(hash.to_string())
}

#[tauri::command]
fn verify_argon2id_hash(password: String, encoded_hash: String) -> Result<bool, String> {
    use argon2::{
        password_hash::{PasswordHash, PasswordVerifier},
        Argon2,
    };

    let parsed_hash = PasswordHash::new(&encoded_hash)
        .map_err(|e| format!("invalid password hash format: {e}"))?;

    let verified = Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok();
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
    let state = ExtensionState {
        credentials: credentials.clone(),
        pairing_token: pairing_token.clone(),
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
            );

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_asset_integrity_anchor,
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
}
