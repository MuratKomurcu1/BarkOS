# Headless Linux Server

Use this guide when you want to run `barkos serve` on a Linux machine without a
desktop session, such as an Ubuntu VPS or a remote build box.

`barkos serve` starts the BarkOS runtime without opening the desktop window. On
Linux, the packaged AppImage still needs the libraries that Electron expects at
startup. Current BarkOS builds start Xvfb automatically for `barkos serve` when no
`DISPLAY` is set, but Xvfb must be installed first. A separate D-Bus session is
not required. When `DISPLAY` is set, BarkOS uses that display instead of starting
a competing Xvfb process.

The supported deployment matrix covers Ubuntu 20.04, 22.04, and 24.04 and
current Debian stable — anything with glibc 2.31 or newer (see
[Linux glibc compatibility](./linux-glibc-compatibility.md)). Package names can
differ on other Debian-derived releases.

## Ubuntu and Debian prerequisites

Install the AppImage runtime dependency and Xvfb:

```bash
sudo apt-get update
sudo apt-get install -y curl file jq xvfb zlib1g-dev
```

On Ubuntu 22.04, install `libfuse2` to execute the AppImage through FUSE. On
Ubuntu 24.04 and Debian, the equivalent package may be `libfuse2t64`. FUSE is
optional: without it, use the AppImage's supported extraction path:

```bash
cd /opt/barkos
./barkos-linux.AppImage --appimage-extract
/opt/barkos/squashfs-root/AppRun serve --port 6768
```

Docker commonly has no FUSE device. Use `--appimage-extract` once or
`--appimage-extract-and-run`; neither requires a privileged container. The
extract-and-run wrapper can print extracted paths before BarkOS starts, so
automation that requires stdout to contain only the ready JSON should extract
once and invoke `squashfs-root/AppRun`.

Download and make the AppImage executable:

```bash
sudo mkdir -p /opt/barkos
sudo curl -L https://github.com/MuratKomurcu1/BarkOS/releases/latest/download/barkos-linux.AppImage \
  -o /opt/barkos/barkos-linux.AppImage
sudo chmod +x /opt/barkos/barkos-linux.AppImage
```

If `Xvfb` was installed somewhere other than `/usr/bin`, confirm systemd can
find it later:

```bash
command -v Xvfb
```

## Run In The Foreground

Start with a foreground run before creating a service:

```bash
LIBGL_ALWAYS_SOFTWARE=1 /opt/barkos/barkos-linux.AppImage serve --port 6768
```

For remote clients, pass the address they should use to reach this server. A
Tailscale address is usually the safest option for private servers:

```bash
LIBGL_ALWAYS_SOFTWARE=1 /opt/barkos/barkos-linux.AppImage serve \
  --port 6768 \
  --pairing-address 100.64.1.20
```

`--pairing-address` is only the address advertised to clients. It does not
change the listener bind address. BarkOS binds its WebSocket listener, then
combines the actual bound port with the advertised host when the address omits
a port. Use a reachable LAN/Tailscale hostname or IP, or a complete reverse
proxy URL such as `https://barkos.example.com/runtime` (`http(s)` is normalized
to `ws(s)`). Wildcard addresses such as `*`, `0.0.0.0`, and `::` cannot be
advertised.

The command writes one ready block to stdout after the listener bind and
pairing initialization complete:

```text
BarkOS server ready
Bound endpoint: ws://0.0.0.0:6768
Advertised endpoint: ws://100.64.1.20:6768
Pairing URL: barkos://pair?code=...
```

For supervisors, request the versioned single-line JSON contract:

```bash
/opt/barkos/barkos-linux.AppImage serve --port 6768 \
  --pairing-address 100.64.1.20 --json
```

The actual output is one compact line; this example is pretty-printed for
readability:

```json
{
  "type": "barkos_server_ready",
  "schemaVersion": 1,
  "runtimeId": "...",
  "endpoint": "ws://0.0.0.0:6768",
  "boundEndpoint": "ws://0.0.0.0:6768",
  "advertisedEndpoint": "ws://100.64.1.20:6768",
  "managedWslCliReconciliation": "settled",
  "pairing": {
    "available": true,
    "url": "barkos://pair?code=...",
    "endpoint": "ws://100.64.1.20:6768",
    "deviceId": "...",
    "webClientUrl": "...",
    "scope": "runtime",
    "qr": null
  }
}
```

`endpoint` remains a compatibility alias for `boundEndpoint`; new automation
should use the explicit bound and advertised fields.

When the server remains usable but cannot mint an offer, `pairing` remains an
object with `available:false`, a stable `reason`, and operator `guidance`; it is
never silently omitted. `--recipe-json` is stricter and exits with that reason
because its contract requires a pairing URL. Stop a foreground server with
`Ctrl+C`. Stable reasons are `disabled_by_operator`, `websocket_unavailable`,
`device_registry_unavailable`, `e2ee_key_unavailable`, and
`invalid_advertised_endpoint`.

