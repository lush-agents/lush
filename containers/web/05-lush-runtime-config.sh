#!/bin/sh
set -eu

api_url="${LUSH_API_URL:-}"
output_path="${LUSH_RUNTIME_CONFIG_PATH:-/usr/share/nginx/html/runtime-config.js}"

if [ -n "$api_url" ]; then
    case "$api_url" in
        http://*|https://*) ;;
        *)
            echo "LUSH_API_URL must be an absolute HTTP or HTTPS URL" >&2
            exit 1
            ;;
    esac

    if printf '%s' "$api_url" | grep -q '[[:space:]\\"]'; then
        echo "LUSH_API_URL must not contain whitespace, quotes, or backslashes" >&2
        exit 1
    fi
fi

encoded_api_url="$(printf '%s' "$api_url" | base64 | tr -d '\n')"
printf 'window.__LUSH_CONFIG__ = Object.freeze({"apiBaseUrl":atob("%s")});\n' \
    "$encoded_api_url" > "$output_path"
