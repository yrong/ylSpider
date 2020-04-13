#!/bin/bash

webpack
rm -rf release.zip
zip -r release.zip dist .env.example package.json package-lock.json install.bat install.ps1 ecosystem.config.js README.md
