#!/usr/bin/env bash
# ──────────────────────────────────────────────
# setup-cron.sh — Install cron job for auto-clock
# Usage:  bash scripts/setup-cron.sh
# ──────────────────────────────────────────────
set -euo pipefail

# Resolve project directory (parent of scripts/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Detect node/npx path
NPX_PATH="$(which npx 2>/dev/null || echo "")"
if [ -z "$NPX_PATH" ]; then
  # Try common nvm/fnm locations
  for p in "$HOME/.nvm/versions/node"/*/bin/npx "$HOME/.local/share/fnm/node-versions"/*/installation/bin/npx /usr/local/bin/npx /usr/bin/npx; do
    if [ -x "$p" 2>/dev/null ]; then
      NPX_PATH="$p"
      break
    fi
  done
fi

if [ -z "$NPX_PATH" ]; then
  echo "❌ npx not found. Please install Node.js first."
  exit 1
fi

NODE_BIN_DIR="$(dirname "$NPX_PATH")"
CRON_TAG="# auto-clock-chisato"
CRON_CMD="* * * * * export TZ=\"Asia/Ho_Chi_Minh\" && export PATH=\"$NODE_BIN_DIR:\$PATH\" && cd \"$PROJECT_DIR\" && npx tsx scripts/auto-clock-chisato.ts >> \"$PROJECT_DIR/logs/auto-clock.log\" 2>&1 $CRON_TAG"

# Create logs directory
mkdir -p "$PROJECT_DIR/logs"

# Check if cron job already exists
EXISTING=$(crontab -l 2>/dev/null || true)
if echo "$EXISTING" | grep -qF "auto-clock-chisato"; then
  echo "⚠️  Cron job already exists. Replacing..."
  EXISTING=$(echo "$EXISTING" | grep -vF "auto-clock-chisato")
fi

# Install cron job
(echo "$EXISTING"; echo "$CRON_CMD") | crontab -

echo "✅ Cron job installed! Runs every minute."
echo ""
echo "   Project:  $PROJECT_DIR"
echo "   Node:     $NODE_BIN_DIR"
echo "   Log:      $PROJECT_DIR/logs/auto-clock.log"
echo ""
echo "   To verify:  crontab -l"
echo "   To remove:  bash $SCRIPT_DIR/setup-cron.sh --remove"

# Handle --remove flag
if [ "${1:-}" = "--remove" ]; then
  CLEANED=$(crontab -l 2>/dev/null | grep -vF "auto-clock-chisato" || true)
  echo "$CLEANED" | crontab -
  echo "🗑️  Cron job removed."
fi
