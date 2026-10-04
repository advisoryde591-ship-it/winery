#!/bin/sh
# מעלה את מספר הגרסה בכל קישורי הקבצים וב-service worker, כדי שהטלפון יטען את כל הקבצים החדשים יחד.
set -e
cd "$(dirname "$0")/.."
old=$(grep -o "cellar-v[0-9]*" sw.js | grep -o "[0-9]*")
new=$((old + 1))
sed -i "s/?v=$old'/?v=$new'/g; s/?v=$old\"/?v=$new\"/g" app.js index.html
sed -i "s/cellar-v$old/cellar-v$new/" sw.js
echo "version $old -> $new"
