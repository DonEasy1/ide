#!/bin/bash -e

NODE_VERSION=v0.10.22

cd $HOME
mkdir -p .c9/bin
mkdir -p .c9/node_modules
cd .c9

rm -rf node 
rm -rf node-$NODE_VERSION*

echo :Installing Node $NODE_VERSION
wget http://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.gz
tar xvfz node-$NODE_VERSION-linux-x64.tar.gz
mv node-$NODE_VERSION-linux-x64 node
rm node-$NODE_VERSION-linux-x64.tar.gz
 
NPM=$HOME/.c9/node/bin/npm
NODE=$HOME/.c9/node/bin/node

echo :Installing pty.js
$NPM install pty.js
echo :Installing Nak
$NPM install https://github.com/c9/nak/tarball/ea1299a3688f307d2269c93bd9692101eb4f262e
# echo :Installing Coffee Script
# $NPM install coffee
# echo :Installing Less
# $NPM install less
# echo :Installing Sass
# $NPM install sass
# echo :Installing TypeScript
# $NPM install typescript

for FILE in $HOME/.c9/node_modules/.bin/* 
do
    perl -i -p -e 's/#!\/usr\/bin\/env node/#!'${NODE//\//\\\/}'/' $(readlink -f $FILE)
done

echo :Installing TMUX

rm -f ~/.c9/bin/tmux
ln -s `which tmux` ~/.c9/bin
# echo Downloading TMUX 1.6...
# curl -sSOL http://downloads.sourceforge.net/tmux/tmux-1.6.tar.gz
# echo Downloading Libevent 2.0...
# curl -sSOL http://downloads.sourceforge.net/project/levent/libevent/libevent-2.0/libevent-2.0.16-stable.tar.gz

# # Unpack the sources

# tar xzf tmux-1.6.tar.gz
# tar xzf libevent-2.0.16-stable.tar.gz

# # Compiling libevent

# PREFIX=$HOME/.c9

# cd libevent-2.0.16-stable
# ./configure --prefix=$PREFIX
# make
# make install

# # Compiling tmux

# cd ../tmux-1.6
# LDFLAGS="-L$PREFIX/lib" CPPFLAGS="-I$PREFIX/include" LIBS="-lresolv" ./configure --prefix=$PREFIX
# make
# make install

# mkdir -p ~/.c9/bin
# cp ./tmux ~/.c9/bin/tmux

echo 1 > $HOME/.c9/installed
echo :Done.