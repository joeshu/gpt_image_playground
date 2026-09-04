#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-build/cert-pool}"
OUT="$ROOT/certs"
mkdir -p "$OUT"

INDEX="$ROOT/cert-index.tsv"
SEEN="$ROOT/.seen-fingerprints"
: > "$INDEX"
: > "$SEEN"

extract_leaf_cert() {
  local p12="$1"
  local pass="$2"
  local out="$3"

  if openssl pkcs12 -in "$p12" -clcerts -nokeys -passin "pass:$pass" -out "$out" >/dev/null 2>&1; then
    return 0
  fi

  # OpenSSL 3 may reject legacy PKCS#12 ciphers used by older enterprise certs.
  openssl pkcs12 -legacy -in "$p12" -clcerts -nokeys -passin "pass:$pass" -out "$out" >/dev/null 2>&1
}

while IFS= read -r p12; do
  dir=$(dirname "$p12")
  prof=$(find "$dir" -maxdepth 2 -type f -name '*.mobileprovision' | head -1 || true)
  [[ -n "$prof" ]] || continue

  passfile=$(find "$dir" -maxdepth 1 -type f -name 'password.txt' | head -1 || true)
  pass="${P12_PASSWORD:-}"
  [[ -n "$passfile" ]] && pass=$(tr -d '\r\n' < "$passfile")

  tmp=$(mktemp -d)
  cert_pem="$tmp/cert.pem"

  if ! extract_leaf_cert "$p12" "$pass" "$cert_pem"; then
    echo "Skipping unreadable PKCS#12: $p12" >&2
    rm -rf "$tmp"
    continue
  fi

  fp=$(openssl x509 -in "$cert_pem" -noout -fingerprint -sha1 2>/dev/null | cut -d= -f2 | tr -d ':')
  if [[ -z "$fp" ]]; then
    echo "Skipping certificate without fingerprint: $p12" >&2
    rm -rf "$tmp"
    continue
  fi

  # macOS runners may use Bash 3.2, so use a flat file instead of declare -A.
  if grep -Fxq "$fp" "$SEEN"; then
    rm -rf "$tmp"
    continue
  fi
  printf '%s\n' "$fp" >> "$SEEN"

  name=$(basename "$dir" | tr -cs 'A-Za-z0-9._-' '-')
  dst="$OUT/${name}-${fp:0:10}"
  mkdir -p "$dst"

  cp "$p12" "$dst/cert.p12"
  cp "$prof" "$dst/profile.mobileprovision"
  printf '%s' "$pass" > "$dst/password.txt"

  if ! security cms -D -i "$prof" > "$dst/profile.plist" 2>/dev/null; then
    echo "Skipping invalid provisioning profile: $prof" >&2
    rm -rf "$dst" "$tmp"
    continue
  fi

  exp=$(/usr/libexec/PlistBuddy -c 'Print :ExpirationDate' "$dst/profile.plist" 2>/dev/null || echo unknown)
  appid=$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' "$dst/profile.plist" 2>/dev/null || echo unknown)

  printf '%s\t%s\t%s\t%s\n' "$dst" "$name" "$exp" "$appid" >> "$INDEX"
  rm -rf "$tmp"
done < <(find "$ROOT/sources" -type f -name '*.p12' | sort)

rm -f "$SEEN"
echo "Prepared $(wc -l < "$INDEX" | tr -d ' ') unique certificate(s)."
