#!/bin/sh
# KalderaShield installer for Linux.
#
#   curl -fsSL https://{{DOMAIN}}/install.sh -o install.sh
#   less install.sh
#   sh install.sh
#
# What this script does, and what it refuses to do:
#
#   * It resolves the current release from the GitHub Releases redirect rather
#     than hardcoding a version, so it never goes stale. The previous version
#     of this script pinned 7.0.7 with baked-in checksums and silently
#     installed a two-year-old build.
#   * It fetches SHA256SUMS.txt from the same release and refuses to install
#     anything whose digest is not listed there. A checksum that disagrees
#     aborts the install instead of warning and continuing.
#   * It does not need root. A .deb is installed with dpkg if you have sudo,
#     and everything else goes into your home directory.
#
# For the record: it runs dpkg, which is the one step that touches the system,
# and only when you pick the .deb and sudo is available.

set -eu

REPO="hafgit99/kalderashield"
RELEASES="https://github.com/${REPO}/releases"
LATEST="${RELEASES}/latest"
# Asset downloads live under /latest/download/. Without the download segment
# GitHub returns 404, which reads like a missing release rather than a wrong URL.
ASSET_BASE="${LATEST}/download"

DEB_NAME="KalderaShield-latest-linux-amd64.deb"
APPIMAGE_NAME="KalderaShield-latest-linux-x64.AppImage"
SUMS_NAME="SHA256SUMS.txt"

INSTALL_DIR="${HOME}/.local/opt/kalderashield"
BIN_DIR="${HOME}/.local/bin"

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$(printf '\033[1m'); RED=$(printf '\033[31m'); GREEN=$(printf '\032m')
  DIM=$(printf '\033[2m'); OFF=$(printf '\033[0m')
else
  BOLD=''; RED=''; GREEN=''; DIM=''; OFF=''
fi

die() { printf '%serror:%s %s\n' "$RED" "$OFF" "$1" >&2; exit 1; }
note() { printf '%s%s%s\n' "$DIM" "$1" "$OFF"; }
ok() { printf '%s%s%s\n' "$GREEN" "$1" "$OFF"; }

have() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------- download ---

fetch() {
  # $1 url, $2 destination
  if have curl; then
    curl -fSL --progress-bar "$1" -o "$2"
  elif have wget; then
    wget -q --show-progress -O "$2" "$1"
  else
    die "Neither curl nor wget is available. Install one and run this again."
  fi
}

# Resolve the concrete release URL so that the download and the checksum file
# come from the same tag, even if a new release lands mid-script.
resolve_version() {
  if have curl; then
    curl -fsSLI -o /dev/null -w '%{url_effective}' "$LATEST"
  else
    wget -q --spider -S "$LATEST" 2>&1 | awk '/^ *Location:/ {print $2}' | tr -d '\r'
  fi | sed 's#.*/tag/v##'
}

printf '%sKalderaShield%s installer\n\n' "$BOLD" "$OFF"

VERSION="$(resolve_version)"
[ -n "$VERSION" ] || die "Could not determine the current release version."

ok "Current release: v${VERSION}"
note "Repository: ${REPO}"
note "Downloading ${SUMS_NAME}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT INT TERM

fetch "${ASSET_BASE}/${SUMS_NAME}" "${WORK}/${SUMS_NAME}" \
  || die "Could not download ${SUMS_NAME}."

# --------------------------------------------------------------- selection ---

printf '\n%sChoose a package:%s\n\n' "$BOLD" "$OFF"
printf '  1) AppImage   %sno root, runs from anywhere%s\n' "$DIM" "$OFF"
printf '  2) .deb       %sDebian / Ubuntu, uses dpkg%s\n' "$DIM" "$OFF"
printf '\n'

if [ -t 0 ]; then
  printf 'Selection [1]: '
  read -r CHOICE
else
  CHOICE=1
fi
case "${CHOICE:-1}" in
  2) ASSET="${DEB_NAME}" ;;
  *) ASSET="${APPIMAGE_NAME}" ;;
esac

printf '\nDownloading %s...\n' "$ASSET"
fetch "${ASSET_BASE}/${ASSET}" "${WORK}/${ASSET}" \
  || die "Could not download ${ASSET} from v${VERSION}."

# ----------------------------------------------------------------- verify ---

printf '\nVerifying the SHA-256 digest...\n'

# Look the digest up in the published sums file rather than trusting a
# checksum computed from the file we just received, which would only prove the
# download was not corrupted in transit.
EXPECTED="$(awk -v want="${ASSET}" '$2 == want || $2 == "*" want { print $1; exit }' "${WORK}/${SUMS_NAME}")"

if [ -z "${EXPECTED}" ]; then
  die "${ASSET} is not listed in ${SUMS_NAME}. Refusing to install an unverified file."
fi

ACTUAL="$(sha256sum "${WORK}/${ASSET}" | awk '{print $1}')"

if [ "${EXPECTED}" != "${ACTUAL}" ]; then
  printf '%s%s%s\n' "$RED" "Checksum mismatch. Do not install this file." "$OFF" >&2
  printf '  expected %s\n  actual   %s\n' "${EXPECTED}" "${ACTUAL}" >&2
  exit 1
fi

ok "Digest matches the published checksum."

# ----------------------------------------------------------------- install ---

printf '\n'

case "${ASSET}" in
  *AppImage)
    mkdir -p "${INSTALL_DIR}"
    cp "${WORK}/${ASSET}" "${INSTALL_DIR}/kalderashield"
    chmod +x "${INSTALL_DIR}/kalderashield"
    ok "Installed to ${INSTALL_DIR}/kalderashield"
    TARGET="${INSTALL_DIR}/kalderashield"
    ;;
  *.deb)
    if have dpkg; then
      if have sudo && [ "$(id -u)" -ne 0 ]; then
        sudo dpkg -i "${WORK}/${ASSET}" || die "dpkg failed to install the package."
        ok "Installed system-wide with dpkg."
        TARGET="kalderashield"
      elif [ "$(id -u)" -eq 0 ]; then
        dpkg -i "${WORK}/${ASSET}" || die "dpkg failed to install the package."
        ok "Installed system-wide with dpkg."
        TARGET="kalderashield"
      else
        die "Installing a .deb needs root. Re-run with sudo, or pick the AppImage."
      fi
    else
      die "dpkg is not available. Pick the AppImage instead."
    fi
    ;;
esac

printf '\n%sDone.%s\n' "$BOLD" "$OFF"
printf '  Run: %s\n' "$TARGET"
printf '  Move it onto your PATH: %s%s\n\n' "$BIN_DIR" "$OFF"
