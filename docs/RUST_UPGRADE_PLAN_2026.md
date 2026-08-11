# Aegis Vault 7 — Rust Dependency Upgrade Plan (2026)

## Overview

This document outlines the upgrade path and compatibility strategy for Rust crates in `src-tauri/Cargo.toml`, specifically targeting the transition from `rand 0.8.6` to `rand 0.9` and `argon2 0.5` to `argon2 0.6`.

---

## Current Dependency Constellation

- **`argon2`**: `0.5.3` (depends on `password-hash 0.5` and `rand_core 0.6`)
- **`rand`**: `0.8.6` (uses `rand_core 0.6`)
- **`zeroize`**: `1.8.1` (uses `ZeroizeOnDrop`)

---

## Upgrade Triggers & Breaking Changes

1. **`rand 0.9.0` Breaking Changes:**
   - Trait method `RngCore::fill_bytes` moved to `Rng::fill`.
   - `thread_rng()` returns `ThreadRng` requiring updated `rand_core 0.9` trait bounds.
   - `argon2 0.5.3` currently relies on `rand_core 0.6`. Upgrading `rand` to `0.9` requires upgrading `argon2` in tandem once RustCrypto releases the final `argon2 0.6` crate with `rand_core 0.9` support.

2. **Step-by-Step Upgrade Pathway:**
   - **Step 1:** Wait for RustCrypto `argon2 0.6.0` release on crates.io.
   - **Step 2:** Update `Cargo.toml`:
     ```toml
     rand = "0.9"
     argon2 = "0.6"
     ```
   - **Step 3:** Update `credential_handler.rs` rng calls:
     ```rust
     // Replace rand::thread_rng().fill(&mut rng_bytes)
     // with rand::rng().fill(&mut rng_bytes)
     ```
   - **Step 4:** Run `cargo test` in `src-tauri`.
