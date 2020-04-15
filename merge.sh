#!/bin/bash

mkdir -p download/all
mkdir -p all
cp -rf download/**/*.pdf all
mv all/*.pdf download/all
rm -rf all
