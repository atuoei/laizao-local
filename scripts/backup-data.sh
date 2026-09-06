#!/bin/sh
set -eu

backup_dir="${1:-./backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"

docker compose exec -T db pg_dump -U vibe_market -d vibe_market -Fc > "$backup_dir/postgres-$timestamp.dump"
tar -C backend -czf "$backup_dir/uploads-$timestamp.tar.gz" uploads
shasum -a 256 "$backup_dir/postgres-$timestamp.dump" "$backup_dir/uploads-$timestamp.tar.gz" > "$backup_dir/checksums-$timestamp.sha256"
echo "Backup created in $backup_dir at $timestamp"