## Systemd Service

Create a dedicated service user and install directory. Run the service as this
user instead of root so the AppImage can keep Chromium's sandbox enabled. Keep
the install directory root-owned: the service needs to read and execute the
AppImage, but must not be able to replace it or the rollback artifacts.

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin barkos
sudo chown root:root /opt/barkos /opt/barkos/barkos-linux.AppImage
sudo chmod 755 /opt/barkos /opt/barkos/barkos-linux.AppImage
```

For most hosts, one `barkos serve` service is enough because BarkOS starts Xvfb on
display `:99` when no display exists:

```ini
# /etc/systemd/system/barkos-serve.service
[Unit]
Description=BarkOS runtime server
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
User=barkos
WorkingDirectory=/home/barkos
Environment=LIBGL_ALWAYS_SOFTWARE=1
ExecStart=/opt/barkos/barkos-linux.AppImage serve --port 6768 --pairing-address 100.64.1.20
StandardOutput=journal
StandardError=journal
KillMode=mixed
Restart=on-failure
RestartPreventExitStatus=3
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Replace `100.64.1.20` with the LAN, Tailscale, tunnel, or public hostname that
clients should use.

`KillMode=mixed` sends the graceful stop signal only to BarkOS's main process,
then retains systemd's cgroup-wide `SIGKILL` fallback if shutdown times out.
This lets BarkOS keep its owned Xvfb alive until Electron disconnects cleanly.

