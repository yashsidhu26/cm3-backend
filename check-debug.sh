#!/bin/bash
cd /Users/yash/Documents/Startup
bun dev > /tmp/debug-output.log 2>&1 &
sleep 5
cat /tmp/debug-output.log
