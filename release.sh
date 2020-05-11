#!/bin/bash

rm -rf dist
webpack

readme="yooli.html"
showdown makehtml -u UTF8 --tables -i README.md -o $readme
sed -i '1s/^/<meta charset="UTF-8">/' $readme

rm -rf release.zip
zip -r release.zip \
dist public .env.example package.json package-lock.json ecosystem.config.js \
install.bat install.ps1 start.bat start.ps1 \
appreciate.jpg analysis.png detail.png $readme
#zip -ur -j release.zip vendor/*

