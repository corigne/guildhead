#!/bin/sh
set -eu

cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
: "${XDG_RUNTIME_DIR:?A running user systemd session is required}"

if [ "$#" -eq 0 ]; then
  set -- npm test
fi

# Fail closed rather than silently running an unrestricted build.
exec flock "$XDG_RUNTIME_DIR/guildhead-build.lock" \
  systemd-run --user --scope --quiet \
  --property=CPUQuota=50% \
  --property=CPUWeight=1 \
  --property=MemoryHigh=1G \
  --property=MemoryMax=2G \
  --property=MemorySwapMax=0 \
  --property=IOWeight=1 \
  nice -n 19 ionice -c 3 \
  env GOMAXPROCS=1 UV_THREADPOOL_SIZE=1 VIPS_CONCURRENCY=1 "$@"
