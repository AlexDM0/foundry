#!/bin/zsh
# Screenshots every "name width height address" line of a list with headless Chrome at 2x, reduced motion forced.
LIST=$1; SHOTS=$2; SCALE=${3:-2}
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE=${SHOTS}-chrome-profile
mkdir -p "$PROFILE" "$SHOTS"
while read -r name width height address; do
  [[ -z $name ]] && continue
  perl -e "alarm 60; exec @ARGV" "$CHROME" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$PROFILE" \
    --force-prefers-reduced-motion --allow-file-access-from-files --force-device-scale-factor=$SCALE --default-background-color=00000000 \
    --window-size=$width,$height --virtual-time-budget=4000 --screenshot="$SHOTS/$name.png" "$address" >/dev/null 2>&1 || echo "failed $name"
done < "$LIST"
