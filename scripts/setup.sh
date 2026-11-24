#!/bin/sh
set -eu
set -f
umask 077

image=ghcr.io/corigne/guildhead:1.12.1
directory=${XDG_CONFIG_HOME:-${HOME:?HOME is required}/.config}/guildhead
action=setup
channels=
entry=guildhead/discord-token
lfg=
yes=false
no_start=false
temporary=
token=

fail() { printf 'Guildhead: %s\n' "$*" >&2; exit 1; }
cleanup() {
  if [ -n "$temporary" ]; then rm -f -- "$temporary"; fi
}
trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' HUP TERM

usage() {
  cat <<'HELP'
Guildhead guided setup (Linux)

  sh setup.sh [setup|start|status|stop] [options]

  --directory PATH    Installation folder (default: ~/.config/guildhead)
  --channels IDS      Comma-separated tooltip channel IDs
  --token-entry NAME  Password-store entry (default: guildhead/discord-token)
  --lfg-channel ID    Optional destination for group posts
  --no-start          Prepare a new installation without starting it
  --yes               Approve setup/start without a confirmation prompt
  --help              Show this help

Requires Docker Compose, curl, and an initialized pass password store.
No root access or package installation is performed by this script.
Existing installations and data are never reset or automatically adopted.
HELP
}

case ${1:-} in setup|start|status|stop) action=$1; shift ;; esac
while [ "$#" -gt 0 ]; do
  case $1 in
    --directory|--channels|--token-entry|--lfg-channel)
      [ "$#" -ge 2 ] || fail "Missing value for $1."
      case $1 in
        --directory) directory=$2 ;;
        --channels) channels=$2 ;;
        --token-entry) entry=$2 ;;
        --lfg-channel) lfg=$2 ;;
      esac
      shift 2 ;;
    --yes) yes=true; shift ;;
    --no-start) no_start=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown option: $1. Use --help." ;;
  esac
done

