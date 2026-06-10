use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const VAULT_DATABASE_FILENAME: &str = "aegis_sqlite.db";

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      read_vault_database,
      write_vault_database,
      reset_vault_database
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
