use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fmt::Write as _;
use std::{env, fs, path::Path};

const MANIFEST_PATH: &str = "../dist/KalderaShield-integrity.json";
const DIST_DIR: &str = "../dist";
const MANIFEST_FILENAME: &str = "KalderaShield-integrity.json";
const SCHEMA_VERSION: u64 = 1;
const ALGORITHM: &str = "SHA-256";

fn is_hex64(value: &str) -> bool {
    // `chars()`, not `bytes()`: the latter indexes a [u8] as if it were a
    // [char], which is what clippy::byte_char_slices rejects, and CI runs
    // clippy with -D warnings over build scripts.
    value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit())
}

/// The root the manifest claims, without checking it against anything.
fn declared_root() -> Option<String> {
    let contents = fs::read_to_string(MANIFEST_PATH).ok()?;
    let manifest: Value = serde_json::from_str(&contents).ok()?;
    if manifest.get("schemaVersion")?.as_u64()? != SCHEMA_VERSION
        || manifest.get("algorithm")?.as_str()? != ALGORITHM
    {
        return None;
    }
    let root = manifest.get("rootSha256")?.as_str()?.to_ascii_lowercase();
    if !is_hex64(&root) {
        return None;
    }
    Some(root)
}

/// Every hashed asset path, straight from the manifest.
fn declared_asset_paths() -> Option<Vec<String>> {
    let contents = fs::read_to_string(MANIFEST_PATH).ok()?;
    let manifest: Value = serde_json::from_str(&contents).ok()?;
    let assets = manifest.get("assets")?.as_array()?;
    let mut paths = Vec::with_capacity(assets.len());
    for asset in assets {
        paths.push(asset.get("path")?.as_str()?.to_string());
    }
    Some(paths)
}

/// Recompute the canonical payload from the manifest's own entries.
///
/// This does not re-hash the files. It re-derives the root from the path,
/// digest and size triples the manifest claims, which is what the webview does
/// at runtime in `canonicalAssetPayload`. That is the comparison that matters:
/// if the manifest's `rootSha256` does not describe its own `assets` array, the
/// baked anchor and the manifest the app fetches cannot agree, and the app
/// fails closed with `manifest-root-mismatch` on every launch.
fn recomputed_root() -> Option<String> {
    let contents = fs::read_to_string(MANIFEST_PATH).ok()?;
    let manifest: Value = serde_json::from_str(&contents).ok()?;
    let assets = manifest.get("assets")?.as_array()?;

    let mut rows: Vec<(String, String, u64)> = Vec::with_capacity(assets.len());
    for asset in assets {
        let path = asset.get("path")?.as_str()?.to_string();
        let digest = asset.get("sha256")?.as_str()?.to_ascii_lowercase();
        let size = asset.get("size")?.as_u64()?;
        if !is_hex64(&digest) {
            return None;
        }
        rows.push((path, digest, size));
    }
    // The webview sorts by path with a byte comparison before hashing, so the
    // order here has to be by path alone and not by the whole tuple: a
    // duplicate path would order differently, and the runtime refuses a manifest
    // carrying one anyway.
    rows.sort_by_key(|(path, _, _)| path.clone());

    let mut hasher = Sha256::new();
    for (path, digest, size) in rows {
        hasher.update(path.as_bytes());
        hasher.update(b"\0");
        hasher.update(digest.as_bytes());
        hasher.update(b"\0");
        hasher.update(size.to_string().as_bytes());
        hasher.update(b"\n");
    }
    // Encoded by hand rather than with `{:x}`, which sha2 0.11's Output does
    // not implement, and through `write!` rather than a `format!` per byte.
    let mut root = String::with_capacity(64);
    for byte in hasher.finalize().iter() {
        // write! to a String is infallible, so the Result is deliberately
        // dropped rather than unwrapped.
        let _ = write!(root, "{byte:02x}");
    }
    Some(root)
}

/// Confirm the manifest actually covers the dist directory it was built from.
///
/// The generator walks dist/ and excludes the manifest, every `.html` (Tauri
/// rewrites those) and every source map. If dist/ gains a file the manifest
/// does not list, the new file is served to the webview unverified. The
/// reference counter-check would still reject it if the document pointed at it,
/// but the manifest should not be able to drift out of step with dist/ at all.
fn unlisted_files_on_disk(listed: &[String]) -> Vec<String> {
    let mut unlisted = Vec::new();
    let dist = Path::new(DIST_DIR);
    let Ok(entries) = fs::read_dir(dist) else {
        return unlisted;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name == MANIFEST_FILENAME
            || name == "index.html"
            || name.ends_with(".html")
            || name.ends_with(".map")
        {
            continue;
        }
        if !listed.iter().any(|candidate| candidate == name) {
            unlisted.push(name.to_string());
        }
    }
    unlisted.sort();
    unlisted
}

fn main() {
    // Track the whole dist directory, not just the manifest. Vite rewrites the
    // hashed asset names on any content change, so an edit that alters an
    // asset but somehow leaves the manifest untouched must still re-run this.
    println!("cargo:rerun-if-changed={DIST_DIR}");
    println!("cargo:rerun-if-changed={MANIFEST_PATH}");

    let profile = env::var("PROFILE").unwrap_or_default();
    let release = profile == "release";
    let root = declared_root();

    // Before this, build.rs read rootSha256 out of the manifest and baked it
    // without ever checking it. A manifest whose root did not describe its own
    // assets was baked as-is and the mismatch only surfaced at runtime, as a
    // warning telling the user their installation may have been tampered with.
    // Three different roots had accumulated in this target directory by then,
    // which is the signature of that drift.
    if let (Some(declared), Some(recomputed)) = (root.as_deref(), recomputed_root()) {
        if declared != recomputed {
            panic!(
                "dist/{MANIFEST_FILENAME}: rootSha256 does not describe its own assets \
                 (declared {declared}, recomputed {recomputed}). Refusing to bake an anchor \
                 that cannot match the manifest the app will fetch. Re-run `npm run build`."
            );
        }
    } else if release {
        panic!(
            "release build requires a valid {MANIFEST_PATH} whose rootSha256 matches its assets"
        );
    }

    if release {
        if let Some(listed) = declared_asset_paths() {
            let unlisted = unlisted_files_on_disk(&listed);
            if !unlisted.is_empty() {
                panic!(
                    "dist/ contains files the integrity manifest does not list: {}. \
                     They would be served to the webview unverified. Re-run `npm run build`.",
                    unlisted.join(", ")
                );
            }
        }
    }

    println!(
        "cargo:rustc-env=KALDERASHIELD_ASSET_INTEGRITY_ROOT={}",
        root.unwrap_or_default()
    );

    tauri_build::build()
}