prompt() {
  if ! { : </dev/tty; } 2>/dev/null; then fail "A terminal is needed. Supply the setup options, --yes, and an existing pass entry."; fi
  printf '%s' "$1" >/dev/tty
  IFS= read -r answer </dev/tty || fail "Input cancelled."
}
confirm() {
  if [ "$yes" = true ]; then return; fi
  prompt "$1 [y/N] "
  case $answer in y|Y|yes|YES) ;; *) fail "Cancelled; no running bot was changed." ;; esac
}
valid_id() {
  case $1 in ''|*[!0-9]*) return 1 ;; esac
  [ "${#1}" -le 20 ] && [ "$1" != 0 ]
}
valid_channels() {
  case $1 in ''|,*|*,|*,,*|*[!0-9,]*) return 1 ;; esac
  old_ifs=$IFS
  IFS=,
  seen=,
  for channel in $1; do
    if ! valid_id "$channel"; then IFS=$old_ifs; return 1; fi
    case $seen in *,"$channel",*) IFS=$old_ifs; return 1 ;; esac
    seen=$seen$channel,
  done
  IFS=$old_ifs
}
validate_settings() {
  valid_channels "$channels" || fail "Use unique channel IDs of 1-20 digits, separated by commas without spaces."
  case $entry in ''|-*|/*|*..*|*[!A-Za-z0-9_./-]*) fail "Use a simple relative pass entry name, such as guildhead/discord-token." ;; esac
  if [ -n "$lfg" ]; then valid_id "$lfg" || fail "The LFG channel ID must be 1-20 digits."; fi
}
compose() {
  GUILDHEAD_TOKEN_PATH="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/guildhead-setup/discord-token" \
    docker compose --env-file /dev/null --project-name guildhead-setup \
    --file "$directory/compose.yaml" "$@"
}
load_settings() {
  [ -f "$directory/settings" ] && [ -f "$directory/compose.yaml" ] || fail "No complete setup found in $directory. Run setup first."
  channels= entry= lfg=
  while IFS='=' read -r key value; do
    case $key in
      channels) channels=$value ;;
      token_entry) entry=$value ;;
      lfg_channel) lfg=$value ;;
      *) fail "Unrecognized setup setting; the file was not executed." ;;
    esac
  done <"$directory/settings"
  validate_settings
}
check_installations() {
  containers=$(docker ps -a --format '{{.ID}} {{.Image}} {{.Names}}') || fail "Could not check existing containers."
  while read -r container container_image container_name; do
    [ -n "$container" ] || continue
    case "$container_image $container_name" in
      *ghcr.io/corigne/guildhead*|*guildhead*)
        owner=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$container") || fail "Could not check an existing Guildhead container."
        [ "$owner" = "$directory" ] || fail "Another Guildhead installation exists. Stop here and keep using its setup; no data was adopted or changed."
        ;;
    esac
  done <<CONTAINERS
$containers
CONTAINERS
}
read_token() {
  token=$(pass show "$entry") || fail "Could not unlock $entry. Check pass and your GPG key."
  newline='
'
  token=${token%%"$newline"*}
  case $token in ''|*[!A-Za-z0-9_.-]*) fail "The first line of the pass entry must contain only the Discord bot token." ;; esac
}
check_discord() {
  status=$(printf 'Authorization: Bot %s\n' "$token" |
    curl --silent --show-error --connect-timeout 10 --max-time 20 \
      --header @- --output /dev/null --write-out '%{http_code}' \
      https://discord.com/api/v10/users/@me) || fail "Could not contact Discord. No bot was started."
  [ "$status" = 200 ] || fail "Discord did not accept the bot token (HTTP $status). Check the pass entry."
}
prepare_runtime() {
  runtime_parent=${XDG_RUNTIME_DIR:-/run/user/$(id -u)}
  case $runtime_parent in /*) ;; *) fail "XDG_RUNTIME_DIR must be an absolute path." ;; esac
  case $runtime_parent in *[!A-Za-z0-9_./-]*) fail "The runtime path contains unsupported characters." ;; esac
  [ -d "$runtime_parent" ] && [ ! -L "$runtime_parent" ] || fail "A private Linux runtime directory is required."
  [ "$(stat -c %u "$runtime_parent")" = "$(id -u)" ] || fail "The runtime directory must belong to you."
  [ "$(stat -c %a "$runtime_parent")" = 700 ] || fail "The runtime directory must be private (mode 700)."
  [ "$(stat -f -c %T "$runtime_parent")" = tmpfs ] || fail "The runtime directory must be RAM-backed (tmpfs); refusing to save a plaintext token to disk."
  runtime=$runtime_parent/guildhead-setup
  [ ! -L "$runtime" ] || fail "The runtime folder must not be a symbolic link."
  if [ -e "$runtime" ]; then
    [ -d "$runtime" ] && [ "$(stat -c %u "$runtime")" = "$(id -u)" ] || fail "The runtime folder must belong to you."
  else
    mkdir -m 700 "$runtime"
  fi
  chmod 700 "$runtime"
  [ ! -L "$runtime/discord-token" ] || fail "The runtime token must not be a symbolic link."
}
start_bot() {
  load_settings
  check_installations
  prepare_runtime
  read_token
  check_discord
  compose config --quiet || fail "Check the installation's compose.yaml."
  compose pull bot || fail "The image could not be downloaded; the existing bot was left alone."
  temporary=$(mktemp "$runtime/token.XXXXXX")
  printf '%s\n' "$token" >"$temporary"
  token=
  recreate=false
  if [ -f "$runtime/discord-token" ] && cmp -s "$temporary" "$runtime/discord-token"; then
    rm -f -- "$temporary"
    temporary=
  else
    chmod 444 "$temporary"
    mv -f -- "$temporary" "$runtime/discord-token"
    temporary=
    recreate=true
  fi
  if [ "$recreate" = true ]; then
    compose up -d --no-build --force-recreate bot
  else
    compose up -d --no-build bot
  fi
  container=$(compose ps --all --quiet bot)
  [ -n "$container" ] || fail "No bot container was created."
  started=$(docker inspect --format '{{.State.StartedAt}}' "$container")
  count=0
  expected=0
  old_ifs=$IFS
  IFS=,
  for channel in $channels; do expected=$((expected + 1)); done
  IFS=$old_ifs
  while [ "$count" -lt 30 ]; do
    logs=$(compose logs --no-color --since "$started" --tail=100 bot 2>/dev/null) || logs=
    ready=$(printf '%s\n' "$logs" | grep -c 'Guildhead webhook ready in #' || true)
    if printf '%s\n' "$logs" | grep -q 'Logged in as ' &&
       printf '%s\n' "$logs" | grep -q 'Registered /' &&
       [ "$ready" -ge "$expected" ] &&
       [ -n "$(compose ps --status running --quiet bot)" ]; then
      printf 'Guildhead is connected to Discord. Try /help in your server.\n'
      printf 'Saved setup: %s\n' "$directory"
      return
    fi
    count=$((count + 1))
    sleep 2
  done
  fail "Startup was not confirmed. The container was kept for inspection. Run: sh \"$directory/setup.sh\" status"
}

[ "$(uname -s)" = Linux ] || fail "This first setup helper supports Linux. Use the hosting guide on other systems."
case $directory in /*) ;; *) fail "--directory must be an absolute path." ;; esac
case $directory in /|"${HOME:?}") fail "Choose a dedicated installation folder, not your home or filesystem root." ;; esac
[ ! -L "$directory" ] || fail "The installation folder must not be a symbolic link."
for tool in docker curl pass stat mktemp; do
  command -v "$tool" >/dev/null 2>&1 || fail "$tool is required. Install it first; this helper does not install system packages."
done
docker compose version >/dev/null 2>&1 || fail "Docker Compose is required."
docker info >/dev/null 2>&1 || fail "Docker is not available to your user. Start it and check access; do not run this helper with sudo."

case $action in
  status)
    load_settings
    compose ps
    compose logs --no-color --tail=30 bot
    exit ;;
  stop)
    load_settings
    check_installations
    prepare_runtime
    compose stop bot
    rm -f -- "$runtime/discord-token"
    printf 'Guildhead stopped. Its data and encrypted credentials were kept.\n'
    exit ;;
  start)
    confirm "Start this Guildhead installation? Any other copy using this token must be stopped."
    start_bot
    exit ;;
esac

if [ -f "$directory/settings" ]; then
  load_settings
  printf 'Existing setup kept unchanged: %s\nTo start it: sh "%s/setup.sh" start\n' "$directory" "$directory"
  exit
fi
if [ -e "$directory" ] && { [ ! -d "$directory" ] || [ -n "$(ls -A "$directory")" ]; }; then
  fail "The destination is not empty. No files were replaced."
fi
check_installations
if docker volume inspect guildhead-setup_data >/dev/null 2>&1; then
  fail "Saved Guildhead setup data already exists. Use the original setup folder; it was not adopted or changed."
fi
printf 'Guildhead setup\n\nCreate a Discord bot at https://discord.com/developers/applications\nEnable Message Content Intent and invite it with channel read/send, embed,\nattachment, and Manage Webhooks permissions. Do not grant Administrator.\nEnable Discord developer mode, then right-click a channel to copy its ID.\nStop any other copy using this token, including copies on other computers.\n\n'
if [ -z "$channels" ]; then prompt 'Tooltip channel IDs (comma-separated): '; channels=$answer; fi
if [ "$yes" != true ]; then
  prompt "Password-store entry [$entry]: "
  if [ -n "$answer" ]; then entry=$answer; fi
  if [ -z "$lfg" ]; then prompt 'LFG channel ID (Enter to use the command channel): '; lfg=$answer; fi
fi
validate_settings
prepare_runtime
printf 'Installation folder: %s\nImage: %s\n' "$directory" "$image"
confirm "Create this setup? No other installation will be changed."
if ! pass ls "$entry" >/dev/null 2>&1; then
  [ "$yes" != true ] || fail "Create the encrypted token entry with: pass insert $entry. Then rerun setup."
  printf 'Save your Discord bot token in pass. It will be encrypted with your existing GPG key.\n'
  pass insert "$entry" || fail "Could not save the token. Initialize pass with your GPG key first."
fi
read_token
check_discord
token=
mkdir -p "$directory"
directory=$(cd "$directory" && pwd -P)
chmod 700 "$directory"
if [ ! -f "$0" ]; then fail "Download this script to a file before running it."; fi
cp "$0" "$directory/setup.sh"
cat >"$directory/compose.yaml" <<COMPOSE
services:
  bot:
    image: $image
    restart: unless-stopped
    environment:
      DISCORD_TOKEN_FILE: /run/guildhead-token
      DISCORD_CHANNEL_IDS: "$channels"
      DISCORD_LFG_CHANNEL_ID: "$lfg"
    volumes:
      - data:/data
      - type: bind
        source: \${GUILDHEAD_TOKEN_PATH:?Use setup.sh start to unlock credentials}
        target: /run/guildhead-token
        read_only: true
        bind:
          create_host_path: false
volumes:
  data:
COMPOSE
printf 'channels=%s\ntoken_entry=%s\nlfg_channel=%s\n' "$channels" "$entry" "$lfg" >"$directory/settings"
printf 'Setup saved. Your token stays encrypted in pass, not in these files.\n'
if [ "$no_start" = true ]; then
  printf 'To start: sh "%s/setup.sh" start\n' "$directory"
else
  start_bot
fi
