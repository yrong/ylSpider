#!/bin/bash

webpack

readme="yooli.html"
showdown makehtml -u UTF8 --tables -i README.md -o $readme
sed -i '1s/^/<meta charset="UTF-8">/' $readme

rm -rf release.zip
zip -r release.zip dist public .env.example package.json package-lock.json \
install.bat install.ps1 ecosystem.config.js $readme \
appreciate.jpg analysis.png detail.png
#zip -ur -j release.zip vendor/*

