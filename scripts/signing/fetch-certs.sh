#!/usr/bin/env bash
set -euo pipefail
OUT="${1:-build/cert-pool}"
rm -rf "$OUT" && mkdir -p "$OUT/sources" "$OUT/certs"
idx=0
while IFS= read -r src || [[ -n "$src" ]]; do
  [[ -z "$src" || "$src" =~ ^[[:space:]]*# ]] && continue
  idx=$((idx+1)); dst="$OUT/sources/$idx"
  if [[ "$src" == *.zip* ]]; then
    mkdir -p "$dst"; curl -fL --retry 3 "$src" -o "$dst/source.zip"; unzip -q "$dst/source.zip" -d "$dst/unpacked"
  elif [[ "$src" =~ ^https://github.com/[^/]+/[^/]+/?$ ]]; then
    git clone --depth 1 --filter=blob:none "$src" "$dst/repo"
  else
    echo "Unsupported source: $src" >&2; continue
  fi
done < cert-url.txt
find "$OUT/sources" -type f \( -name '*.p12' -o -name '*.mobileprovision' -o -name 'password.txt' \) -print > "$OUT/files.txt"
echo "Fetched $(grep -c '\.p12$' "$OUT/files.txt" || true) p12 candidate(s)."
