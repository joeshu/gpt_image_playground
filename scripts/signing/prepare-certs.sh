#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-build/cert-pool}"
OUT="$ROOT/certs"
mkdir -p "$OUT"

INDEX="$ROOT/cert-index.tsv"
STATUS="$ROOT/cert-status.tsv"
SEEN="$ROOT/.seen-fingerprints"
: > "$INDEX"
: > "$STATUS"
: > "$SEEN"

extract_leaf_cert() {
  local p12="$1" pass="$2" out="$3"
  if openssl pkcs12 -in "$p12" -clcerts -nokeys -passin "pass:$pass" -out "$out" >/dev/null 2>&1; then return 0; fi
  openssl pkcs12 -legacy -in "$p12" -clcerts -nokeys -passin "pass:$pass" -out "$out" >/dev/null 2>&1
}

check_revocation() {
  local cert="$1" log="$2"
  # Force an online OCSP revocation check through macOS Security.framework.
  # Return only three states: good, revoked, unknown. Unknown is fail-closed later.
  if security verify-cert -c "$cert" -p codeSign -R ocsp -R require >"$log" 2>&1; then
    printf 'good'
    return 0
  fi
  if grep -Eqi 'revoked|CSSMERR_TP_CERT_REVOKED|errSecCertificateRevoked' "$log"; then
    printf 'revoked'
  else
    printf 'unknown'
  fi
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
    echo "Skipping unreadable PKCS#12: $p12" >&2; rm -rf "$tmp"; continue
  fi

  fp=$(openssl x509 -in "$cert_pem" -noout -fingerprint -sha1 2>/dev/null | cut -d= -f2 | tr -d ':')
  [[ -n "$fp" ]] || { rm -rf "$tmp"; continue; }
  if grep -Fxq "$fp" "$SEEN"; then rm -rf "$tmp"; continue; fi
  printf '%s\n' "$fp" >> "$SEEN"

  name=$(basename "$dir" | tr -cs 'A-Za-z0-9._-' '-')
  dst="$OUT/${name}-${fp:0:10}"
  mkdir -p "$dst"
  cp "$p12" "$dst/cert.p12"
  cp "$prof" "$dst/profile.mobileprovision"
  cp "$cert_pem" "$dst/cert.pem"
  printf '%s' "$pass" > "$dst/password.txt"

  if ! security cms -D -i "$prof" > "$dst/profile.plist" 2>/dev/null; then
    echo "Skipping invalid provisioning profile: $prof" >&2; rm -rf "$dst" "$tmp"; continue
  fi

  exp=$(/usr/libexec/PlistBuddy -c 'Print :ExpirationDate' "$dst/profile.plist" 2>/dev/null || echo unknown)
  appid=$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' "$dst/profile.plist" 2>/dev/null || echo unknown)
  revocation=$(check_revocation "$cert_pem" "$tmp/revocation.log")
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$dst" "$name" "$exp" "$appid" "$fp" "$revocation" >> "$STATUS"

  # Fail closed: only certificates positively verified as good reach signing/publishing.
  if [[ "$revocation" == "good" ]]; then
    printf '%s\t%s\t%s\t%s\n' "$dst" "$name" "$exp" "$appid" >> "$INDEX"
  else
    echo "Skipping $name ($fp): revocation status=$revocation" >&2
  fi
  rm -rf "$tmp"
done < <(find "$ROOT/sources" -type f -name '*.p12' | sort)

rm -f "$SEEN"
good=$(wc -l < "$INDEX" | tr -d ' ')
total=$(wc -l < "$STATUS" | tr -d ' ')
echo "Prepared $good positively verified certificate(s) from $total unique certificate(s)."
