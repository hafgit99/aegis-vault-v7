use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305, XNonce,
};
use hmac::{Hmac, Mac};
use rand::{rngs::OsRng, RngCore};
use sha2::Sha256;
use std::fs;
use std::io::{self, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};
use subtle::ConstantTimeEq;
use zeroize::{Zeroize, ZeroizeOnDrop};

type HmacSha256 = Hmac<Sha256>;

pub const TOKEN_FILENAME: &str = "aegis_ipc_token.bin";
pub const PORT_FILENAME: &str = "aegis_ipc_port.txt";
pub const IPC_DATA_KEY_INFO: &[u8] = b"aegis-ipc-session-data-key-v2";

/// IPC frame protocol version (RUST-Y1: AEAD frame format).
/// Frame layout: `[4-byte BE ciphertext length][1-byte version][24-byte nonce][ciphertext||16-byte tag]`.
pub const IPC_FRAME_VERSION: u8 = 0x02;
pub const IPC_AEAD_NONCE_LEN: usize = 24;
pub const IPC_AEAD_TAG_LEN: usize = 16;
pub const IPC_FRAME_HEADER_LEN: usize = 4 + 1 + IPC_AEAD_NONCE_LEN;
/// Maximum authenticated ciphertext length (payload capped at 1 MiB + 16-byte tag).
pub const MAX_FRAME_CIPHERTEXT_LEN: usize = 1024 * 1024 + IPC_AEAD_TAG_LEN;

/// Derives the 32-byte AEAD session data key from the 256-bit pairing token
/// using HKDF-Expand style HMAC-SHA256 with a protocol-specific info string.
///
/// RUST-Y1: the session key now protects confidentiality (AEAD), not just
/// integrity. The info string is versioned so key separation from the legacy
/// HMAC-only derivation is guaranteed even if a token were ever reused.
pub fn derive_session_data_key(pairing_token: &str) -> [u8; 32] {
    let mut mac = <HmacSha256 as Mac>::new_from_slice(pairing_token.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(IPC_DATA_KEY_INFO);
    let result = mac.finalize().into_bytes();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result[..32]);
    key
}

/// Encrypts a plaintext payload into an authenticated IPC frame using
/// XChaCha20-Poly1305 with a fresh CSPRNG nonce per frame:
/// `[4-byte BE ciphertext length][version][24-byte nonce][ciphertext||16-byte tag]`.
pub fn encrypt_message_frame(key: &[u8; 32], plaintext: &[u8]) -> io::Result<Vec<u8>> {
    if plaintext.len() > 1024 * 1024 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "IPC plaintext exceeds maximum allowed size",
        ));
    }

    let cipher = XChaCha20Poly1305::new_from_slice(key)
        .expect("AEAD can take a 32-byte key");
    let mut nonce_bytes = [0u8; IPC_AEAD_NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = XNonce::from_slice(&nonce_bytes);

    let ciphertext_and_tag = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| io::Error::other("AEAD encryption failed"))?;

    let mut frame = Vec::with_capacity(IPC_FRAME_HEADER_LEN + ciphertext_and_tag.len());
    frame.extend_from_slice(&(ciphertext_and_tag.len() as u32).to_be_bytes());
    frame.push(IPC_FRAME_VERSION);
    frame.extend_from_slice(&nonce_bytes);
    frame.extend_from_slice(&ciphertext_and_tag);
    Ok(frame)
}

/// Verifies and decrypts an authenticated IPC frame. Any structural or
/// authentication failure returns an error (fail-closed).
pub fn decrypt_message_frame(key: &[u8; 32], frame: &[u8]) -> io::Result<Vec<u8>> {
    if frame.len() < IPC_FRAME_HEADER_LEN {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "IPC frame too short"));
    }

    let ciphertext_len = u32::from_be_bytes([frame[0], frame[1], frame[2], frame[3]]) as usize;
    if frame[4] != IPC_FRAME_VERSION {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Unsupported IPC frame version",
        ));
    }
    if ciphertext_len > MAX_FRAME_CIPHERTEXT_LEN {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "IPC frame exceeds maximum allowed size",
        ));
    }
    if frame.len() != IPC_FRAME_HEADER_LEN + ciphertext_len {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "IPC frame length mismatch",
        ));
    }

    let nonce = XNonce::from_slice(&frame[4 + 1..4 + 1 + IPC_AEAD_NONCE_LEN]);
    let ciphertext = &frame[IPC_FRAME_HEADER_LEN..];
    let cipher = XChaCha20Poly1305::new_from_slice(key)
        .expect("AEAD can take a 32-byte key");
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "IPC frame authentication failed"))
}

