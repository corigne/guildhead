#!/bin/sh
set -eu

file=$(mktemp)
trap 'rm -f -- "$file"' 0
trap 'exit 130' INT
trap 'exit 143' HUP TERM

curl -fsSL https://raw.githubusercontent.com/corigne/guildhead/bb454aae3f79dc75122023d7db779418dfd8a26c/scripts/setup.sh -o "$file"
sh "$file" "$@"
