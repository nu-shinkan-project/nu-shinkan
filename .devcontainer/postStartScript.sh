#!/usr/bin/env bash

nohup bash -c 'pnpm tsx tools/sync-env/auto-sync.ts >/tmp/auto-sync.log 2>&1 &' > /dev/null