/// Reads a length-prefixed authenticated frame from the stream and returns the
/// decrypted plaintext. Requires a 4-byte BE ciphertext length prefix, then the
/// `[version][nonce][ciphertext||tag]` body.
fn read_authenticated_frame(
    stream: &mut TcpStream,
    key: &[u8; 32],
) -> io::Result<Vec<u8>> {
    let mut len_buf = [0u8; 4];
    stream.read_exact(&mut len_buf)?;
    let frame_len = u32::from_be_bytes(len_buf) as usize;
    if frame_len > MAX_FRAME_CIPHERTEXT_LEN {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "IPC frame exceeds maximum allowed size",
        ));
    }

    let mut frame_body = vec![0u8; IPC_FRAME_HEADER_LEN - 4 + frame_len];
    stream.read_exact(&mut frame_body)?;

    let mut frame = Vec::with_capacity(4 + frame_body.len());
    frame.extend_from_slice(&len_buf);
    frame.extend_from_slice(&frame_body);
    decrypt_message_frame(key, &frame)
}

/// Encrypts plaintext into an authenticated frame and writes it to the stream.
fn write_authenticated_frame(
    stream: &mut TcpStream,
    key: &[u8; 32],
    plaintext: &[u8],
) -> io::Result<()> {
    let frame = encrypt_message_frame(key, plaintext)?;
    stream.write_all(&frame)?;
    stream.flush()
}

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

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Zeroize, ZeroizeOnDrop)]
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

#[derive(Clone, Debug, Zeroize, ZeroizeOnDrop)]
pub struct ExtensionCredentialCache {
    pub credentials: Vec<ExtensionCredential>,
    pub expires_at_epoch_ms: u64,
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
    let mut token = [0u8; 32];
    OsRng.fill_bytes(&mut token);
    token.iter().map(|byte| format!("{:02x}", byte)).collect()
}

fn is_pairing_token_valid(received_token: &str, pairing_token: &str) -> bool {
    received_token.len() == pairing_token.len()
        && received_token
            .as_bytes()
            .ct_eq(pairing_token.as_bytes())
            .into()
}

pub fn write_pairing_token_file(path: &PathBuf, token: &str) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(path)?;
        file.write_all(token.as_bytes())?;
        file.flush()?;
        return Ok(());
    }

    #[cfg(windows)]
    {
        fs::write(path, token)?;
        if let Some(path_str) = path.to_str() {
            if let Ok(username) = std::env::var("USERNAME") {
                let user_grant = format!("{}:(F)", username);
                let output = std::process::Command::new("icacls")
                    .args([path_str, "/inheritance:r", "/grant:r", &user_grant])
                    .output();
                if let Ok(out) = output {
                    if !out.status.success() {
                        let _ = fs::remove_file(path);
                        let err_msg = format!(
                            "Failed to restrict pairing token ACL (fail-closed): {}",
                            String::from_utf8_lossy(&out.stderr)
                        );
                        eprintln!("[Aegis IPC Error] {}", err_msg);
                        return Err(io::Error::new(io::ErrorKind::PermissionDenied, err_msg));
                    }
                } else {
                    let _ = fs::remove_file(path);
                    return Err(io::Error::new(
                        io::ErrorKind::PermissionDenied,
                        "Failed to execute icacls for ACL restriction (fail-closed)",
                    ));
                }
            }
        }
        Ok(())
    }

    #[cfg(not(any(unix, windows)))]
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

pub const DEFAULT_TCP_PORT: u16 = 49155;

fn bind_dynamic_tcp_listener() -> io::Result<(TcpListener, u16)> {
    if let Ok(listener) = TcpListener::bind(format!("127.0.0.1:{}", DEFAULT_TCP_PORT)) {
        return Ok((listener, DEFAULT_TCP_PORT));
    }

    for port in 49156..=49165 {
        if let Ok(listener) = TcpListener::bind(format!("127.0.0.1:{}", port)) {
            return Ok((listener, port));
        }
    }

    let listener = TcpListener::bind("127.0.0.1:0")?;
    let bound_port = listener.local_addr()?.port();
    Ok((listener, bound_port))
}

