#!/bin/sh
# Removes the Browse Resume AI native messaging host. Safe to run more than once.
set -eu
rm -f "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.browse_resume_ai.host.json"
rm -rf "$HOME/Library/Application Support/browse-resume-ai"
echo "Removed com.browse_resume_ai.host"
