#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-build/cert-pool}"
OUT="$ROOT/certs"; mkdir -p "$OUT"
: > "$ROOT/cert-index.tsv"
declare -A seen
while IFS= read -r p12; do
  dir=$(dirname "$p12")
  prof=$(find "$dir" -maxdepth 2 -type f -name '*.mobileprovision' | head -1 || true)
  [[ -n "$prof" ]] || continue
  passfile=$(find "$dir" -maxdepth 1 -type f -name 'password.txt' | head -1 || true)
  pass="${P12_PASSWORD:-}"; [[ -n "$passfile" ]] && pass=$(tr -d '\r\n' < "$passfile")
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' RETURN
  if ! openssl pkcs12 -in "$p12" -clcerts -nokeys -passin "pass:$pass" -out "$tmp/cert.pem" >/dev/null 2>&1; then continue; fi
  fp=$(openssl x509 -in "$tmp/cert.pem" -noout -fingerprint -sha1 | cut -d= -f2 | tr -d ':')
  [[ -n "${seen[$fp]:-}" ]] && continue; seen[$fp]=1
  name=$(basename "$dir" | tr -cs 'A-Za-z0-9._-' '-')
  dst="$OUT/${name}-${fp:0:10}"; mkdir -p "$dst"
  cp "$p12" "$dst/cert.p12"; cp "$prof" "$dst/profile.mobileprovision"; printf '%s' "$pass" > "$dst/password.txt"
  security cms -D -i "$prof" > "$dst/profile.plist" 2>/dev/null || continue
  exp=$(/usr/libexec/PlistBuddy -c 'Print :ExpirationDate' "$dst/profile.plist" 2>/dev/null || echo unknown)
  appid=$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' "$dst/profile.plist" 2>/dev/null || echo unknown)
  printf '%s\t%s\t%s\t%s\n' "$dst" "$name" "$exp" "$appid" >> "$ROOT/cert-index.tsv"
done < <(find "$ROOT/sources" -type f -name '*.p12' | sort)
echo "Prepared $(wc -l < "$ROOT/cert-index.tsv" | tr -d ' ') unique certificate(s)."
