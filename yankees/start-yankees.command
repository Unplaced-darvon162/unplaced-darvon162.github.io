#!/bin/zsh

unsetopt bg_nice 2>/dev/null

cd "$(dirname "$0")" || exit 1

PORT=5177

while lsof -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

URL="http://127.0.0.1:${PORT}/"

echo "Starting Yankees at $URL"
echo "Serving files from: $(pwd)"
echo "$URL" > .local-url

open_site() {
  sleep 2
  open "$URL" >/dev/null 2>&1
}

open_site &

if command -v ruby >/dev/null 2>&1; then
  ruby -run -e httpd . -p "$PORT" -b 127.0.0.1
elif command -v python3 >/dev/null 2>&1; then
  python3 -m http.server "$PORT" --bind 127.0.0.1
elif command -v php >/dev/null 2>&1; then
  php -S "127.0.0.1:${PORT}"
else
  echo "Could not find Ruby, Python 3, or PHP to run a local server."
  read -r "?Press Enter to close."
fi
