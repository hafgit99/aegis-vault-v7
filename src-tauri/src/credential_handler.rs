use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
use zeroize::{Zeroize, ZeroizeOnDrop};

/// Y-16: Argon2id cost bounds at the IPC trust boundary.
///
/// The floors existed but the ceilings did not. These parameters arrive from the
/// webview over IPC, so a compromised renderer — or anything else able to reach
/// the command — could ask for `memoryKiB: 4_000_000_000` or
/// `iterations: 4_000_000_000` and the process would try to honour it, aborting
/// on an allocation failure or spinning for effectively forever. That is a
/// denial of service reachable from the renderer, and on desktop it takes the
/// whole application down with it.
///
/// The ceilings are far above anything this application asks for: the shipped
/// profiles use 32–64 MiB, 3–4 iterations, 1 lane and a 32-byte output. They
/// exist to bound the damage, not to constrain legitimate use.
pub const MIN_ARGON2ID_MEMORY_KIB: u32 = 8 * 1024; // 8 MiB
pub const MAX_ARGON2ID_MEMORY_KIB: u32 = 1024 * 1024; // 1 GiB
pub const MIN_ARGON2ID_ITERATIONS: u32 = 3;
pub const MAX_ARGON2ID_ITERATIONS: u32 = 20;
pub const MIN_ARGON2ID_PARALLELISM: u32 = 1;
pub const MAX_ARGON2ID_PARALLELISM: u32 = 16;
pub const MIN_ARGON2ID_HASH_LENGTH: u32 = 32;
pub const MAX_ARGON2ID_HASH_LENGTH: u32 = 64;

const ARGON2ID_MEMORY_RANGE: std::ops::RangeInclusive<u32> =
    MIN_ARGON2ID_MEMORY_KIB..=MAX_ARGON2ID_MEMORY_KIB;
const ARGON2ID_ITERATION_RANGE: std::ops::RangeInclusive<u32> =
    MIN_ARGON2ID_ITERATIONS..=MAX_ARGON2ID_ITERATIONS;
const ARGON2ID_PARALLELISM_RANGE: std::ops::RangeInclusive<u32> =
    MIN_ARGON2ID_PARALLELISM..=MAX_ARGON2ID_PARALLELISM;
const ARGON2ID_HASH_LENGTH_RANGE: std::ops::RangeInclusive<u32> =
    MIN_ARGON2ID_HASH_LENGTH..=MAX_ARGON2ID_HASH_LENGTH;

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
    /**
     * Resolves the requested cost, then **rejects** anything outside the bounds.
     *
     * Rejecting rather than clamping is deliberate. Silently reducing a request
     * for four billion iterations to twenty would hand the caller a key derived
     * under parameters it did not ask for, while reporting success — a subtler
     * and harder-to-debug failure than an explicit refusal. Every caller in this
     * codebase uses values far inside the bounds, so nothing legitimate is
     * rejected.
     */
    fn to_params(&self) -> Result<argon2::Params, String> {
        let mem = clamp_or_reject(
            "memoryKiB",
            self.memory_kib,
            32 * 1024,
            ARGON2ID_MEMORY_RANGE,
        )?;
        let time = clamp_or_reject("iterations", self.iterations, 3, ARGON2ID_ITERATION_RANGE)?;
        let lanes = clamp_or_reject(
            "parallelism",
            self.parallelism,
            1,
            ARGON2ID_PARALLELISM_RANGE,
        )?;
        let key_len = clamp_or_reject(
            "hashLength",
            self.hash_length,
            32,
            ARGON2ID_HASH_LENGTH_RANGE,
        )?;

        argon2::Params::new(mem, time, lanes, Some(key_len as usize))
            .map_err(|e| format!("invalid Argon2id parameters: {e}"))
    }
}

/// Applies the floor and enforces the ceiling for one cost parameter.
fn clamp_or_reject(
    name: &str,
    requested: Option<u32>,
    default: u32,
    range: std::ops::RangeInclusive<u32>,
) -> Result<u32, String> {
    let value = requested.unwrap_or(default);
    if !range.contains(&value) {
        return Err(format!(
            "argon2id-parameter-out-of-range: {name}={value} is outside {}..={}",
            range.start(),
            range.end()
        ));
    }
    Ok(value)
}

