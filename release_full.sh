#!/bin/bash

rm -rf release
rm release_full.zip
mkdir release
unzip release.zip -d release
cp -r vendor/* release
zip -r release_full.zip release/*