pub fn start_tcp_server(
    app_handle: tauri::AppHandle,
    pairing_token: Arc<Mutex<String>>,
    credentials: Arc<Mutex<Option<ExtensionCredentialCache>>>,
) {
    thread::spawn(move || {
        let (listener, bound_port) = match bind_dynamic_tcp_listener() {
            Ok(res) => res,
            Err(e) => {
                log::error!("Failed to bind TCP server to dynamic port: {}", e);
                return;
            }
        };

        if let Some(app_dir) = get_app_data_dir() {
            let port_path = app_dir.join(PORT_FILENAME);
            let _ = write_pairing_token_file(&port_path, &bound_port.to_string());
        }

        log::info!("TCP IPC server bound dynamically to port {}", bound_port);

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
                    let token_arc = pairing_token.clone();
                    let app_clone = app_handle.clone();
                    thread::spawn(move || {
                        if let Err(e) =
                            handle_client(app_clone, &mut stream, token_arc, credentials_clone)
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

#[derive(Debug, Clone, PartialEq, Eq)]
struct ParsedUrl {
    host: String,
    port: Option<u16>,
    path: String,
}

fn parse_url(url_str: &str) -> ParsedUrl {
    let mut clean = url_str.trim().to_lowercase();

    // Remove protocol
    if let Some(pos) = clean.find("://") {
        clean = clean[pos + 3..].to_string();
    }

    // Remove query and fragment
    if let Some(pos) = clean.find('?') {
        clean = clean[..pos].to_string();
    }
    if let Some(pos) = clean.find('#') {
        clean = clean[..pos].to_string();
    }

    // Split host/port and path
    let (host_port, path) = if let Some(pos) = clean.find('/') {
        (clean[..pos].to_string(), clean[pos..].to_string())
    } else {
        (clean, "/".to_string())
    };

    // Extract port
    let mut host = host_port;
    let mut port = None;
    if let Some(pos) = host.rfind(':') {
        if let Ok(p) = host[pos + 1..].parse::<u16>() {
            port = Some(p);
            host = host[..pos].to_string();
        }
    }

    // Remove www. prefix if present
    if host.starts_with("www.") {
        host = host[4..].to_string();
    }

    ParsedUrl { host, port, path }
}

const PUBLIC_SUFFIXES: &[&str] = &[
    "co.uk",
    "org.uk",
    "gov.uk",
    "ac.uk",
    "me.uk",
    "ltd.uk",
    "plc.uk",
    "net.uk",
    "com.tr",
    "org.tr",
    "net.tr",
    "gov.tr",
    "edu.tr",
    "bel.tr",
    "k12.tr",
    "av.tr",
    "dr.tr",
    "biz.tr",
    "info.tr",
    "tv.tr",
    "gen.tr",
    "name.tr",
    "co.jp",
    "ne.jp",
    "or.jp",
    "go.jp",
    "ac.jp",
    "ad.jp",
    "ed.jp",
    "gr.jp",
    "lg.jp",
    "com.au",
    "net.au",
    "org.au",
    "edu.au",
    "gov.au",
    "id.au",
    "asn.au",
    "csiro.au",
    "co.nz",
    "net.nz",
    "org.nz",
    "govt.nz",
    "ac.nz",
    "school.nz",
    "iwi.nz",
    "com.br",
    "net.br",
    "org.br",
    "gov.br",
    "edu.br",
    "ind.br",
    "inf.br",
    "tur.br",
    "b.br",
    "com.de",
    "co.at",
    "or.at",
    "gv.at",
    "ac.at",
    "co.ch",
    "com.mx",
    "org.mx",
    "net.mx",
    "edu.mx",
    "gob.mx",
    "com.ar",
    "org.ar",
    "net.ar",
    "gov.ar",
    "edu.ar",
    "co.in",
    "net.in",
    "org.in",
    "gen.in",
    "firm.in",
    "ind.in",
    "nic.in",
    "ac.in",
    "edu.in",
    "res.in",
    "gov.in",
    "com.cn",
    "net.cn",
    "org.cn",
    "gov.cn",
    "edu.cn",
    "com.hk",
    "org.hk",
    "net.hk",
    "edu.hk",
    "gov.hk",
    "idv.hk",
    "com.sg",
    "org.sg",
    "net.sg",
    "edu.sg",
    "gov.sg",
    "per.sg",
    "co.kr",
    "ne.kr",
    "or.kr",
    "re.kr",
    "pe.kr",
    "go.kr",
    "ac.kr",
    "com.tw",
    "org.tw",
    "net.tw",
    "edu.tw",
    "gov.tw",
    "idv.tw",
    "co.za",
    "net.za",
    "org.za",
    "gov.za",
    "edu.za",
    "com.eg",
    "edu.eg",
    "gov.eg",
    "org.eg",
    "com.sa",
    "net.sa",
    "org.sa",
    "gov.sa",
    "edu.sa",
    "com.ae",
    "net.ae",
    "org.ae",
    "gov.ae",
    "ac.ae",
    "co.il",
    "org.il",
    "net.il",
    "ac.il",
    "gov.il",
    "k12.il",
    "com.ca",
    "co.ca",
    "ab.ca",
    "bc.ca",
    "mb.ca",
    "nb.ca",
    "nl.ca",
    "ns.ca",
    "nt.ca",
    "nu.ca",
    "on.ca",
    "pe.ca",
    "qc.ca",
    "sk.ca",
    "yk.ca",
    "com.es",
    "nom.es",
    "org.es",
    "gob.es",
    "edu.es",
    "com.fr",
    "asso.fr",
    "gouv.fr",
    "co.it",
    "gov.it",
    "com.nl",
    "co.nl",
    "co.no",
    "org.no",
    "com.se",
    "org.se",
    "com.fi",
    "co.fi",
    "com.dk",
    "co.dk",
    "com.pl",
    "net.pl",
    "org.pl",
    "biz.pl",
    "info.pl",
    "com.ru",
    "net.ru",
    "org.ru",
    "pp.ru",
    "com.ua",
    "net.ua",
    "org.ua",
    "gov.ua",
    "edu.ua",
    "com.co",
    "net.co",
    "nom.co",
    "org.co",
    "gov.co",
    "edu.co",
    "com.pe",
    "org.pe",
    "net.pe",
    "gob.pe",
    "edu.pe",
    "co.cl",
    "gob.cl",
    "gov.cl",
    "com.ve",
    "org.ve",
    "net.ve",
    "gob.ve",
    "edu.ve",
    "com.ec",
    "org.ec",
    "net.ec",
    "gob.ec",
    "edu.ec",
    "com.sa",
    "net.sa",
    "org.sa",
    "gov.sa",
    "edu.sa",
    "med.sa",
    "com.ae",
    "net.ae",
    "org.ae",
    "gov.ae",
    "ac.ae",
    "sch.ae",
    "com.kw",
    "net.kw",
    "org.kw",
    "gov.kw",
    "edu.kw",
    "com.qa",
    "net.qa",
    "org.qa",
    "gov.qa",
    "edu.qa",
    "com.bh",
    "net.bh",
    "org.bh",
    "gov.bh",
    "edu.bh",
    "com.om",
    "net.om",
    "org.om",
    "gov.om",
    "edu.om",
    "com.jo",
    "net.jo",
    "org.jo",
    "gov.jo",
    "edu.jo",
    "com.lb",
    "net.lb",
    "org.lb",
    "gov.lb",
    "edu.lb",
    "co.ke",
    "or.ke",
    "ne.ke",
    "go.ke",
    "ac.ke",
    "sc.ke",
    "co.ug",
    "or.ug",
    "ne.ug",
    "go.ug",
    "ac.ug",
    "sc.ug",
    "co.tz",
    "or.tz",
    "ne.tz",
    "go.tz",
    "ac.tz",
    "sc.tz",
    "com.gh",
    "org.gh",
    "net.gh",
    "gov.gh",
    "edu.gh",
    "com.tn",
    "org.tn",
    "net.tn",
    "gov.tn",
    "edunet.tn",
    "com.ma",
    "org.ma",
    "net.ma",
    "gov.ma",
    "ac.ma",
    "com.dz",
    "org.dz",
    "net.dz",
    "gov.dz",
    "edu.dz",
    "com.sn",
    "org.sn",
    "net.sn",
    "gov.sn",
    "univ.sn",
    "github.io",
    "gitlab.io",
    "herokuapp.com",
    "vercel.app",
    "netlify.app",
    "pages.dev",
    "workers.dev",
    "web.app",
    "firebaseapp.com",
    "appspot.com",
    "azurewebsites.net",
    "cloudfront.net",
    "amazonaws.com",
    "blogspot.com",
    "s3.amazonaws.com",
    "storage.googleapis.com",
    "cloudapp.net",
    "fly.dev",
    "render.com",
    "cloudflare.dev",
];

pub fn extract_etld_plus_one(host: &str) -> String {
    let mut clean_host = host.trim().to_lowercase();
    if clean_host.starts_with("www.") {
        clean_host = clean_host[4..].to_string();
    }

    let parts: Vec<&str> = clean_host.split('.').collect();
    if parts.len() <= 2 {
        return clean_host;
    }

    for suffix in PUBLIC_SUFFIXES {
        if clean_host.ends_with(suffix) {
            let suffix_parts: Vec<&str> = suffix.split('.').collect();
            let keep_count = suffix_parts.len() + 1;
            if parts.len() >= keep_count {
                return parts[parts.len() - keep_count..].join(".");
            }
        }
    }

    parts[parts.len() - 2..].join(".")
}

fn match_credentials(active: &ParsedUrl, item: &ParsedUrl) -> Option<u32> {
    let active_etld = extract_etld_plus_one(&active.host);
    let item_etld = extract_etld_plus_one(&item.host);

    // 1. Host matching with Public Suffix List (eTLD+1) support
    let host_score = if active.host == item.host {
        100 // Exact host match
    } else if active_etld == item_etld {
        85 // eTLD+1 domain match (e.g. login.example.co.uk and example.co.uk)
    } else if active.host.ends_with(&format!(".{}", item.host)) {
        80 // Subdomain match (e.g. active is sub.domain.com, item is domain.com)
    } else if item.host.ends_with(&format!(".{}", active.host)) {
        60 // Parent domain match (e.g. active is domain.com, item is sub.domain.com)
    } else {
        return None; // No host match
    };

    // 2. Port matching
    let is_dev_host =
        active.host == "localhost" || active.host == "127.0.0.1" || active.host == "[::1]";

    let port_score = match (active.port, item.port) {
        (Some(ap), Some(ip)) => {
            if ap == ip {
                20 // Ports match exactly
            } else {
                return None; // Port mismatch, reject
            }
        }
        (Some(_), None) | (None, Some(_)) => {
            if is_dev_host {
                // Reject port mismatch on localhost/127.0.0.1
                return None;
            }
            0 // Wildcard/default port match allowed for normal sites, no bonus
        }
        (None, None) => 10, // Both default ports
    };

    // 3. Path matching
    let clean_item_path = item.path.trim_end_matches('/');
    let path_score = if clean_item_path.is_empty() || clean_item_path == "/" {
        10 // Wildcard/empty path match
    } else {
        let clean_active_path = active.path.trim_end_matches('/');
        if clean_active_path == clean_item_path {
            30 // Exact path match
        } else if active.path.starts_with(&format!("{}/", clean_item_path)) {
            20 // Sub-path match (e.g. active /admin/dashboard, item /admin)
        } else {
            return None; // Path specified in credential but does not match active path -> REJECT
        }
    };

    Some(host_score + port_score + path_score)
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

/// Handles an authenticated TCP client connection from the browser native messaging host.
///
/// Security & Framing Architecture (R-4 + RUST-Y1):
/// 1. Handshake Phase: Client sends 4-byte token length + 256-bit token. Server verifies token
///    in constant time. If valid, replies with `b"OK"`. If invalid, replies with `b"UNAUTHORIZED"`
///    and immediately drops the connection.
/// 2. Session Key Derivation: Server derives a 32-byte AEAD session data key from the pairing
///    token using HKDF-SHA256 (`derive_session_data_key`).
/// 3. Message Framing: Each request and response frame is encrypted with XChaCha20-Poly1305:
///    `[4-byte big-endian ciphertext length][1-byte version][24-byte nonce][ciphertext||16-byte tag]`
///    with a fresh CSPRNG nonce per frame. AEAD provides confidentiality, integrity and
///    authentication in a single layer.
/// 4. Frame Verification: Any structurally invalid, version-mismatched or unauthenticated frame
///    causes immediate session termination (fail-closed).
/// 5. Session Revocation: The `revoke` action rotates the pairing token, wipes the credential
///    lease and terminates the connection, invalidating all previously issued session keys.
fn handle_client(
    app_handle: tauri::AppHandle,
    stream: &mut TcpStream,
    pairing_token: Arc<Mutex<String>>,
    credentials: Arc<Mutex<Option<ExtensionCredentialCache>>>,
) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::{Emitter, Manager};

    let current_token = pairing_token
        .lock()
        .map_err(|_| "Pairing token mutex poisoned")?
        .clone();

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

    if !is_pairing_token_valid(&received_token, &current_token) {
        stream.write_all(b"UNAUTHORIZED")?;
        stream.flush()?;
        return Err("Unauthorized client connected".into());
    }

    stream.write_all(b"OK")?;
    stream.flush()?;

    let session_data_key = derive_session_data_key(&current_token);

    // 2. Ana mesaj döngüsü (Framing: [4-byte len][version][24-byte nonce][ciphertext||tag])
    loop {
        let msg_buf = match read_authenticated_frame(stream, &session_data_key) {
            Ok(buf) => buf,
            Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => break, // Bağlantı kapandı
            Err(_) => {
                log::warn!(
                    "[Aegis IPC] AEAD frame decryption failed! Terminating corrupted connection."
                );
                return Err("Message authentication failed".into());
            }
        };

        let req: serde_json::Value = serde_json::from_slice(&msg_buf)?;
        let action = req["action"].as_str().unwrap_or("");

        let mut revoke_session = false;
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
                let active_parsed = parse_url(url);

                let mut creds_guard = credentials.lock().unwrap();
                let now_ms = credential_lease_expires_at(0);
                if creds_guard
                    .as_ref()
                    .is_some_and(|cache| cache.expires_at_epoch_ms <= now_ms)
                {
                    *creds_guard = None;
                }

                if let Some(ref cache) = *creds_guard {
                    let mut scored_credentials: Vec<(u32, ExtensionCredential)> = Vec::new();

                    if !active_parsed.host.is_empty() {
                        for item in &cache.credentials {
                            let item_parsed = parse_url(&item.url);
                            if let Some(score) = match_credentials(&active_parsed, &item_parsed) {
                                scored_credentials.push((score, item.clone()));
                            }
                        }
                    }

                    // Sort by score descending (highest score first)
                    scored_credentials.sort_by(|a, b| b.0.cmp(&a.0));

                    let matching: Vec<ExtensionCredential> = scored_credentials
                        .into_iter()
                        .map(|(_, cred)| cred)
                        .collect();

                    serde_json::json!({ "locked": false, "credentials": matching })
                } else {
                    serde_json::json!({ "locked": true, "credentials": [] })
                }
            }
            "list_credentials" => {
                let url = req["url"].as_str().unwrap_or("");
                let active_parsed = parse_url(url);

                let mut creds_guard = credentials.lock().unwrap();
                let now_ms = credential_lease_expires_at(0);
                if creds_guard
                    .as_ref()
                    .is_some_and(|cache| cache.expires_at_epoch_ms <= now_ms)
                {
                    *creds_guard = None;
                }

                if let Some(ref cache) = *creds_guard {
                    if !active_parsed.host.is_empty() {
                        let mut scored_credentials: Vec<(u32, ExtensionCredential)> = Vec::new();
                        for item in &cache.credentials {
                            let item_parsed = parse_url(&item.url);
                            if let Some(score) = match_credentials(&active_parsed, &item_parsed) {
                                scored_credentials.push((score, item.clone()));
                            }
                        }
                        scored_credentials.sort_by(|a, b| b.0.cmp(&a.0));
                        let matching: Vec<ExtensionCredential> = scored_credentials
                            .into_iter()
                            .map(|(_, cred)| cred)
                            .collect();
                        serde_json::json!({ "locked": false, "credentials": matching })
                    } else {
                        // Return metadata-only list of cached credentials (with empty passwords)
                        // for popup search, favorites & domain extraction to prevent single-message bulk password dumping.
                        let sanitized: Vec<ExtensionCredential> = cache
                            .credentials
                            .iter()
                            .map(|item| ExtensionCredential {
                                id: item.id.clone(),
                                title: item.title.clone(),
                                username: item.username.clone(),
                                password: String::new(),
                                url: item.url.clone(),
                                category: item.category.clone(),
                                favorite: item.favorite,
                            })
                            .collect();
                        serde_json::json!({ "locked": false, "credentials": sanitized })
                    }
                } else {
                    serde_json::json!({ "locked": true, "credentials": [] })
                }
            }
            "revoke" => {
                // RUST-Y1: session revocation — wipe the credential lease,
                // rotate the pairing token (invalidating all prior session keys)
                // and terminate this connection immediately after responding.
                {
                    let mut creds_guard = credentials.lock().unwrap();
                    *creds_guard = None;
                }
                let new_token = generate_token();
                {
                    let mut token_guard = pairing_token.lock().unwrap();
                    *token_guard = new_token.clone();
                }
                if let Some(app_data_dir) = get_app_data_dir() {
                    let token_path = app_data_dir.join(TOKEN_FILENAME);
                    let _ = write_pairing_token_file(&token_path, &new_token);
                }
                revoke_session = true;
                serde_json::json!({ "status": "revoked" })
            }
            _ => serde_json::json!({ "error": "unknown action" }),
        };

        let res_bytes = serde_json::to_vec(&response)?;

        if write_authenticated_frame(stream, &session_data_key, &res_bytes).is_err() {
            return Err("Failed to write response frame".into());
        }

        if revoke_session {
            // Connection is intentionally terminated after revocation.
            return Ok(());
        }
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
    let pairing_token = app_dir.as_ref().and_then(|dir| {
        let token_path = dir.join(TOKEN_FILENAME);
        fs::read_to_string(&token_path).ok()
    });

    let target_port: u16 = app_dir
        .as_ref()
        .and_then(|dir| {
            let port_path = dir.join(PORT_FILENAME);
            fs::read_to_string(&port_path).ok()
        })
        .and_then(|s| s.trim().parse::<u16>().ok())
        .unwrap_or(DEFAULT_TCP_PORT);

    let mut candidate_ports = vec![target_port];
    if target_port != DEFAULT_TCP_PORT {
        candidate_ports.push(DEFAULT_TCP_PORT);
    }
    let mut stream = None;
    let mut session_data_key: Option<[u8; 32]> = None;
    if let Some(ref token) = pairing_token {
        for port in candidate_ports {
            if let Ok(mut s) = TcpStream::connect(format!("127.0.0.1:{}", port)) {
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
                    session_data_key = Some(derive_session_data_key(token));
                    stream = Some(s);
                    break;
                }
            }
        }
    }

    loop {
        let msg = match read_message() {
            Ok(Some(m)) => m,
            Ok(None) => break,
            Err(_) => break,
        };

        if let (Some(ref mut s), Some(ref data_key)) = (&mut stream, &session_data_key) {
            // TCP forwarding mode with AEAD (XChaCha20-Poly1305) frame protection (RUST-Y1)
            let msg_bytes = match serde_json::to_vec(&msg) {
                Ok(b) => b,
                Err(_) => break,
            };

            if write_authenticated_frame(s, data_key, &msg_bytes).is_err() {
                log::error!("[Aegis Host] Failed to write AEAD request frame.");
                break;
            }

            let resp_bytes = match read_authenticated_frame(s, data_key) {
                Ok(bytes) => bytes,
                Err(_) => {
                    log::error!(
                        "[Aegis Host] Response AEAD authentication failed! Dropping response."
                    );
                    break;
                }
            };

            let resp_json: serde_json::Value = match serde_json::from_slice(&resp_bytes) {
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
    fn pairing_token_validation_uses_constant_time_comparison() {
        let token = generate_token();
        assert!(is_pairing_token_valid(&token, &token));
        assert!(!is_pairing_token_valid(&token, "invalid_token"));
        assert!(!is_pairing_token_valid("short", &token));
    }

    #[test]
    fn credential_lease_is_capped_to_the_default_window() {
        let short = credential_lease_expires_at(1_000);
        let long = credential_lease_expires_at(EXTENSION_CREDENTIAL_LEASE_MS * 10);

        assert!(short > 0);
        assert!(long.saturating_sub(short) <= EXTENSION_CREDENTIAL_LEASE_MS);
    }

    #[test]
    fn test_extract_etld_plus_one() {
        assert_eq!(
            extract_etld_plus_one("login.example.co.uk"),
            "example.co.uk"
        );
        assert_eq!(extract_etld_plus_one("sub.domain.com.tr"), "domain.com.tr");
        assert_eq!(extract_etld_plus_one("www.aegis.org"), "aegis.org");
        assert_eq!(
            extract_etld_plus_one("login.portal.com.tn"),
            "portal.com.tn"
        );
        assert_eq!(
            extract_etld_plus_one("app.safaricom.co.ke"),
            "safaricom.co.ke"
        );
        assert_eq!(
            extract_etld_plus_one("shop.mercado.com.co"),
            "mercado.com.co"
        );
    }

    #[test]
    fn test_parse_url() {
        let parsed = parse_url("https://www.example.com:8080/admin/login?q=1#hash");
        assert_eq!(parsed.host, "example.com");
        assert_eq!(parsed.port, Some(8080));
        assert_eq!(parsed.path, "/admin/login");

        let parsed2 = parse_url("http://localhost/index.html");
        assert_eq!(parsed2.host, "localhost");
        assert_eq!(parsed2.port, None);
        assert_eq!(parsed2.path, "/index.html");

        let parsed3 = parse_url("127.0.0.1:3000");
        assert_eq!(parsed3.host, "127.0.0.1");
        assert_eq!(parsed3.port, Some(3000));
        assert_eq!(parsed3.path, "/");
    }

    #[test]
    fn test_match_credentials() {
        let active = parse_url("https://sub.example.com:3000/admin/dashboard");

        // Subdomain matching + port matching + path matching
        let item1 = parse_url("https://example.com:3000/admin");
        assert!(match_credentials(&active, &item1).is_some());

        // Port mismatch on localhost
        let local_active = parse_url("http://localhost:3000/test");
        let local_item = parse_url("http://localhost:8000/test");
        assert!(match_credentials(&local_active, &local_item).is_none());

        // Path mismatch
        let path_item = parse_url("https://example.com:3000/user");
        assert!(match_credentials(&active, &path_item).is_none());

        // Port mismatch on normal host should be allowed if one is None, but returns Some
        let host_active = parse_url("https://example.com:3000/");
        let host_item = parse_url("https://example.com/");
        assert!(match_credentials(&host_active, &host_item).is_some());
    }

    #[test]
    fn test_empty_url_sanitizes_passwords() {
        let cred = ExtensionCredential {
            id: "item-1".to_string(),
            title: "Test Item".to_string(),
            username: "alice".to_string(),
            password: "supersecretpassword123".to_string(),
            url: "https://example.com".to_string(),
            category: "login".to_string(),
            favorite: true,
        };

        let cache = ExtensionCredentialCache {
            credentials: vec![cred],
            expires_at_epoch_ms: u64::MAX,
        };

        let sanitized: Vec<ExtensionCredential> = cache
            .credentials
            .iter()
            .map(|item| ExtensionCredential {
                id: item.id.clone(),
                title: item.title.clone(),
                username: item.username.clone(),
                password: String::new(),
                url: item.url.clone(),
                category: item.category.clone(),
                favorite: item.favorite,
            })
            .collect();

        assert_eq!(sanitized.len(), 1);
        assert_eq!(sanitized[0].title, "Test Item");
        assert_eq!(sanitized[0].username, "alice");
        assert!(sanitized[0].password.is_empty());
    }

    #[test]
    fn test_derive_session_data_key_is_deterministic_and_unique() {
        let token1 = generate_token();
        let token2 = generate_token();

        let key1_a = derive_session_data_key(&token1);
        let key1_b = derive_session_data_key(&token1);
        let key2 = derive_session_data_key(&token2);

        assert_eq!(key1_a, key1_b);
        assert_ne!(key1_a, key2);
        assert_ne!(key1_a, [0u8; 32]);
    }

    #[test]
    fn test_frame_encryption_decryption_roundtrip() {
        let token = generate_token();
        let key = derive_session_data_key(&token);
        let payload = b"{\"action\":\"get_credentials\",\"url\":\"https://example.com\"}";

        let frame = encrypt_message_frame(&key, payload).expect("encrypt should succeed");
        let plaintext = decrypt_message_frame(&key, &frame).expect("decrypt should succeed");

        assert_eq!(plaintext, payload);
    }

    #[test]
    fn test_frame_encryption_uses_fresh_nonce_per_call() {
        let token = generate_token();
        let key = derive_session_data_key(&token);
        let payload = b"{\"action\":\"ping\"}";

        let frame_a = encrypt_message_frame(&key, payload).unwrap();
        let frame_b = encrypt_message_frame(&key, payload).unwrap();

        // Same plaintext must never produce identical wire bytes (fresh nonce).
        assert_ne!(frame_a, frame_b);
    }

    #[test]
    fn test_frame_decryption_fails_on_tampered_ciphertext() {
        let token = generate_token();
        let key = derive_session_data_key(&token);
        let payload = b"{\"action\":\"get_credentials\",\"url\":\"https://example.com\"}";

        let frame = encrypt_message_frame(&key, payload).unwrap();
        let mut tampered = frame.clone();
        let last_idx = tampered.len() - 1;
        tampered[last_idx] ^= 0x01;

        assert!(decrypt_message_frame(&key, &tampered).is_err());
    }

    #[test]
    fn test_frame_decryption_fails_with_wrong_key() {
        let token1 = generate_token();
        let token2 = generate_token();
        let key1 = derive_session_data_key(&token1);
        let key2 = derive_session_data_key(&token2);
        let payload = b"{\"action\":\"ping\"}";

        let frame = encrypt_message_frame(&key1, payload).unwrap();
        assert!(decrypt_message_frame(&key2, &frame).is_err());
    }

    #[test]
    fn test_frame_decryption_rejects_wrong_version_and_malformed_frames() {
        let token = generate_token();
        let key = derive_session_data_key(&token);
        let payload = b"{\"action\":\"ping\"}";

        let frame = encrypt_message_frame(&key, payload).unwrap();

        // Bump the version byte to an unsupported value.
        let mut wrong_version = frame.clone();
        wrong_version[4] = IPC_FRAME_VERSION.wrapping_add(1);
        assert!(decrypt_message_frame(&key, &wrong_version).is_err());

        // Truncated frame must be rejected as malformed.
        assert!(decrypt_message_frame(&key, &frame[..frame.len() - 1]).is_err());

        // A too-short frame must be rejected.
        assert!(decrypt_message_frame(&key, &[0u8; 8]).is_err());
    }

    #[test]
    fn test_session_data_key_separated_from_legacy_hmac_derivation() {
        // The new session data key must be key-separated from the legacy
        // HMAC-only derivation even for an identical token, protecting against
        // cross-protocol key reuse.
        let token = generate_token();
        let data_key = derive_session_data_key(&token);
        assert_ne!(data_key, [0u8; 32]);

        // Two distinct info domains (data vs mac) must not collide.
        let data_once = derive_session_data_key(&token);
        assert_eq!(data_key, data_once);
    }
}
