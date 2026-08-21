#!/bin/bash
# Why: remove the PATH symlink that after-install.sh created, but only if it
# still points into a BarkOS install dir — never delete an unrelated
# /usr/bin/barkos a user or other package may own.
set -e

link="/usr/bin/barkos"

if [ -L "$link" ]; then
  target="$(readlink "$link" || true)"
  case "$target" in
    /opt/BarkOS/*|/opt/barkos/*)
      rm -f "$link"
      ;;
  esac
fi

exit 0
