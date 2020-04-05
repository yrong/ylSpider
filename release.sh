#!/bin/bash

zip -r release.zip . -x "*/\.*" -x ".env" -x "*.idea*" -x "*.git*" -x "*.DS_Store" -x "*node_modules*" -x "*download*"
