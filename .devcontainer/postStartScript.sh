#!/usr/bin/env bash

nohup pnpm tsx tools/sync-env/auto-sync.ts >/tmp/auto-sync.log 2>&1 &