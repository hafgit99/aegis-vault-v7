use std::fs;
use std::io::{self, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;

pub const TCP_PORT: u16 = 49155;
pub const TOKEN_FILENAME: &str = "aegis_ipc_token.bin";

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ExtensionCredential {
    pub id: String,
    pub title: String,
    pub username: String,
    pub password: String,
    pub url: String,
    pub category: String,
    #[serde(default)]
    pub favorite: bool,
}

pub struct ExtensionState {
    pub credentials: Arc<Mutex<Option<Vec<ExtensionCredential>>>>,
    pub pairing_token: String,
}

impl ExtensionState {
    pub fn new(token: String) -> Self {
        Self {
            credentials: Arc::new(Mutex::new(None)),
            pairing_token: token,
        }
    }
}

pub fn get_app_data_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("APPDATA")
            .ok()
            .map(|appdata| PathBuf::from(appdata).join("com.hafgit99.aegisvault7"))
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var("HOME").ok().map(|home| {
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("com.hafgit99.aegisvault7")
        })
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        std::env::var("HOME").ok().map(|home| {
            PathBuf::from(home)
                .join(".config")
                .join("com.hafgit99.aegisvault7")
        })
    }
}

pub fn generate_token() -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    std::time::SystemTime::now().hash(&mut hasher);
    std::process::id().hash(&mut hasher);
    let temp = 42;
    (&temp as *const i32).hash(&mut hasher);

    format!("{:016x}{:016x}", hasher.finish(), {
        let mut h2 = DefaultHasher::new();
        "aegis-vault-secure-token-salt".hash(&mut h2);
        std::time::Instant::now().hash(&mut h2);
        h2.finish()
    })
}

pub fn start_tcp_server(
    app_handle: tauri::AppHandle,
    pairing_token: String,
    credentials: Arc<Mutex<Option<Vec<ExtensionCredential>>>>,
) {
    thread::spawn(move || {
        let listener = match TcpListener::bind(format!("127.0.0.1:{}", TCP_PORT)) {
            Ok(l) => l,
            Err(e) => {
                log::error!("Failed to bind TCP server to port {}: {}", TCP_PORT, e);
                return;
            }
        };

        log::info!("TCP IPC server bound to port {}", TCP_PORT);

        for stream in listener.incoming() {
            match stream {
                Ok(mut stream) => {
                    let credentials_clone = credentials.clone();
                    let token_clone = pairing_token.clone();
                    let app_clone = app_handle.clone();
                    thread::spawn(move || {
                        if let Err(e) =
                            handle_client(app_clone, &mut stream, &token_clone, credentials_clone)
                        {
                            log::debug!("TCP connection error: {}", e);
                        }
                    });
                }
                Err(e) => {
                    log::error!("TCP client connection accept failed: {}", e);
                }
            }
        }
    });
}

fn get_hostname(url_str: &str) -> String {
    let mut clean = url_str.to_lowercase();
    // Remove protocol
    if let Some(pos) = clean.find("://") {
        clean = clean[pos + 3..].to_string();
    }
    // Remove path/query
    if let Some(pos) = clean.find('/') {
        clean = clean[..pos].to_string();
    }
    // Remove port
    if let Some(pos) = clean.find(':') {
        clean = clean[..pos].to_string();
    }
    // Remove www.
    if clean.starts_with("www.") {
        clean = clean[4..].to_string();
    }
    clean.trim().to_string()
}

