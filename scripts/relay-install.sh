#!/bin/sh
# Installs (or reinstalls) the relay's LaunchAgent for this checkout, so it
# starts at login and restarts if it stops. Logs go to .relay.log.
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LABEL=uk.co.marabine.clubs-relay
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ ! -f "$REPO/.relay.env" ]; then
  echo "Create $REPO/.relay.env with RELAY_TOKEN=... first" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
sed -e "s#__REPO__#$REPO#g" -e "s#__PATH__#$(dirname "$(command -v node)"):/usr/bin:/bin#g" \
  "$REPO/scripts/relay.plist" > "$PLIST"
DOMAIN="gui/$(id -u)"
if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  launchctl bootout "$DOMAIN/$LABEL"
  # bootout returns before the job is gone; bootstrapping too soon fails.
  while launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; do sleep 1; done
fi
launchctl bootstrap "$DOMAIN" "$PLIST"
echo "Relay running; follow it with: tail -f $REPO/.relay.log"
