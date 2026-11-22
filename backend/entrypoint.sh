#!/bin/sh
set -e

APP_USER="${APP_USER:-appuser}"
DB_PATH="${DATABASE_PATH:-/app/data/light_novel.db}"
DB_DIR="$(dirname "$DB_PATH")"
STORAGE_PATH="${STORAGE_DIR:-/app/storage}"

# Ensure SQLite data directory (for .db / -wal / -shm / -journal) and book storage exist
mkdir -p "$DB_DIR" "$STORAGE_PATH" "$STORAGE_PATH/books"

if [ "$(id -u)" -eq 0 ]; then
    APP_UID="$(id -u "$APP_USER")"
    APP_GID="$(id -g "$APP_USER")"

    # Fix mounted volume ownership & writable permissions without altering existing data
    chown -R "${APP_UID}:${APP_GID}" "$DB_DIR" "$STORAGE_PATH"
    chmod -R u+rwX "$DB_DIR" "$STORAGE_PATH"

    export HOME="/home/${APP_USER}"
    export USER="${APP_USER}"

    if command -v setpriv >/dev/null 2>&1; then
        exec setpriv --reuid="$APP_UID" --regid="$APP_GID" --init-groups -- "$@"
    elif command -v runuser >/dev/null 2>&1; then
        exec runuser -u "$APP_USER" -- "$@"
    else
        exec su -s /bin/sh "$APP_USER" -c 'exec "$@"' -- sh "$@"
    fi
fi

exec "$@"
