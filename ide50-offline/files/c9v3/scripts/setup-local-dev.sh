#!/bin/bash -e

while [ "$1" ]; do
  case "$1" in
    --compress) COMPRESS=1 ;;
    --obfuscate) OBFUSCATE=1 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

uname="$(uname -a)"
os=
arch="$(uname -m)"
case "$uname" in
    Linux\ *) os=linux ;;
    Darwin\ *) os=darwin ;;
    SunOS\ *) os=sunos ;;
    FreeBSD\ *) os=freebsd ;;
    CYGWIN*) os=windows ;;
    MINGW*) os=windows ;;
esac
case "$uname" in
    *x86_64*) arch=x64 ;;
    *i*86*) arch=x86 ;;
    *armv6l*) arch=arm-pi ;;
esac


cd `dirname $0`/..
SOURCE=`pwd`

LOCAL=$SOURCE/local
APPDIR=$SOURCE/build/webkitbuilds/app.nw
LOCALCFG=configs/client-default-local.js


if [ ! -d $SOURCE/build/webkitbuilds/cache/mac/0.9.3 ]; then
    mkdir -p $SOURCE/build/webkitbuilds/cache/mac/0.9.3/node-webkit.app
    pushd $SOURCE/build/webkitbuilds/cache/mac/0.9.3
    curl -O http://dl.node-webkit.org/v0.9.3/node-webkit-v0.9.3-pre8-osx-ia32.zip
    unzip node-webkit-v0.9.3-pre8-osx-ia32.zip
    popd
fi

DEST="$SOURCE/build/Cloud9-dev.app"
RES="$DEST/Contents/Resources"

rm -rf "$DEST"
mkdir -p "$RES/app.nw"

cp -R $SOURCE/build/webkitbuilds/cache/mac/0.9.3/node-webkit.app/* $DEST
cat $SOURCE/local/Info.plist | sed "s/Cloud9/Cloud9-dev/" >  $DEST/Contents/Info.plist
# TODO add blue icon for dev mode
# rm $DEST/Contents/Resources/nw.icns
cp $SOURCE/build/osx/c9.icns $DEST/Contents/Resources/nw.icns

node --eval "
    var path = require('path')
    var p = require('./local/package.json'); 
    p.main = path.relative('$RES/app.nw', '$SOURCE/local/projectManager.html');
    delete p.dependencies;
    // p.window.icon = 'icon.png';
    console.log(JSON.stringify(p, null, 2));
" > $RES/app.nw/package.json

echo dev app created in build/Cloud9-dev.app/Contents/MacOS/node-webkit