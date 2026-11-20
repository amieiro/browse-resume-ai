#!/bin/sh
# Runs inside the test/linux container.
set -eu
step() { printf '\n== %s\n' "$1"; }

step "Unit tests on Linux"
NO_COLOR=1 npx vitest run 2>&1 | tail -5
test "$(NO_COLOR=1 npx vitest run 2>&1 | grep -c 'failed')" = 0

step "Install the native host"
./native-host/install.sh
for browser in google-chrome chromium; do
  manifest="$HOME/.config/$browser/NativeMessagingHosts/com.browse_resume_ai.host.json"
  test -f "$manifest" || { echo "missing $manifest"; exit 1; }
  node -e "const m=require('$manifest'); if (!m.allowed_origins.includes('chrome-extension://pdokiakaaeffjlabmofdppjakdhaimpi/')) process.exit(1)"
done
test -x "$HOME/.local/share/browse-resume-ai/launcher.sh"

step "Chromium: load dist/chrome and talk to the host"
node test/linux/e2e.mjs

step "Uninstall"
./native-host/uninstall.sh
test ! -e "$HOME/.config/chromium/NativeMessagingHosts/com.browse_resume_ai.host.json"
test ! -e "$HOME/.local/share/browse-resume-ai"

printf '\nLinux: all checks passed\n'
