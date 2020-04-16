#!/bin/bash

webpack

showdown makehtml -u UTF8 --tables -i README.md -o yooli.html
sed -i '1s/^/<meta charset="UTF-8">/' yooli.html

rm -rf release.zip
zip -r release.zip dist public .env.example package.json package-lock.json \
install.bat install.ps1 ecosystem.config.js README.html \
appreciate.jpg analysis.png detail.png