pub fn get_params(options: Option<RustArgon2idOptions>) -> Result<argon2::Params, String> {
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

/// Y-18/#42: error returned when a vault command is invoked with no session.
///
/// Distinct from every other error string so the renderer can tell "you are
/// locked" apart from "this failed", and so it can never be mistaken for a
/// transport problem and silently retried.
pub const NO_ACTIVE_SESSION_ERROR: &str = "vault-session-required";

impl CredentialSession {
    /// #42: fail-closed session gate for vault-data commands.
    ///
    /// Tauri commands are reachable from the renderer. Without this, a renderer
    /// that is locked — or that was never unlocked, e.g. on the lock screen
    /// before any credential is accepted — can still call `read_vault_database`,
    /// `write_vault_database`, `reset_vault_database` and the extension
    /// credential commands. Reading the vault file does not require the master
    /// password to *hold* it, so those commands were an authentication bypass
    /// around the whole unlock flow.
    ///
    /// Deliberately **not** applied to the Argon2id commands or the asset
    /// integrity anchor: those run *during* unlock, so requiring a session
    /// would make unlocking impossible.
    pub fn require_active_session(&self) -> Result<(), String> {
        let state = self
            .state
            .lock()
            .map_err(|_| NO_ACTIVE_SESSION_ERROR.to_string())?;
        if state.active_credential.is_some() || state.active_vault_key.is_some() {
            Ok(())
        } else {
            Err(NO_ACTIVE_SESSION_ERROR.to_string())
        }
    }

    /// Establishes the credential half of a session. Used by `open_rust_session`
    /// and by the session-gate tests.
    ///
    /// `cfg(test)`: the session-gate tests need to drive the state directly, and
    /// no production caller does -- `open_rust_session` sets it inline. Marked
    /// rather than deleted so the tests keep asserting against the real type.
    #[cfg(test)]
    pub fn set_active_credential_for_session(&self, password: &str) -> Result<(), String> {
        let mut state = self.state.lock().map_err(|e| e.to_string())?;
        state.active_credential = Some(password.as_bytes().to_vec());
        Ok(())
    }

    /// Establishes the vault-key half of a session. `cfg(test)`, see above.
    #[cfg(test)]
    pub fn set_active_vault_key_for_session(&self, key: Vec<u8>) -> Result<(), String> {
        let mut state = self.state.lock().map_err(|e| e.to_string())?;
        state.active_vault_key = Some(key);
        Ok(())
    }
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
    mut password: String,
    backup_password: Option<String>,
    argon_hash: String,
    salt: String,
    kdf_params: Option<RustArgon2idOptions>,
    mut secret_key: Option<String>,
) -> Result<Vec<u8>, String> {
    use argon2::{password_hash::phc::PasswordHash, password_hash::PasswordVerifier, Argon2};

    let parsed_hash =
        PasswordHash::new(&argon_hash).map_err(|e| format!("invalid password hash format: {e}"))?;

    let verified = Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok();

    if !verified {
        password.zeroize();
        if let Some(ref mut sk) = secret_key {
            sk.zeroize();
        }
        return Err("invalid-master-password".to_string());
    }

    let derived_key = derive_argon2id_key_internal(&password, &salt, kdf_params)?;

    let mut state = session.state.lock().map_err(|e| e.to_string())?;
    state.clear();

    state.active_credential = Some(password.as_bytes().to_vec());
    let mut bp = resolve_backup_password(&password, backup_password);
    state.active_backup_password = Some(bp.as_bytes().to_vec());
    if let Some(ref sk) = secret_key {
        state.active_account_secret_key = Some(sk.as_bytes().to_vec());
    }
    state.active_vault_key = Some(derived_key.clone());

    password.zeroize();
    bp.zeroize();
    if let Some(ref mut sk) = secret_key {
        sk.zeroize();
    }

    Ok(derived_key)
}

#[tauri::command]
pub fn setup_rust_session(
    session: State<'_, CredentialSession>,
    mut password: String,
    backup_password: Option<String>,
    mut secret_key: Option<String>,
    salt: String,
    kdf_params: Option<RustArgon2idOptions>,
) -> Result<RustSetupResult, String> {
    use argon2::password_hash::PasswordHasher;
    use argon2::{Algorithm, Argon2, Version};

    let derived_key = derive_argon2id_key_internal(&password, &salt, kdf_params.clone())?;

    let params = get_params(kdf_params)?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut rng_bytes = [0u8; 16];
    getrandom::fill(&mut rng_bytes).map_err(|e| {
        password.zeroize();
        format!("CSPRNG failure: {e}")
    })?;

    let argon_hash = argon2
        .hash_password_with_salt(password.as_bytes(), &rng_bytes)
        .map_err(|e| {
            password.zeroize();
            format!("Argon2id hashing failed: {e}")
        })?
        .to_string();

    let mut state = session.state.lock().map_err(|e| e.to_string())?;
    state.clear();

    state.active_credential = Some(password.as_bytes().to_vec());
    let mut bp = resolve_backup_password(&password, backup_password);
    state.active_backup_password = Some(bp.as_bytes().to_vec());
    if let Some(ref sk) = secret_key {
        state.active_account_secret_key = Some(sk.as_bytes().to_vec());
    }
    state.active_vault_key = Some(derived_key.clone());

    password.zeroize();
    bp.zeroize();
    if let Some(ref mut sk) = secret_key {
        sk.zeroize();
    }

    Ok(RustSetupResult {
        vault_encryption_key: derived_key,
        argon_hash,
        salt,
    })
}

#[tauri::command]
pub fn rotate_rust_session(
    session: State<'_, CredentialSession>,
    mut old_password: String,
    mut new_password: String,
    backup_password: Option<String>,
    new_salt: String,
    kdf_params: Option<RustArgon2idOptions>,
) -> Result<RustRotationResult, String> {
    use argon2::password_hash::PasswordHasher;
    use argon2::{Algorithm, Argon2, Version};
    use subtle::ConstantTimeEq;

    let mut state = session.state.lock().map_err(|e| e.to_string())?;

    let matches_old = match state.active_credential {
        Some(ref bytes) => {
            let old_bytes = old_password.as_bytes();
            if bytes.len() == old_bytes.len() {
                bool::from(bytes.ct_eq(old_bytes))
            } else {
                false
            }
        }
        None => false,
    };

    if !matches_old {
        old_password.zeroize();
        new_password.zeroize();
        return Err("current-master-password-invalid".to_string());
    }

    let new_vault_key = derive_argon2id_key_internal(&new_password, &new_salt, kdf_params.clone())?;

    let params = get_params(kdf_params)?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut rng_bytes = [0u8; 16];
    getrandom::fill(&mut rng_bytes).map_err(|e| {
        old_password.zeroize();
        new_password.zeroize();
        format!("CSPRNG failure: {e}")
    })?;

    let new_argon_hash = argon2
        .hash_password_with_salt(new_password.as_bytes(), &rng_bytes)
        .map_err(|e| {
            old_password.zeroize();
            new_password.zeroize();
            format!("Argon2id hashing failed: {e}")
        })?
        .to_string();

    state.active_credential = Some(new_password.as_bytes().to_vec());
    let mut bp = resolve_backup_password(&new_password, backup_password);
    state.active_backup_password = Some(bp.as_bytes().to_vec());
    state.active_vault_key = Some(new_vault_key.clone());

    old_password.zeroize();
    new_password.zeroize();
    bp.zeroize();

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

    // ─── Y-16: IPC cost-parameter bounds ─────────────────────────────────────
    //
    // These parameters cross a trust boundary. Before the ceilings existed, a
    // renderer could request `memoryKiB: 4_000_000_000` and the process would
    // attempt the allocation — an abort, or an unbounded spin for the iteration
    // count. Every test below drives `get_params`, the single choke point every
    // IPC entry point goes through.

    fn opts(
        memory_kib: Option<u32>,
        iterations: Option<u32>,
        parallelism: Option<u32>,
        hash_length: Option<u32>,
    ) -> Option<RustArgon2idOptions> {
        Some(RustArgon2idOptions {
            memory_kib,
            iterations,
            parallelism,
            hash_length,
        })
    }

    #[test]
    fn y16_accepts_the_shipped_profiles() {
        // 32 MiB / 3 iterations is what the application actually sends.
        assert!(get_params(opts(Some(32 * 1024), Some(3), Some(1), Some(32))).is_ok());
        assert!(get_params(opts(Some(64 * 1024), Some(4), Some(1), Some(32))).is_ok());
        assert!(get_params(None).is_ok());
    }

    #[test]
    fn y16_rejects_absurd_memory_requests() {
        // The DoS: a renderer asking for ~4 TB of memory.
        let err = get_params(opts(Some(4_000_000_000), Some(3), Some(1), Some(32)))
            .expect_err("must reject an unbounded memory request");
        assert!(
            err.contains("argon2id-parameter-out-of-range"),
            "got: {err}"
        );
        assert!(err.contains("memoryKiB"), "got: {err}");
    }

    #[test]
    fn y16_rejects_absurd_iteration_requests() {
        // The other DoS: four billion passes.
        let err = get_params(opts(
            Some(32 * 1024),
            Some(4_000_000_000),
            Some(1),
            Some(32),
        ))
        .expect_err("must reject an unbounded iteration request");
        assert!(
            err.contains("argon2id-parameter-out-of-range"),
            "got: {err}"
        );
        assert!(err.contains("iterations"), "got: {err}");
    }

    #[test]
    fn y16_rejects_absurd_parallelism() {
        let err = get_params(opts(
            Some(32 * 1024),
            Some(3),
            Some(4_000_000_000),
            Some(32),
        ))
        .expect_err("must reject an unbounded lane count");
        assert!(err.contains("parallelism"), "got: {err}");
    }

    #[test]
    fn y16_rejects_oversized_output_lengths() {
        // A huge output length would allocate a large buffer per call.
        let err = get_params(opts(Some(32 * 1024), Some(3), Some(1), Some(1_000_000)))
            .expect_err("must reject an oversized hash length");
        assert!(err.contains("hashLength"), "got: {err}");
    }

    #[test]
    fn y16_rejects_weak_values_instead_of_silently_raising_them() {
        // The old code clamped these upwards with `.max()`. Rejecting keeps the
        // caller honest instead of quietly deriving under parameters it did not
        // ask for.
        assert!(get_params(opts(Some(1024), Some(3), Some(1), Some(32))).is_err());
        assert!(get_params(opts(Some(32 * 1024), Some(1), Some(1), Some(32))).is_err());
        assert!(get_params(opts(Some(32 * 1024), Some(3), Some(0), Some(32))).is_err());
        assert!(get_params(opts(Some(32 * 1024), Some(3), Some(1), Some(8))).is_err());
    }

    #[test]
    fn y16_accepts_values_exactly_on_the_boundaries() {
        assert!(get_params(opts(
            Some(MIN_ARGON2ID_MEMORY_KIB),
            Some(MIN_ARGON2ID_ITERATIONS),
            Some(MIN_ARGON2ID_PARALLELISM),
            Some(MIN_ARGON2ID_HASH_LENGTH)
        ))
        .is_ok());
        assert!(get_params(opts(
            Some(MAX_ARGON2ID_MEMORY_KIB),
            Some(MAX_ARGON2ID_ITERATIONS),
            Some(MAX_ARGON2ID_PARALLELISM),
            Some(MAX_ARGON2ID_HASH_LENGTH)
        ))
        .is_ok());
    }

    #[test]
    fn y16_rejects_values_just_past_the_boundaries() {
        assert!(get_params(opts(
            Some(MAX_ARGON2ID_MEMORY_KIB + 1),
            Some(3),
            Some(1),
            Some(32)
        ))
        .is_err());
        assert!(get_params(opts(
            Some(32 * 1024),
            Some(MAX_ARGON2ID_ITERATIONS + 1),
            Some(1),
            Some(32)
        ))
        .is_err());
        assert!(get_params(opts(
            Some(32 * 1024),
            Some(3),
            Some(MAX_ARGON2ID_PARALLELISM + 1),
            Some(32)
        ))
        .is_err());
        assert!(get_params(opts(
            Some(32 * 1024),
            Some(3),
            Some(1),
            Some(MAX_ARGON2ID_HASH_LENGTH + 1)
        ))
        .is_err());
    }

    #[test]
    fn y16_derivation_rejects_before_allocating() {
        // The end-to-end shape of the DoS: a key derivation attempt with an
        // absurd cost must fail fast rather than attempting the work.
        let result = derive_argon2id_key_internal(
            "password",
            "saltsaltsaltsalt",
            opts(Some(4_000_000_000), None, None, None),
        );
        assert!(result.is_err());
    }

    #[test]
    fn y16_derivation_still_works_inside_the_bounds() {
        let derived = derive_argon2id_key_internal(
            "password",
            "saltsaltsaltsalt",
            opts(Some(8 * 1024), Some(3), Some(1), Some(32)),
        )
        .expect("in-bounds derivation must succeed");
        assert_eq!(derived.len(), 32);
    }

    #[test]
    fn y16_ceiling_covers_the_range_the_argon2_crate_itself_accepts() {
        // Why this finding is real and not already handled upstream.
        //
        // `argon2::Params::new` does validate — but only against the Argon2
        // *specification* limits, which are nowhere near a safe allocation for a
        // desktop process. A request for ~2 GiB of memory is perfectly legal to
        // the crate and would be attempted. So the crate's own check does not
        // cover the dangerous middle of the range, and a ceiling here is what
        // actually bounds it.
        assert!(
            argon2::Params::new(2_000_000, 3, 1, Some(32)).is_ok(),
            "precondition: the argon2 crate accepts ~2 GiB, so it will not save us"
        );
        assert!(
            get_params(opts(Some(2_000_000), Some(3), Some(1), Some(32))).is_err(),
            "our ceiling must reject what the crate accepts"
        );
    }

    #[test]
    fn y42_session_gate_refuses_when_locked() {
        // #42: the gate is fail-closed. With no credential and no vault key
        // held, a vault-data command must not proceed.
        let session = super::CredentialSession::default();

        assert_eq!(
            session
                .require_active_session()
                .expect_err("must refuse when locked"),
            super::NO_ACTIVE_SESSION_ERROR
        );
    }

    #[test]
    fn y42_session_gate_allows_a_credential_held_session() {
        let session = super::CredentialSession::default();
        session
            .set_active_credential_for_session("master-pass")
            .expect("credential");

        assert!(session.require_active_session().is_ok());
    }

    #[test]
    fn y42_session_gate_allows_a_vault_key_held_session() {
        // Some flows hold only the derived vault key.
        let session = super::CredentialSession::default();
        session
            .set_active_vault_key_for_session(vec![7u8; 32])
            .expect("vault key");

        assert!(session.require_active_session().is_ok());
    }

    #[test]
    fn y42_session_gate_refuses_again_after_the_session_is_cleared() {
        // Locking must actually revoke the gate, otherwise the check is theatre.
        let session = super::CredentialSession::default();
        session
            .set_active_credential_for_session("master-pass")
            .expect("credential");
        assert!(session.require_active_session().is_ok());

        // This is the production revoke path, not a test-only wrapper:
        // `close_rust_session` takes the same lock and calls `SessionState::clear`
        // (see the `close_rust_session` command). The wrapper that used to sit
        // here did nothing the production path does not already do, so testing
        // it only proved the wrapper worked.
        session
            .state
            .lock()
            .expect("session lock")
            .clear();

        assert_eq!(
            session
                .require_active_session()
                .expect_err("lock must revoke access"),
            super::NO_ACTIVE_SESSION_ERROR
        );
    }

    #[test]
    fn y42_session_gate_error_is_distinguishable() {
        // The renderer must be able to tell "you are locked" from "this failed",
        // and it must never collide with another error string.
        assert_ne!(super::NO_ACTIVE_SESSION_ERROR, "vault-database-unreadable");
        assert_ne!(
            super::NO_ACTIVE_SESSION_ERROR,
            "current-master-password-invalid"
        );
        assert!(super::NO_ACTIVE_SESSION_ERROR.contains("session"));
    }

    #[test]
    fn y42_argon2id_commands_do_not_require_a_session() {
        // Unlocking must remain possible: the Argon2id commands run *before* a
        // session exists, so gating them would deadlock the unlock flow. This
        // test exists to stop someone "fixing" the inconsistency by gating them.
        let session = super::CredentialSession::default();

        assert!(
            session.require_active_session().is_err(),
            "precondition: locked"
        );
        assert!(
            get_params(None).is_ok(),
            "key derivation must work with no session — it is how one is created"
        );
    }

    #[test]
    fn test_resolve_backup_password() {
        assert_eq!(resolve_backup_password("my-pass", None), "my-pass");
        assert_eq!(
            resolve_backup_password("my-pass", Some("explicit-bp".into())),
            "explicit-bp"
        );
        assert_eq!(
            resolve_backup_password("aegis-vault-v7:my-pass\0A3-SECRET-KEY", None),
            "my-pass"
        );
    }

    /// Backward-compatibility golden test: verifies a PHC-format Argon2id
    /// hash in the exact format stored by every previous release of the
    /// vault. Argon2id is a deterministic function defined by RFC 9106, so
    /// this vector is byte-for-byte identical to the output of the prior
    /// argon2 crate versions (0.4/0.5) for the same parameters
    /// (m=32, t=1, p=1, v=19, 16-byte salt 0x02*16). If this test fails,
    /// existing users' vaults would no longer unlock — release must block.
    #[test]
    fn test_verify_phc_golden() {
        use argon2::{
            password_hash::{phc::PasswordHash, PasswordVerifier},
            Algorithm, Argon2, Params, Version,
        };

        const GOLDEN_PHC: &str =
            "$argon2id$v=19$m=32,t=1,p=1$AgICAgICAgICAgICAgICAg$GJsoyDAQFNCICzYmOVGV4M6jznJXRfccXuQEVAbm9dc";

        let parsed = PasswordHash::new(GOLDEN_PHC).expect("golden PHC must parse");
        let argon2 = Argon2::new(
            Algorithm::Argon2id,
            Version::V0x13,
            Params::new(32, 1, 1, Some(32)).unwrap(),
        );
        // Correct password verifies.
        assert!(argon2
            .verify_password(b"aegis-golden-password", &parsed)
            .is_ok());
        // Wrong password rejects.
        assert!(argon2.verify_password(b"wrong-password", &parsed).is_err());
    }
}