Exit status `3` means another process already owns this userData profile, so
`RestartPreventExitStatus=3` stops the unit instead of retrying a launch that
cannot succeed. Any other permanent startup fault is capped at 5 starts per
5 minutes; systemd's defaults (10s window, 5 starts) can never trip at
`RestartSec=5`, which is how one bad launch could restart thousands of times.
The start limit counts operator-initiated starts too, so once it trips systemd
refuses a plain `systemctl start` until the 5-minute window rolls over. Run
`sudo systemctl reset-failed barkos-serve.service` first to clear it — the
[Upgrade](#upgrade-steps) and [Roll back](#roll-back) scripts already do.
On systemd older than 230 those two directives are spelled
`StartLimitInterval=`/`StartLimitBurst=` and belong in `[Service]`; Ubuntu
20.04, BarkOS's oldest supported base, ships systemd 245.

Enable the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now barkos-serve.service
sudo journalctl -u barkos-serve.service -f
```

`journalctl -o cat` removes journal metadata but still mixes the service's
stdout and stderr. Parse each line as JSON and require the readiness type and
schema before treating the service as ready:

```bash
sudo journalctl -u barkos-serve.service -o cat \
  | jq -Rrc 'fromjson? | select(.type == "barkos_server_ready" and .schemaVersion == 1)'
```

A bounded health check should require that contract within its startup timeout;
otherwise inspect earlier diagnostics for the precise pairing reason, listener
error, or missing library.

## Managed Xvfb Service

If you prefer to own the virtual display lifecycle in systemd, run Xvfb as a
separate service and set `DISPLAY=:99` for BarkOS.

```ini
# /etc/systemd/system/barkos-xvfb.service
[Unit]
Description=Virtual X display for BarkOS
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

If `command -v Xvfb` returned a different path, update `ExecStart` to that
absolute path.

Then add the display dependency to the BarkOS service:

```ini
# /etc/systemd/system/barkos-serve.service
[Unit]
Description=BarkOS runtime server
After=network-online.target barkos-xvfb.service
Wants=network-online.target barkos-xvfb.service
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
User=barkos
WorkingDirectory=/home/barkos
Environment=DISPLAY=:99
Environment=LIBGL_ALWAYS_SOFTWARE=1
ExecStart=/opt/barkos/barkos-linux.AppImage serve --port 6768 --pairing-address 100.64.1.20
Restart=on-failure
RestartPreventExitStatus=3
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable both units:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now barkos-xvfb.service barkos-serve.service
```

## CLI Install Note

On a headless host, you do not need to open the desktop UI just to run the
server. Invoke the AppImage directly:

```bash
/opt/barkos/barkos-linux.AppImage serve --help
```

Running an AppImage as root requires Chromium's `--no-sandbox` switch before
the command:

```bash
/opt/barkos/barkos-linux.AppImage --no-sandbox serve --port 6768
```

This disables a security boundary. Prefer a dedicated unprivileged service
user, especially when the listener is reachable beyond localhost.

## Pairing troubleshooting

- A pairing offer is a capability containing a device credential and E2EE
  material. Share it only with the intended client and do not put it in proxy
  access logs.
- `boundEndpoint` is where the process listens; `advertisedEndpoint` is what a
  client dials. A valid-looking offer still cannot connect if DNS, firewall,
  Docker port publishing, Tailscale policy, or a reverse proxy does not route
  the advertised endpoint to the bound port.
- An omitted advertised port uses the actual bound port, including a fallback
  port selected after a collision. An explicit proxy port is preserved. A port
  mismatch therefore means the supplied external routing is wrong, not that
  BarkOS changes it.
- Reverse proxies must support WebSocket upgrade and route the advertised path.
  Use `wss://` or `https://` when TLS terminates at the proxy; do not advertise
  `ws://` through an HTTPS-only endpoint.
- Hostnames, IPv4, bracketed IPv6, and raw IPv6 literals are supported. IPv6
  still requires an IPv6-reachable listener/network path.
- `xvfb-run` and `dbus-run-session -- xvfb-run` remain valid diagnostic launch
  shapes, but neither should be needed when `Xvfb` is installed and no display
  is configured. Repeated D-Bus messages without a ready block indicate startup
  did not reach serve mode; confirm the AppImage version and exact argument
  order, especially `--no-sandbox serve`.

If you later install the desktop CLI from BarkOS settings, use that CLI for normal
shell workflows. Keep the AppImage path in systemd so service restarts do not
depend on an interactive shell profile.

## Upgrade

`barkos serve` never updates itself. In headless mode BarkOS wires up no auto-updater
at all — the built-in updater only runs in the desktop GUI, and no paired mobile
or web client can trigger it remotely. Upgrading is always a deliberate step:
replace the AppImage and restart the service.

Two facts make this safe and predictable:

- **State lives in the service user's home, not next to the binary.** Persisted
  data is under `/home/barkos/.config/` (BarkOS uses both an `barkos` and an `BarkOS`
  directory there), fully independent of `/opt/barkos/barkos-linux.AppImage`.
  Replacing the binary never touches projects, worktree metadata, terminal
  history, orchestration state, or paired-device keys — so mobile and web
  clients reconnect after an upgrade without re-pairing.
- **New builds migrate old state on load.** BarkOS loads older `barkos-data.json`
  state into the current schema and writes it back in the current shape, so a
  forward upgrade needs no manual data step.

Rolling back is the case that needs care — see [Roll back](#roll-back).

### Record the version you deploy

BarkOS has no headless version command: there is no `--version` flag or `version`
subcommand, and `barkos serve` prints only its endpoint. Choose a release tag
explicitly instead of following the `latest` URL, and record it next to the
binary so upgrades are auditable. The steps below keep that record in
`/opt/barkos/VERSION`.

### Upgrade steps

Never download straight onto `/opt/barkos/barkos-linux.AppImage`. The AppImage is
FUSE-mounted, so overwriting it in place while the service runs can crash or
corrupt the live process — and even with the service stopped, a failed or partial
download would clobber the working binary. Instead download to a temporary name
on the same filesystem, verify it, then swap it in with an atomic rename.

Check capacity before starting:

```bash
sudo chown root:root /opt/barkos
sudo chmod 755 /opt/barkos
sudo test ! -L /opt/barkos/barkos-linux.AppImage
sudo chown root:root /opt/barkos/barkos-linux.AppImage
sudo chmod 755 /opt/barkos/barkos-linux.AppImage
# Clear predictable staging names left by an older attempt after locking the directory
sudo rm -f /opt/barkos/barkos-linux.AppImage.new /opt/barkos/VERSION.new \
  /opt/barkos/barkos-linux.AppImage.recovering /opt/barkos/VERSION.recovering
sudo du -sh /home/barkos/.config
df -h /opt/barkos /home/barkos
```

`/opt/barkos` needs room for the compressed BarkOS profile archive, the staged
build, and the rollback binary. A rollback extracts the old profile and preserves
the post-upgrade BarkOS profile directories, so `/home` needs room for both copies.

Run the following block as one Bash script so its fail-fast and recovery traps
remain active for the whole operation:

```bash
set -euo pipefail

# Replace this example with the release tag you intend to deploy
BARKOS_VERSION=v1.4.147

# Select the release asset on the server where BarkOS runs
case "$(uname -m)" in
  x86_64)
    BARKOS_ASSET=barkos-linux.AppImage
    BARKOS_FILE_MACHINE=x86-64
    ;;
  aarch64 | arm64)
    BARKOS_ASSET=barkos-linux-arm64.AppImage
    BARKOS_FILE_MACHINE='ARM aarch64'
    ;;
  *)
    echo "Unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

BARKOS_ROLLBACK_NEW=
BARKOS_ROLLBACK=
BARKOS_SERVICE_STOPPED=0
BARKOS_BINARY_PROMOTED=0
recover_failed_upgrade() {
  exit_status=$?
  trap - EXIT
  set +e
  if ((exit_status != 0)); then
    sudo rm -f /opt/barkos/barkos-linux.AppImage.new /opt/barkos/VERSION.new \
      /opt/barkos/barkos-linux.AppImage.recovering /opt/barkos/VERSION.recovering
  fi
  if ((exit_status != 0)) && [[ -n "$BARKOS_ROLLBACK_NEW" ]] && \
    sudo test -d "$BARKOS_ROLLBACK_NEW"; then
    sudo rm -rf -- "$BARKOS_ROLLBACK_NEW"
  fi
  if ((exit_status != 0 && BARKOS_SERVICE_STOPPED)); then
    recovery_ok=1
    if ((BARKOS_BINARY_PROMOTED)); then
      if ! sudo cp -a "$BARKOS_ROLLBACK/barkos-linux.AppImage" \
        /opt/barkos/barkos-linux.AppImage.recovering || \
        ! sudo mv -f /opt/barkos/barkos-linux.AppImage.recovering \
          /opt/barkos/barkos-linux.AppImage; then
        recovery_ok=0
      fi
      if sudo test -f "$BARKOS_ROLLBACK/VERSION"; then
        if ! sudo cp -a "$BARKOS_ROLLBACK/VERSION" /opt/barkos/VERSION.recovering || \
          ! sudo mv -f /opt/barkos/VERSION.recovering /opt/barkos/VERSION; then
          recovery_ok=0
        fi
      elif ! sudo rm -f /opt/barkos/VERSION; then
        recovery_ok=0
      fi
    fi
    sudo rm -f /opt/barkos/barkos-linux.AppImage.recovering \
      /opt/barkos/VERSION.recovering
    if ((recovery_ok)); then
      # A tripped StartLimitBurst refuses a plain start
      sudo systemctl reset-failed barkos-serve.service || true
      sudo systemctl start barkos-serve.service || true
    else
      echo 'Upgrade recovery failed; service remains stopped' >&2
    fi
  fi
  exit "$exit_status"
}
trap recover_failed_upgrade EXIT

# 1. Stage and verify the new build while the server stays online
sudo curl -fL --retry 3 "https://github.com/MuratKomurcu1/BarkOS/releases/download/${BARKOS_VERSION}/${BARKOS_ASSET}" \
  -o /opt/barkos/barkos-linux.AppImage.new
sudo chown root:root /opt/barkos/barkos-linux.AppImage.new
sudo chmod 755 /opt/barkos/barkos-linux.AppImage.new

# Both checks must match; either grep stops this fail-fast block otherwise
BARKOS_FILE_INFO=$(LC_ALL=C file /opt/barkos/barkos-linux.AppImage.new)
grep 'ELF .* executable' <<<"$BARKOS_FILE_INFO"
grep -F "$BARKOS_FILE_MACHINE" <<<"$BARKOS_FILE_INFO"

# 2. Assemble the prior binary and version in a root-only rollback bundle
BARKOS_ROLLBACK_BASE=/opt/barkos/barkos-rollback-$(date +%F-%H%M%S-%N)
BARKOS_ROLLBACK_NEW=${BARKOS_ROLLBACK_BASE}.new
BARKOS_ROLLBACK=${BARKOS_ROLLBACK_BASE}.ready
sudo install -d -m 700 "$BARKOS_ROLLBACK_NEW"
sudo cp -a /opt/barkos/barkos-linux.AppImage "$BARKOS_ROLLBACK_NEW/barkos-linux.AppImage"
if sudo test -f /opt/barkos/VERSION; then
  sudo cp -a /opt/barkos/VERSION "$BARKOS_ROLLBACK_NEW/VERSION"
fi

# Stage the new version record before the stop window
printf '%s\n' "$BARKOS_VERSION" | sudo tee /opt/barkos/VERSION.new >/dev/null
sudo chown root:root /opt/barkos/VERSION.new
sudo chmod 644 /opt/barkos/VERSION.new

# 3. Stop the server so the profile backup is consistent
BARKOS_SERVICE_STOPPED=1
sudo systemctl stop barkos-serve.service

# Add only BarkOS-owned profile directories, then publish the complete bundle
BARKOS_PROFILE_DIRS=()
for profile_dir in barkos BarkOS; do
  if sudo test -L "/home/barkos/.config/$profile_dir"; then
    echo "Refusing symlinked BarkOS profile: /home/barkos/.config/$profile_dir" >&2
    exit 1
  fi
  if sudo test -d "/home/barkos/.config/$profile_dir"; then
    if [[ "$profile_dir" == BarkOS ]] && \
      sudo test /home/barkos/.config/barkos -ef /home/barkos/.config/BarkOS; then
      continue
    fi
    BARKOS_PROFILE_DIRS+=("$profile_dir")
  fi
done
if ((${#BARKOS_PROFILE_DIRS[@]} == 0)); then
  echo 'No BarkOS profile directory found under /home/barkos/.config' >&2
  exit 1
fi
sudo tar czf "$BARKOS_ROLLBACK_NEW/profile.tgz" \
  -C /home/barkos/.config "${BARKOS_PROFILE_DIRS[@]}"
sudo chmod 600 "$BARKOS_ROLLBACK_NEW/profile.tgz"
sudo mv "$BARKOS_ROLLBACK_NEW" "$BARKOS_ROLLBACK"

# 4. Atomically replace the binary and version record, then start
BARKOS_BINARY_PROMOTED=1
sudo mv -f /opt/barkos/barkos-linux.AppImage.new /opt/barkos/barkos-linux.AppImage
sudo mv -f /opt/barkos/VERSION.new /opt/barkos/VERSION
# Clears a start-limit hit left by the version being replaced
sudo systemctl reset-failed barkos-serve.service
sudo systemctl start barkos-serve.service
BARKOS_SERVICE_STOPPED=0
trap - EXIT
```

The profile archive created in step 3 captures both BarkOS profile directory names
when present without rewinding unrelated tools under `/home/barkos/.config`. The
`.ready` suffix is published only after the prior binary, version record, and
profile archive are complete. If you run the managed Xvfb unit, only
`barkos-serve.service` needs restarting — leave `barkos-xvfb.service` running.

### Verify

```bash
sudo journalctl -u barkos-serve.service -f
```

A healthy start prints one `BarkOS server ready` block with the actual bound and
advertised endpoints. Verify those values rather than assuming the configured
port, because a collision can select a fallback port.
Confirm a client reconnects before you discard the backup. The timestamped
rollback bundles are not pruned automatically. After the new version satisfies
your retention policy, select and inspect the newest complete bundle before
removing it:

```bash
shopt -s nullglob
BARKOS_ROLLBACK_SETS=(/opt/barkos/barkos-rollback-*.ready)
((${#BARKOS_ROLLBACK_SETS[@]} > 0))
BARKOS_ROLLBACK=${BARKOS_ROLLBACK_SETS[${#BARKOS_ROLLBACK_SETS[@]} - 1]}
printf 'Removing rollback bundle: %s\n' "$BARKOS_ROLLBACK"
sudo test -d "$BARKOS_ROLLBACK"
sudo rm -rf -- "$BARKOS_ROLLBACK"
```

Each `.ready` directory is a self-contained rollback generation; never combine
files from different bundles.

### Roll back

A rollback is **not** binary-only safe. Once a newer build has started, it can
rewrite `barkos-data.json` in the current schema. If an older build then writes
that file, it can discard fields it does not recognize. The rolling
`barkos-data.json.bak.*` files are corruption-recovery snapshots, not a dedicated
pre-upgrade copy, and normal writes can rotate them away. To roll back cleanly,
restore the backup from step 3 **and** swap the binary back. Run this block as one
Bash script:

```bash
set -euo pipefail

# Select and validate one complete generation before taking the service offline
shopt -s nullglob
BARKOS_ROLLBACK_SETS=(/opt/barkos/barkos-rollback-*.ready)
((${#BARKOS_ROLLBACK_SETS[@]} > 0))
BARKOS_ROLLBACK=${BARKOS_ROLLBACK_SETS[${#BARKOS_ROLLBACK_SETS[@]} - 1]}
sudo test -f "$BARKOS_ROLLBACK/barkos-linux.AppImage"
sudo tar tzf "$BARKOS_ROLLBACK/profile.tgz" >/dev/null

# Extract and validate the old profile while the current server stays online
sudo test ! -L /home
BARKOS_HOME_OWNER=$(sudo stat -c %u /home)
BARKOS_HOME_MODE=$(sudo stat -c %a /home)
if [[ "$BARKOS_HOME_OWNER" != 0 ]] || ((8#$BARKOS_HOME_MODE & 0022)) || \
  sudo -u barkos test -w /home; then
  echo 'Refusing rollback because /home is not root-controlled' >&2
  exit 1
fi
BARKOS_RESTORE=$(sudo mktemp -d /home/.barkos-restore.XXXXXX)
BARKOS_SERVICE_STOPPED=0
BARKOS_MOVED_CURRENT_DIRS=()
BARKOS_INSTALLED_RESTORE_DIRS=()
BARKOS_CURRENT_BINARY_MOVED=0
BARKOS_CURRENT_VERSION_MOVED=0
BARKOS_VERSION_REPLACEMENT_STARTED=0
BARKOS_POST_UPGRADE=
BARKOS_ROLLBACK_BINARY_STAGED=
BARKOS_ROLLBACK_VERSION_STAGED=
BARKOS_ROLLBACK_HAS_VERSION=0
restart_after_rollback_error() {
  exit_status=$?
  trap - EXIT
  set +e
  if ((exit_status != 0 && BARKOS_SERVICE_STOPPED)); then
    recovery_ok=1
    if ((${#BARKOS_INSTALLED_RESTORE_DIRS[@]})); then
      for profile_dir in "${BARKOS_INSTALLED_RESTORE_DIRS[@]}"; do
        if sudo test -d "/home/barkos/.config/$profile_dir"; then
          if ! sudo mv "/home/barkos/.config/$profile_dir" \
            "$BARKOS_RESTORE/$profile_dir.failed"; then
            recovery_ok=0
          fi
        fi
      done
    fi
    if ((${#BARKOS_MOVED_CURRENT_DIRS[@]})); then
      for profile_dir in "${BARKOS_MOVED_CURRENT_DIRS[@]}"; do
        if sudo test -d "$BARKOS_POST_UPGRADE/$profile_dir"; then
          if ! sudo mv "$BARKOS_POST_UPGRADE/$profile_dir" /home/barkos/.config/; then
            recovery_ok=0
          fi
        elif ! sudo test -d "/home/barkos/.config/$profile_dir"; then
          recovery_ok=0
        fi
      done
    fi
    if [[ -n "$BARKOS_POST_UPGRADE" ]]; then
      sudo rmdir "$BARKOS_POST_UPGRADE" 2>/dev/null || true
    fi
    if ((BARKOS_CURRENT_BINARY_MOVED)); then
      if sudo test -f "$BARKOS_CURRENT_BINARY"; then
        if ! sudo mv -f "$BARKOS_CURRENT_BINARY" /opt/barkos/barkos-linux.AppImage; then
          recovery_ok=0
        fi
      elif ! sudo test -f /opt/barkos/barkos-linux.AppImage; then
        recovery_ok=0
      fi
    fi
    if ((BARKOS_CURRENT_VERSION_MOVED)); then
      if sudo test -f "$BARKOS_CURRENT_VERSION"; then
        if ! sudo mv -f "$BARKOS_CURRENT_VERSION" /opt/barkos/VERSION; then
          recovery_ok=0
        fi
      elif ! sudo test -f /opt/barkos/VERSION; then
        recovery_ok=0
      fi
    elif ((BARKOS_VERSION_REPLACEMENT_STARTED)); then
      if ! sudo rm -f /opt/barkos/VERSION; then
        recovery_ok=0
      fi
    fi
    if ((recovery_ok)); then
      # A tripped StartLimitBurst refuses a plain start
      sudo systemctl reset-failed barkos-serve.service || true
      sudo systemctl start barkos-serve.service || true
    else
      echo 'Rollback recovery failed; service remains stopped' >&2
    fi
  fi
  if [[ -n "$BARKOS_ROLLBACK_BINARY_STAGED" ]]; then
    sudo rm -f -- "$BARKOS_ROLLBACK_BINARY_STAGED"
  fi
  if [[ -n "$BARKOS_ROLLBACK_VERSION_STAGED" ]]; then
    sudo rm -f -- "$BARKOS_ROLLBACK_VERSION_STAGED"
  fi
  sudo rm -rf -- "$BARKOS_RESTORE"
  exit "$exit_status"
}
trap restart_after_rollback_error EXIT

if [[ "$(sudo stat -c %d "$BARKOS_RESTORE")" != \
  "$(sudo stat -c %d /home/barkos/.config)" ]]; then
  echo 'Refusing rollback because staging and the BarkOS profile are on different filesystems' >&2
  exit 1
fi
sudo tar xzf "$BARKOS_ROLLBACK/profile.tgz" -C "$BARKOS_RESTORE"
BARKOS_RESTORE_DIRS=()
for profile_dir in barkos BarkOS; do
  if sudo test -L "$BARKOS_RESTORE/$profile_dir"; then
    echo "Rollback bundle contains a symlinked profile: $profile_dir" >&2
    exit 1
  fi
  if sudo test -d "$BARKOS_RESTORE/$profile_dir"; then
    if [[ "$profile_dir" == BarkOS ]] && \
      sudo test "$BARKOS_RESTORE/barkos" -ef "$BARKOS_RESTORE/BarkOS"; then
      continue
    fi
    BARKOS_RESTORE_DIRS+=("$profile_dir")
  fi
done
if ((${#BARKOS_RESTORE_DIRS[@]} == 0)); then
  echo "Rollback bundle has no BarkOS profile directories: $BARKOS_ROLLBACK" >&2
  exit 1
fi
for profile_dir in "${BARKOS_RESTORE_DIRS[@]}"; do
  sudo chown -R barkos:barkos "$BARKOS_RESTORE/$profile_dir"
done

BARKOS_ROLLBACK_STAMP=$(date +%F-%H%M%S-%N)
BARKOS_ROLLBACK_BINARY_STAGED=/opt/barkos/barkos-linux.AppImage.rollback-staged-$BARKOS_ROLLBACK_STAMP
sudo cp -a "$BARKOS_ROLLBACK/barkos-linux.AppImage" "$BARKOS_ROLLBACK_BINARY_STAGED"
if sudo test -f "$BARKOS_ROLLBACK/VERSION"; then
  BARKOS_ROLLBACK_HAS_VERSION=1
  BARKOS_ROLLBACK_VERSION_STAGED=/opt/barkos/VERSION.rollback-staged-$BARKOS_ROLLBACK_STAMP
  sudo cp -a "$BARKOS_ROLLBACK/VERSION" "$BARKOS_ROLLBACK_VERSION_STAGED"
fi

BARKOS_SERVICE_STOPPED=1
sudo systemctl stop barkos-serve.service

# Preserve and replace only BarkOS-owned profile directories
BARKOS_CURRENT_DIRS=()
for profile_dir in barkos BarkOS; do
  if sudo test -L "/home/barkos/.config/$profile_dir"; then
    echo "Refusing symlinked BarkOS profile: /home/barkos/.config/$profile_dir" >&2
    exit 1
  fi
  if sudo test -d "/home/barkos/.config/$profile_dir"; then
    if [[ "$profile_dir" == BarkOS ]] && \
      sudo test /home/barkos/.config/barkos -ef /home/barkos/.config/BarkOS; then
      continue
    fi
    BARKOS_CURRENT_DIRS+=("$profile_dir")
  fi
done
BARKOS_POST_UPGRADE=/home/barkos/.config/barkos-rollback-$BARKOS_ROLLBACK_STAMP
sudo install -d -o barkos -g barkos -m 700 "$BARKOS_POST_UPGRADE"
if ((${#BARKOS_CURRENT_DIRS[@]})); then
  for profile_dir in "${BARKOS_CURRENT_DIRS[@]}"; do
    BARKOS_MOVED_CURRENT_DIRS+=("$profile_dir")
    sudo mv "/home/barkos/.config/$profile_dir" "$BARKOS_POST_UPGRADE/"
  done
fi
for profile_dir in "${BARKOS_RESTORE_DIRS[@]}"; do
  BARKOS_INSTALLED_RESTORE_DIRS+=("$profile_dir")
  sudo mv "$BARKOS_RESTORE/$profile_dir" /home/barkos/.config/
done

BARKOS_CURRENT_BINARY=/opt/barkos/barkos-linux.AppImage.rollback-current-$BARKOS_ROLLBACK_STAMP
BARKOS_CURRENT_BINARY_MOVED=1
sudo mv /opt/barkos/barkos-linux.AppImage "$BARKOS_CURRENT_BINARY"
sudo mv -f "$BARKOS_ROLLBACK_BINARY_STAGED" /opt/barkos/barkos-linux.AppImage

BARKOS_CURRENT_VERSION=/opt/barkos/VERSION.rollback-current-$BARKOS_ROLLBACK_STAMP
if sudo test -f /opt/barkos/VERSION; then
  BARKOS_CURRENT_VERSION_MOVED=1
  sudo mv /opt/barkos/VERSION "$BARKOS_CURRENT_VERSION"
fi
BARKOS_VERSION_REPLACEMENT_STARTED=1
if ((BARKOS_ROLLBACK_HAS_VERSION)); then
  sudo mv -f "$BARKOS_ROLLBACK_VERSION_STAGED" /opt/barkos/VERSION
else
  sudo rm -f /opt/barkos/VERSION
fi
# The crash-looping build you are rolling back from tripped StartLimitBurst
sudo systemctl reset-failed barkos-serve.service
sudo systemctl start barkos-serve.service
BARKOS_SERVICE_STOPPED=0
sudo rm -rf -- "$BARKOS_RESTORE"
trap - EXIT
```

Restoring the backup is required, not optional: swapping only the binary leaves
the newer `barkos-data.json` in place, where an older build can discard state it
does not understand. Keep the pre-upgrade backup until the new version is proven
on your host. The `barkos-rollback-*` directory inside `.config` is also retained
deliberately. The post-upgrade binary and version record are retained in
`/opt/barkos` with the same `rollback-current-<timestamp>` suffix. Inspect these
artifacts and remove them according to your retention policy after the rollback
is resolved.

## Installing Agent Skills Without A Desktop

BarkOS's agent skills (CLI usage, orchestration, computer use, etc.) are normally
installed from BarkOS Settings, which pre-fills an `npx skills add ... --global`
command in a terminal for you to run. A headless host has no Settings UI, so
use `barkos skills install` instead:

```bash
barkos skills install                                      # list installable skills
barkos skills install --skill barkos-cli --skill orchestration # install globally (default)
barkos skills install --skill barkos-cli --local              # install into the current project only
barkos skills install --all                                 # install every bundled skill
barkos skills install --all --dry-run                       # print the npx command without running it
```

This resolves the same `npx skills add <repo> --skill <name> ...` command
Settings would show you (adding `--global` unless `--local` is passed), then
runs it and forwards its output and exit code. It requires `node`/`npx` on the
host; it does not need a running BarkOS runtime.

Unlike the command Settings shows, the spawned one adds `npx --yes` and `-y`.
Without them the `skills` CLI opens an interactive agent picker and blocks
forever on any allocated TTY — which includes a normal `ssh` session. Use
`--dry-run` to see the exact command that will run.

Settings keeps that picker deliberately, because choosing which agents get a
skill is a real decision. A headless run cannot answer it, so instead of dropping
the choice BarkOS makes it explicitly: it passes an `--agent` list built from the
coding agents it detects on the host, plus the shared `.agents/skills` directory
it reads itself. Left to decide on its own with no agent detected, the `skills`
CLI installs into all ~75 agents it knows and leaves a config directory for each.
Override the targets yourself, or narrow to the shared directory alone:

```bash
barkos skills install --skill barkos-cli --agent claude-code,codex
barkos skills install --skill barkos-cli --agent universal
```

If BarkOS detects no agent at all, `barkos skills install` stops and asks for
`--agent` rather than guessing.

To refresh already-installed skills, `barkos skills update` mirrors the same
selection flags (`--skill`, `--all`, `--local`, `--dry-run`) and resolves to
`npx skills update <names...>` with a matching scope flag — `--global`, or
`--project` when you pass `--local`:

```bash
barkos skills update --all                                  # update every bundled skill globally
barkos skills update --skill barkos-cli --dry-run             # print the npx command without running it
```

`barkos skills update` only refreshes skills that are already installed — it exits
0 without doing anything for a skill that is missing, so install it first. More
generally, a 0 exit means the `skills` CLI ran without erroring, not that it
wrote anything; read its output to confirm what changed.

`--json` covers the skill listing and `--dry-run`. A real run streams the
`skills` CLI's own non-JSON output and rejects `--json`.

Both commands install onto the machine that runs them. In an BarkOS SSH workspace
or the WSL bridge the `barkos` shim forwards commands to the BarkOS host, so they
refuse to run there and print the command to run on the machine you want.

## Troubleshooting

- `dlopen(): error loading libfuse.so.2`: install `libfuse2`.
- `Missing X server or $DISPLAY`: install `xvfb`, or start the managed Xvfb
  service and set `DISPLAY=:99`.
- `Xvfb not found`: confirm `command -v Xvfb` and use that absolute path in the
  systemd unit.
- GPU or DRI warnings on a VPS: keep `LIBGL_ALWAYS_SOFTWARE=1` in the service
  environment.
- Chromium sandbox errors: confirm the service is running as the non-root
  `barkos` user and that `/opt/barkos` is readable by that user.
- Clients cannot connect: make sure `--pairing-address` is an address reachable
  from the client, and make sure firewalls allow the selected `--port`.
- Journal shows `Another BarkOS instance is already running for this userData
  profile` and the unit exits `3`: another process already owns the profile, so
  `RestartPreventExitStatus=3` leaves the unit `failed` on purpose. Find the
  owner with `systemctl status barkos-serve` and `pgrep -af barkos`. Stop it (or
  keep it and leave the unit down), then run
  `sudo systemctl reset-failed barkos-serve && sudo systemctl start barkos-serve` —
  `reset-failed` clears the failed state and any start-limit counter. If no owner
  exists, the lock is stale (Chromium recorded a pid that
  has since been reused): remove `SingletonLock` and `SingletonSocket` from the
  userData directory and start again. If an earlier crash-loop already leaked
  AppImage mounts, list them with `findmnt -rn -t fuse.barkos-linux.AppImage` and
  release only the ones with no live owner using `fusermount -uz <target>` (or
  `umount -l <target>`), leaving the running instance's mount alone.
- Service crash-loops right after an upgrade: use [Roll back](#roll-back) with
  the pre-upgrade `.ready` bundle. Do not rerun the upgrade first; doing so would
  make the crashing version the next rollback binary. The loop trips
  `StartLimitBurst`, so any manual `systemctl start` outside that script needs
  `sudo systemctl reset-failed barkos-serve.service` first.
- Diagnosing other missing libraries: extract the AppImage without launching it
  with `./barkos-linux.AppImage --appimage-extract`, then run
  `ldd squashfs-root/barkos` to list any shared libraries the host is missing.
