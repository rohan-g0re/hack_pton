# macOS EC2 — Aegis iMessage bridge runbook

Photon `@photon-ai/imessage-kit` requires a macOS host with Full Disk Access granted to the Node process. We run the bridge on an AWS Mac EC2 (Mac1 M1 or Mac2 M2) and only expose `/api/imessage-bridge`.

## 1. Instance

- **Type:** `mac1.metal` (Intel) or `mac2.metal` (Apple Silicon). Minimum 24 h dedicated host allocation.
- **AMI:** `macOS Sonoma 14.x` base AMI.
- **Elastic IP:** allocate and attach. DNS: `aegis-bridge.example.com`.
- **Security group inbound:** 22 (SSH, your IP), 443 (bridge HTTPS — from the Linux EC2 only).

## 2. Base packages

```bash
# Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node 24 + Caddy
brew install node@24 caddy git
brew link --overwrite node@24
node -v  # v24.x
```

## 3. Grant Full Disk Access to Node

System Settings → Privacy & Security → Full Disk Access → add `/opt/homebrew/bin/node` (Apple Silicon) or `/usr/local/bin/node` (Intel).

Without this, Photon cannot read the iMessage SQLite DB and sends will fail silently.

## 4. Sign in to iMessage

Messages app → Preferences → iMessage → sign in with the Apple ID whose chats will fan out alerts.

Confirm the target family-group chats appear in Messages (**do not** create them for the first time from the bridge — Photon reuses existing chatIds).

## 5. Clone and install

```bash
git clone <repo-url> aegis-bridge
cd aegis-bridge/aegis
npm install
cp .env.example .env
# minimal .env for this host:
#   IMESSAGE_BRIDGE_TOKEN=<random-64-char-hex>
#   IMESSAGE_CHAT_GROCERY=<chatId>
#   IMESSAGE_CHAT_MEDICAL=<chatId>
#   IMESSAGE_CHAT_EMERGENCY=<chatId>
#   IMESSAGE_CHAT_GENERAL=<chatId>
# (Linux EC2 does not need the chat IDs — it only forwards text.)
```

You can discover chatIds by running `node -e "require('./src/lib/imessage').listChats().then(console.log)"` on this host after `npm run build`.

## 6. Build + run under launchd

```bash
npm run build
# quick smoke
PORT=8443 npm run start &
curl https://localhost:8443/api/imessage-bridge -k   # => {"service":"imessage-bridge",...}
```

Production launchd plist at `/Library/LaunchDaemons/com.aegis.bridge.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.aegis.bridge</string>
  <key>WorkingDirectory</key><string>/Users/ec2-user/aegis-bridge/aegis</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/node</string>
    <string>/Users/ec2-user/aegis-bridge/aegis/node_modules/.bin/next</string>
    <string>start</string>
    <string>-p</string><string>3000</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key><string>production</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/var/log/aegis-bridge.log</string>
  <key>StandardErrorPath</key><string>/var/log/aegis-bridge.err</string>
</dict>
</plist>
```

```bash
sudo launchctl load /Library/LaunchDaemons/com.aegis.bridge.plist
```

## 7. TLS via Caddy

`/opt/homebrew/etc/Caddyfile`:

```
aegis-bridge.example.com {
  reverse_proxy localhost:3000
}
```

```bash
brew services start caddy
```

## 8. Smoke test

From the Linux EC2:

```bash
curl -X POST https://aegis-bridge.example.com/api/imessage-bridge \
  -H "Authorization: Bearer $IMESSAGE_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"chatId":"<your-test-chatId>","text":"Aegis bridge hello"}'
# => {"ok":true}
```

Confirm the message arrived in the target iMessage thread.

## 9. Operational

- Logs: `tail -f /var/log/aegis-bridge.log /var/log/aegis-bridge.err`.
- Restart: `sudo launchctl kickstart -k system/com.aegis.bridge`.
- If sends silently fail after macOS updates: re-check Full Disk Access (it often resets).
