#!/usr/bin/env bash
set -euo pipefail
echo "==> Installing deps"
if [ -f package-lock.json ]; then npm ci; else npm i; fi
echo "==> Linting"
npm run lint || true
echo "==> Tests"
npm run test
echo "==> Build"
npm run build
echo "==> Done"
