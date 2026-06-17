use base64::Engine;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, WebviewWindow};

mod native_messaging;

const VAULT_DATABASE_FILENAME: &str = "aegis_sqlite.db";
const FILE_DIALOG_BUFFER_LEN: usize = 32768;

struct ExtensionState {
    credentials:
        std::sync::Arc<std::sync::Mutex<Option<native_messaging::ExtensionCredentialCache>>>,
}

#[derive(serde::Serialize)]
struct ImportFilePayload {
    name: String,
    contents: String,
}

#[cfg(target_os = "windows")]
fn apply_screen_capture_protection_to_window(
    window: &WebviewWindow,
) -> Result<bool, String> {
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

#[cfg(not(target_os = "windows"))]
fn apply_screen_capture_protection_to_window(
    _window: &WebviewWindow,
) -> Result<bool, String> {
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

fn vault_database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data directory: {error}"))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("failed to create app data directory: {error}"))?;

    Ok(app_data_dir.join(VAULT_DATABASE_FILENAME))
}

#[tauri::command]
fn read_vault_database(app: AppHandle) -> Result<Option<String>, String> {
    let database_path = vault_database_path(&app)?;

    if !database_path.exists() {
        return Ok(None);
    }

    fs::read_to_string(database_path)
        .map(Some)
        .map_err(|error| format!("failed to read vault database: {error}"))
}

#[tauri::command]
fn write_vault_database(app: AppHandle, contents: String) -> Result<(), String> {
    let database_path = vault_database_path(&app)?;
    fs::write(database_path, contents)
        .map_err(|error| format!("failed to write vault database: {error}"))
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
    let mut creds = state.credentials.lock().map_err(|e| e.to_string())?;
    *creds = Some(native_messaging::ExtensionCredentialCache {
        credentials,
        expires_at_epoch_ms: native_messaging::credential_lease_expires_at(
            ttl_ms.unwrap_or(native_messaging::EXTENSION_CREDENTIAL_LEASE_MS),
        ),
    });
    Ok(())
}

#[tauri::command]
fn clear_extension_credentials(state: tauri::State<'_, ExtensionState>) -> Result<(), String> {
    let mut creds = state.credentials.lock().map_err(|e| e.to_string())?;
    *creds = None;
    Ok(())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let is_native_host = args.iter().any(|arg| arg == "--native-messaging-host")
        || (args.len() >= 2 && args[1].starts_with("chrome-extension://"))
        || (args.len() >= 3 && args[1].ends_with(".json") && args[2].contains('@'));

    if is_native_host {
        native_messaging::run_host();
        return;
    }

    let credentials = std::sync::Arc::new(std::sync::Mutex::new(None));
    let state = ExtensionState {
        credentials: credentials.clone(),
    };

    let builder = tauri::Builder::default().manage(state);

    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_biometric::init());

    builder
        .setup(move |app| {
            if let Err(error) = apply_screen_capture_protection(app.handle()) {
                log::warn!("failed to enable screen capture protection: {error}");
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Generate pairing token
            let token = native_messaging::generate_token();

            // Save pairing token to app data directory
            if let Some(app_data_dir) = native_messaging::get_app_data_dir() {
                let _ = fs::create_dir_all(&app_data_dir);
                let token_path = app_data_dir.join(native_messaging::TOKEN_FILENAME);
                let _ = fs::write(&token_path, &token);
            }

            // Start TCP server
            native_messaging::start_tcp_server(app.handle().clone(), token, credentials.clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_vault_database,
            write_vault_database,
            reset_vault_database,
            enable_screen_capture_protection,
            save_export_file,
            save_binary_file,
            open_import_file,
            sync_extension_credentials,
            clear_extension_credentials
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
