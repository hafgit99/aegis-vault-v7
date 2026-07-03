use std::fs;
use std::io::{self, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use subtle::ConstantTimeEq;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

pub const TCP_PORT: u16 = 49155;
pub const TOKEN_FILENAME: &str = "aegis_ipc_token.bin";

struct ConnectionRateLimiter {
    connection_times: Mutex<std::collections::VecDeque<std::time::Instant>>,
}

impl ConnectionRateLimiter {
    fn new() -> Self {
        Self {
            connection_times: Mutex::new(std::collections::VecDeque::new()),
        }
    }

    fn check_and_record(&self) -> bool {
        let mut times = self.connection_times.lock().unwrap();
        let now = std::time::Instant::now();

        while let Some(&time) = times.front() {
            if now.duration_since(time) > std::time::Duration::from_secs(1) {
                times.pop_front();
            } else {
                break;
            }
        }

        if times.len() >= 5 {
            false
        } else {
            times.push_back(now);
            true
        }
    }
}

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

pub const EXTENSION_CREDENTIAL_LEASE_MS: u64 = 5 * 60 * 1000;

#[derive(Clone, Debug)]
pub struct ExtensionCredentialCache {
    pub credentials: Vec<ExtensionCredential>,
    pub expires_at_epoch_ms: u64,
}

pub struct ExtensionState {
    pub credentials: Arc<Mutex<Option<ExtensionCredentialCache>>>,
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
    use rand::{rngs::OsRng, RngCore};

    let mut token = [0u8; 32];
    OsRng.fill_bytes(&mut token);
    token.iter().map(|byte| format!("{:02x}", byte)).collect()
}

fn is_pairing_token_valid(received_token: &str, pairing_token: &str) -> bool {
    received_token.len() == pairing_token.len()
        && received_token.as_bytes().ct_eq(pairing_token.as_bytes()).into()
}

pub fn write_pairing_token_file(path: &PathBuf, token: &str) -> io::Result<()> {
    #[cfg(unix)]
    {
        use std::fs::OpenOptions;
        use std::os::unix::fs::OpenOptionsExt;

        let mut file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .mode(0o600)
            .open(path)?;
        file.write_all(token.as_bytes())?;
        file.flush()?;
        return Ok(());
    }

    #[cfg(not(unix))]
    {
        fs::write(path, token)
    }
}

pub fn credential_lease_expires_at(ttl_ms: u64) -> u64 {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);
    now_ms.saturating_add(ttl_ms.min(EXTENSION_CREDENTIAL_LEASE_MS))
}

pub fn start_tcp_server(
    app_handle: tauri::AppHandle,
    pairing_token: String,
    credentials: Arc<Mutex<Option<ExtensionCredentialCache>>>,
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

        let limiter = Arc::new(ConnectionRateLimiter::new());

        for stream in listener.incoming() {
            match stream {
                Ok(mut stream) => {
                    if !limiter.check_and_record() {
                        log::warn!("Rate limit exceeded. Rejecting connection.");
                        let _ = stream.write_all(b"RATE_LIMIT_EXCEEDED");
                        let _ = stream.flush();
                        continue;
                    }
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

fn focus_webview_window(window: &tauri::WebviewWindow) {
    let _ = window.show();

    #[cfg(not(mobile))]
    {
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.request_user_attention(Some(tauri::UserAttentionType::Critical));
    }

    #[cfg(mobile)]
    {
        let _ = window.set_focus();
    }
}

fn handle_client(
    app_handle: tauri::AppHandle,
    stream: &mut TcpStream,
    pairing_token: &str,
    credentials: Arc<Mutex<Option<ExtensionCredentialCache>>>,
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

    if !is_pairing_token_valid(&received_token, pairing_token) {
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
                let mut creds_guard = credentials.lock().unwrap();
                let now_ms = credential_lease_expires_at(0);
                if creds_guard
                    .as_ref()
                    .is_some_and(|cache| cache.expires_at_epoch_ms <= now_ms)
                {
                    *creds_guard = None;
                }
                let locked = creds_guard.is_none();
                serde_json::json!({ "locked": locked })
            }
            "focus_window" => {
                let windows = app_handle.webview_windows();
                if !windows.is_empty() {
                    for window in windows.values() {
                        focus_webview_window(window);
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
                        focus_webview_window(window);
                    }
                }
                serde_json::json!({ "status": "ok" })
            }
            "get_credentials" => {
                let url = req["url"].as_str().unwrap_or("");
                let active_host = get_hostname(url);

                let mut creds_guard = credentials.lock().unwrap();
                let now_ms = credential_lease_expires_at(0);
                if creds_guard
                    .as_ref()
                    .is_some_and(|cache| cache.expires_at_epoch_ms <= now_ms)
                {
                    *creds_guard = None;
                }

                if let Some(ref cache) = *creds_guard {
                    let matching: Vec<ExtensionCredential> = if active_host.is_empty() {
                        Vec::new()
                    } else {
                        cache
                            .credentials
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
                let mut creds_guard = credentials.lock().unwrap();
                let now_ms = credential_lease_expires_at(0);
                if creds_guard
                    .as_ref()
                    .is_some_and(|cache| cache.expires_at_epoch_ms <= now_ms)
                {
                    *creds_guard = None;
                }

                if let Some(ref cache) = *creds_guard {
                    serde_json::json!({ "locked": false, "credentials": cache.credentials })
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_pairing_tokens_are_256_bit_hex_values() {
        let first = generate_token();
        let second = generate_token();

        assert_eq!(first.len(), 64);
        assert!(first.chars().all(|character| character.is_ascii_hexdigit()));
        assert_ne!(first, second);
    }

    #[test]
    fn credential_lease_is_capped_to_the_default_window() {
        let short = credential_lease_expires_at(1_000);
        let long = credential_lease_expires_at(EXTENSION_CREDENTIAL_LEASE_MS * 10);

        assert!(short > 0);
        assert!(long.saturating_sub(short) <= EXTENSION_CREDENTIAL_LEASE_MS);
    }
}
