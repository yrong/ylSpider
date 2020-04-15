#!/bin/bash

webpack
showdown makehtml -i README.md -o README.html --tables
rm -rf release.zip
zip -r release.zip dist public .env.example package.json package-lock.json \
install.bat install.ps1 ecosystem.config.js README.html \
appreciate.jpg contract.png