fn handle_client(
    app_handle: tauri::AppHandle,
    stream: &mut TcpStream,
    pairing_token: &str,
    credentials: Arc<Mutex<Option<Vec<ExtensionCredential>>>>,
) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::{Emitter, Manager};

    // 1. Handshake okuma (4-byte uzunluk + token verisi)
    let mut len_buf = [0u8; 4];
    stream.read_exact(&mut len_buf)?;
    let len = u32::from_be_bytes(len_buf) as usize;
    if len > 1024 {
        return Err("Token size exceeds limits".into());
    }

    let mut token_buf = vec![0u8; len];
    stream.read_exact(&mut token_buf)?;
    let received_token = String::from_utf8(token_buf)?;

    if received_token != pairing_token {
        stream.write_all(b"UNAUTHORIZED")?;
        stream.flush()?;
        return Err("Unauthorized client connected".into());
    }

    stream.write_all(b"OK")?;
    stream.flush()?;

    // 2. Ana mesaj döngüsü
    loop {
        let mut msg_len_buf = [0u8; 4];
        if stream.read_exact(&mut msg_len_buf).is_err() {
            break; // Bağlantı kapandı
        }
        let msg_len = u32::from_be_bytes(msg_len_buf) as usize;
        if msg_len > 1024 * 1024 {
            return Err("Message exceeds maximum allowed size".into());
        }

        let mut msg_buf = vec![0u8; msg_len];
        stream.read_exact(&mut msg_buf)?;

        let req: serde_json::Value = serde_json::from_slice(&msg_buf)?;
        let action = req["action"].as_str().unwrap_or("");

        let response = match action {
            "ping" => serde_json::json!({ "status": "ok" }),
            "is_locked" => {
                let locked = credentials.lock().unwrap().is_none();
                serde_json::json!({ "locked": locked })
            }
            "focus_window" => {
                let windows = app_handle.webview_windows();
                if !windows.is_empty() {
                    for window in windows.values() {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                        let _ =
                            window.request_user_attention(Some(tauri::UserAttentionType::Critical));
                    }
                    serde_json::json!({ "status": "ok" })
                } else {
                    serde_json::json!({ "error": "no windows found" })
                }
            }
            "add_credential" => {
                let credential = req["credential"].clone();
                let _ = app_handle.emit("add-credential-from-extension", credential);
                let windows = app_handle.webview_windows();
                if !windows.is_empty() {
                    for window in windows.values() {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                        let _ =
                            window.request_user_attention(Some(tauri::UserAttentionType::Critical));
                    }
                }
                serde_json::json!({ "status": "ok" })
            }
            "get_credentials" => {
                let url = req["url"].as_str().unwrap_or("");
                let active_host = get_hostname(url);

                let creds_guard = credentials.lock().unwrap();
                if let Some(ref items) = *creds_guard {
                    let matching: Vec<ExtensionCredential> = if active_host.is_empty() {
                        Vec::new()
                    } else {
                        items
                            .iter()
                            .filter(|item| {
                                let item_host = get_hostname(&item.url);
                                if item_host.is_empty() {
                                    false
                                } else {
                                    // Eşleşme kriteri:
                                    // 1. Hostnameler birebir aynıysa
                                    // 2. Aktif host, şifre hostunun subdomaini ise (ör. active: sub.domain.com, item: domain.com)
                                    // 3. Şifre hostu, aktif hostun subdomaini ise
                                    active_host == item_host
                                        || active_host.ends_with(&format!(".{}", item_host))
                                        || item_host.ends_with(&format!(".{}", active_host))
                                }
                            })
                            .cloned()
                            .collect()
                    };
                    serde_json::json!({ "locked": false, "credentials": matching })
                } else {
                    serde_json::json!({ "locked": true, "credentials": [] })
                }
            }
            "list_credentials" => {
                let creds_guard = credentials.lock().unwrap();
                if let Some(ref items) = *creds_guard {
                    serde_json::json!({ "locked": false, "credentials": items })
                } else {
                    serde_json::json!({ "locked": true, "credentials": [] })
                }
            }
            _ => serde_json::json!({ "error": "unknown action" }),
        };

        let res_bytes = serde_json::to_vec(&response)?;
        let res_len = res_bytes.len() as u32;
        stream.write_all(&res_len.to_be_bytes())?;
        stream.write_all(&res_bytes)?;
        stream.flush()?;
    }

    Ok(())
}

