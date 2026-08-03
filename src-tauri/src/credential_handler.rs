use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RustArgon2idOptions {
    #[serde(alias = "memoryKiB")]
    pub memory_kib: Option<u32>,
    pub iterations: Option<u32>,
    pub parallelism: Option<u32>,
    #[serde(alias = "hashLength")]
    pub hash_length: Option<u32>,
}

impl RustArgon2idOptions {
    fn to_params(&self) -> Result<argon2::Params, String> {
        let mem = self.memory_kib.unwrap_or(128 * 1024);
        let time = self.iterations.unwrap_or(4);
        let lanes = self.parallelism.unwrap_or(1);
        let key_len = self.hash_length.unwrap_or(32);

        argon2::Params::new(mem, time, lanes, Some(key_len as usize))
            .map_err(|e| format!("invalid Argon2id parameters: {e}"))
    }
}

fn get_params(options: Option<RustArgon2idOptions>) -> Result<argon2::Params, String> {
    let opts = options.unwrap_or(RustArgon2idOptions {
        memory_kib: None,
        iterations: None,
        parallelism: None,
        hash_length: None,
    });
    opts.to_params()
}

pub fn derive_argon2id_key_internal(
    password: &str,
    salt: &str,
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

#[derive(Default, Zeroize, ZeroizeOnDrop)]
pub struct SessionState {
    active_credential: Option<Vec<u8>>,
    active_account_secret_key: Option<Vec<u8>>,
    active_backup_password: Option<Vec<u8>>,
    active_vault_key: Option<Vec<u8>>,
}

impl SessionState {
    pub fn clear(&mut self) {
        self.zeroize();
        self.active_credential = None;
        self.active_account_secret_key = None;
        self.active_backup_password = None;
        self.active_vault_key = None;
    }
}

pub struct CredentialSession {
    pub state: Mutex<SessionState>,
}

impl Default for CredentialSession {
    fn default() -> Self {
        Self {
            state: Mutex::new(SessionState::default()),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RustSetupResult {
    pub vault_encryption_key: Vec<u8>,
    pub argon_hash: String,
    pub salt: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RustRotationResult {
    pub new_vault_key: Vec<u8>,
    pub new_argon_hash: String,
}

fn resolve_backup_password(password: &str, explicit_backup: Option<String>) -> String {
    if let Some(bp) = explicit_backup {
        bp
    } else if password.starts_with("aegis-vault-v7:") {
        if let Some(sep_idx) = password.find('\0') {
            password["aegis-vault-v7:".len()..sep_idx].to_string()
        } else {
            password.to_string()
        }
    } else {
        password.to_string()
    }
}

#[tauri::command]
pub fn open_rust_session(
    session: State<'_, CredentialSession>,
    password: String,
    backup_password: Option<String>,
    argon_hash: String,
    salt: String,
    kdf_params: Option<RustArgon2idOptions>,
    secret_key: Option<String>,
) -> Result<Vec<u8>, String> {
    use argon2::{
        password_hash::{PasswordHash, PasswordVerifier},
        Argon2,
    };

    let parsed_hash =
        PasswordHash::new(&argon_hash).map_err(|e| format!("invalid password hash format: {e}"))?;

    let verified = Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok();

    if !verified {
        return Err("invalid-master-password".to_string());
    }

    let derived_key = derive_argon2id_key_internal(&password, &salt, kdf_params)?;

    let mut state = session.state.lock().map_err(|e| e.to_string())?;
    state.clear();

    state.active_credential = Some(password.as_bytes().to_vec());
    let bp = resolve_backup_password(&password, backup_password);
    state.active_backup_password = Some(bp.as_bytes().to_vec());
    if let Some(sk) = secret_key {
        state.active_account_secret_key = Some(sk.as_bytes().to_vec());
    }
    state.active_vault_key = Some(derived_key.clone());

    Ok(derived_key)
}

#[tauri::command]
pub fn setup_rust_session(
    session: State<'_, CredentialSession>,
    password: String,
    backup_password: Option<String>,
    secret_key: Option<String>,
    salt: String,
    kdf_params: Option<RustArgon2idOptions>,
) -> Result<RustSetupResult, String> {
    use argon2::{
        password_hash::{PasswordHasher, SaltString},
        Algorithm, Argon2, Version,
    };
    use rand::Rng;

    let derived_key = derive_argon2id_key_internal(&password, &salt, kdf_params.clone())?;

    let params = get_params(kdf_params)?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut rng_bytes = [0u8; 16];
    rand::thread_rng().fill(&mut rng_bytes);
    let salt_str = SaltString::encode_b64(&rng_bytes)
        .map_err(|e| format!("failed to encode random salt: {e}"))?;

    let argon_hash = argon2
        .hash_password(password.as_bytes(), &salt_str)
        .map_err(|e| format!("Argon2id hashing failed: {e}"))?
        .to_string();

    let mut state = session.state.lock().map_err(|e| e.to_string())?;
    state.clear();

    state.active_credential = Some(password.as_bytes().to_vec());
    let bp = resolve_backup_password(&password, backup_password);
    state.active_backup_password = Some(bp.as_bytes().to_vec());
    if let Some(sk) = secret_key {
        state.active_account_secret_key = Some(sk.as_bytes().to_vec());
    }
    state.active_vault_key = Some(derived_key.clone());

    Ok(RustSetupResult {
        vault_encryption_key: derived_key,
        argon_hash,
        salt,
    })
}

#[tauri::command]
pub fn rotate_rust_session(
    session: State<'_, CredentialSession>,
    old_password: String,
    new_password: String,
    backup_password: Option<String>,
    new_salt: String,
    kdf_params: Option<RustArgon2idOptions>,
) -> Result<RustRotationResult, String> {
    use argon2::{
        password_hash::{PasswordHasher, SaltString},
        Algorithm, Argon2, Version,
    };
    use rand::Rng;

    let mut state = session.state.lock().map_err(|e| e.to_string())?;

    let matches_old = match state.active_credential {
        Some(ref bytes) => bytes == old_password.as_bytes(),
        None => false,
    };

    if !matches_old {
        return Err("current-master-password-invalid".to_string());
    }

    let new_vault_key = derive_argon2id_key_internal(&new_password, &new_salt, kdf_params.clone())?;

    let params = get_params(kdf_params)?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut rng_bytes = [0u8; 16];
    rand::thread_rng().fill(&mut rng_bytes);
    let salt_str = SaltString::encode_b64(&rng_bytes)
        .map_err(|e| format!("failed to encode random salt: {e}"))?;

    let new_argon_hash = argon2
        .hash_password(new_password.as_bytes(), &salt_str)
        .map_err(|e| format!("Argon2id hashing failed: {e}"))?
        .to_string();

    state.active_credential = Some(new_password.as_bytes().to_vec());
    let bp = resolve_backup_password(&new_password, backup_password);
    state.active_backup_password = Some(bp.as_bytes().to_vec());
    state.active_vault_key = Some(new_vault_key.clone());

    Ok(RustRotationResult {
        new_vault_key,
        new_argon_hash,
    })
}

#[tauri::command]
pub fn close_rust_session(session: State<'_, CredentialSession>) -> Result<(), String> {
    let mut state = session.state.lock().map_err(|e| e.to_string())?;
    state.clear();
    Ok(())
}

#[tauri::command]
pub fn get_rust_active_credential(
    session: State<'_, CredentialSession>,
) -> Result<Option<String>, String> {
    let state = session.state.lock().map_err(|e| e.to_string())?;
    if let Some(ref bytes) = state.active_credential {
        String::from_utf8(bytes.clone())
            .map(Some)
            .map_err(|e| e.to_string())
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn get_rust_active_backup_password(
    session: State<'_, CredentialSession>,
) -> Result<Option<String>, String> {
    let state = session.state.lock().map_err(|e| e.to_string())?;
    if let Some(ref bytes) = state.active_backup_password {
        String::from_utf8(bytes.clone())
            .map(Some)
            .map_err(|e| e.to_string())
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn get_rust_active_account_secret_key(
    session: State<'_, CredentialSession>,
) -> Result<Option<String>, String> {
    let state = session.state.lock().map_err(|e| e.to_string())?;
    if let Some(ref bytes) = state.active_account_secret_key {
        String::from_utf8(bytes.clone())
            .map(Some)
            .map_err(|e| e.to_string())
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn get_rust_active_vault_key(
    session: State<'_, CredentialSession>,
) -> Result<Option<Vec<u8>>, String> {
    let state = session.state.lock().map_err(|e| e.to_string())?;
    Ok(state.active_vault_key.clone())
}

#[tauri::command]
pub fn update_rust_active_vault_key(
    session: State<'_, CredentialSession>,
    new_vault_key: Vec<u8>,
) -> Result<(), String> {
    let mut state = session.state.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut bytes) = state.active_vault_key {
        bytes.zeroize();
    }
    state.active_vault_key = Some(new_vault_key);
    Ok(())
}

#[tauri::command]
pub fn has_rust_session(session: State<'_, CredentialSession>) -> Result<bool, String> {
    let state = session.state.lock().map_err(|e| e.to_string())?;
    Ok(state.active_credential.is_some() || state.active_vault_key.is_some())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_backup_password() {
        assert_eq!(
            resolve_backup_password("my-pass", None),
            "my-pass"
        );
        assert_eq!(
            resolve_backup_password("my-pass", Some("explicit-bp".into())),
            "explicit-bp"
        );
        assert_eq!(
            resolve_backup_password("aegis-vault-v7:my-pass\0A3-SECRET-KEY", None),
            "my-pass"
        );
    }
}
