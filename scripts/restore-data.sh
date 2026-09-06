#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 POSTGRES_DUMP UPLOADS_ARCHIVE" >&2
  exit 2
fi

dump_path="$1"
uploads_path="$2"
test -f "$dump_path"
test -f "$uploads_path"

echo "Restore is intentionally limited to an empty recovery database named vibe_market_restore."
docker compose exec -T db createdb -U vibe_market vibe_market_restore
docker compose exec -T db pg_restore -U vibe_market -d vibe_market_restore --clean --if-exists < "$dump_path"
mkdir -p backend/uploads-restore
tar -C backend/uploads-restore -xzf "$uploads_path"
echo "Restore completed. Validate row counts, ledger balance, file hashes, then promote manually."