fn read_message() -> io::Result<Option<serde_json::Value>> {
    let mut length_buf = [0u8; 4];
    let stdin = io::stdin();
    let mut stdin_lock = stdin.lock();

    if stdin_lock.read_exact(&mut length_buf).is_err() {
        return Ok(None); // EOF
    }

    let length = u32::from_ne_bytes(length_buf) as usize;
    if length == 0 || length > 1024 * 1024 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Invalid message length",
        ));
    }

    let mut msg_buf = vec![0u8; length];
    stdin_lock.read_exact(&mut msg_buf)?;
    let msg: serde_json::Value = serde_json::from_slice(&msg_buf)?;
    Ok(Some(msg))
}

fn write_message(msg: &serde_json::Value) -> io::Result<()> {
    let msg_bytes = serde_json::to_vec(msg)?;
    let length = msg_bytes.len() as u32;
    let length_buf = length.to_ne_bytes();

    let stdout = io::stdout();
    let mut stdout_lock = stdout.lock();

    stdout_lock.write_all(&length_buf)?;
    stdout_lock.write_all(&msg_bytes)?;
    stdout_lock.flush()?;
    Ok(())
}

pub fn run_host() {
    let app_dir = get_app_data_dir();
    let pairing_token = app_dir.and_then(|dir| {
        let token_path = dir.join(TOKEN_FILENAME);
        fs::read_to_string(&token_path).ok()
    });

    let mut stream = None;
    if let Some(ref token) = pairing_token {
        if let Ok(mut s) = TcpStream::connect(format!("127.0.0.1:{}", TCP_PORT)) {
            let token_bytes = token.as_bytes();
            let token_len = token_bytes.len() as u32;
            let handshake_success = s.write_all(&token_len.to_be_bytes()).is_ok()
                && s.write_all(token_bytes).is_ok()
                && s.flush().is_ok()
                && {
                    let mut handshake_res = [0u8; 2];
                    s.read_exact(&mut handshake_res).is_ok() && &handshake_res == b"OK"
                };

            if handshake_success {
                stream = Some(s);
            }
        }
    }

    loop {
        let msg = match read_message() {
            Ok(Some(m)) => m,
            Ok(None) => break,
            Err(_) => break,
        };

        if let Some(ref mut s) = stream {
            // TCP forwarding mode
            let msg_bytes = match serde_json::to_vec(&msg) {
                Ok(b) => b,
                Err(_) => break,
            };
            let msg_len = msg_bytes.len() as u32;

            if s.write_all(&msg_len.to_be_bytes()).is_err()
                || s.write_all(&msg_bytes).is_err()
                || s.flush().is_err()
            {
                break;
            }

            let mut resp_len_buf = [0u8; 4];
            if s.read_exact(&mut resp_len_buf).is_err() {
                break;
            }
            let resp_len = u32::from_be_bytes(resp_len_buf) as usize;
            let mut resp_buf = vec![0u8; resp_len];
            if s.read_exact(&mut resp_buf).is_err() {
                break;
            }

            let resp_json: serde_json::Value = match serde_json::from_slice(&resp_buf) {
                Ok(j) => j,
                Err(_) => break,
            };

            if write_message(&resp_json).is_err() {
                break;
            }
        } else {
            // Offline fallback mode (desktop app is not running)
            let action = msg["action"].as_str().unwrap_or("");
            let response = match action {
                "ping" => serde_json::json!({ "status": "ok" }),
                "focus_window" => {
                    if let Ok(current_exe) = std::env::current_exe() {
                        let _ = std::process::Command::new(current_exe).spawn();
                        serde_json::json!({ "status": "launched" })
                    } else {
                        serde_json::json!({ "error": "failed_to_resolve_path" })
                    }
                }
                "is_locked" => {
                    serde_json::json!({ "locked": true, "error": "desktop_app_not_running" })
                }
                "list_credentials" | "get_credentials" => {
                    serde_json::json!({ "locked": true, "credentials": [], "error": "desktop_app_not_running" })
                }
                _ => serde_json::json!({ "error": "desktop_app_not_running" }),
            };

            if write_message(&response).is_err() {
                break;
            }
        }
    }
}
