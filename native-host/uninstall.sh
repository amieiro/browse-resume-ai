#!/bin/sh
# Removes the Browse Resume AI native messaging host (macOS and Linux). Safe to run more than once.
# On Windows, use uninstall.ps1.
set -eu
HOST_NAME="com.browse_resume_ai.host"
case "$(uname)" in
  Darwin)
    rm -f "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/$HOST_NAME.json" \
      "$HOME/Library/Application Support/Mozilla/NativeMessagingHosts/$HOST_NAME.json"
    rm -rf "$HOME/Library/Application Support/browse-resume-ai"
    ;;
  Linux)
    CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}"
    rm -f "$CONFIG_DIR/google-chrome/NativeMessagingHosts/$HOST_NAME.json" \
      "$CONFIG_DIR/chromium/NativeMessagingHosts/$HOST_NAME.json" \
      "$HOME/.mozilla/native-messaging-hosts/$HOST_NAME.json"
    rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/browse-resume-ai"
    ;;
esac
echo "Removed $HOST_NAME"
