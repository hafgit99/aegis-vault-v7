use serde_json::Value;
use std::{env, fs};

const MANIFEST_PATH: &str = "../dist/aegis-integrity.json";

fn integrity_root() -> Option<String> {
    let contents = fs::read_to_string(MANIFEST_PATH).ok()?;
    let manifest: Value = serde_json::from_str(&contents).ok()?;
    if manifest.get("schemaVersion")?.as_u64()? != 1
        || manifest.get("algorithm")?.as_str()? != "SHA-256"
    {
        return None;
    }
    let root = manifest.get("rootSha256")?.as_str()?.to_ascii_lowercase();
    if root.len() != 64 || !root.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    Some(root)
}

fn main() {
    println!("cargo:rerun-if-changed={MANIFEST_PATH}");

    let profile = env::var("PROFILE").unwrap_or_default();
    let root = integrity_root();
    if profile == "release" && root.is_none() {
        panic!("release build requires a valid dist/aegis-integrity.json manifest");
    }
    println!(
        "cargo:rustc-env=AEGIS_ASSET_INTEGRITY_ROOT={}",
        root.unwrap_or_default()
    );

    tauri_build::build()
}
