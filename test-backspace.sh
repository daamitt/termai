#!/bin/bash
# Simple test to see what backspace key.name is

echo "Testing backspace key detection..."
echo "Will type: !abc then 3 backspaces then xyz<enter>"
sleep 2

# Start termai in background
npm run dev &
PID=$!

sleep 3

# Send test input (type !abc, backspace 3 times, type xyz, enter)
# Using printf to send exact bytes
{
  sleep 1
  printf "!"
  sleep 0.1
  printf "a"
  sleep 0.1
  printf "b"
  sleep 0.1
  printf "c"
  sleep 0.5
  # Backspace is \x7f (DEL) or \x08 (BS)
  printf "\x7f"
  sleep 0.1
  printf "\x7f"
  sleep 0.1
  printf "\x7f"
  sleep 0.5
  printf "x"
  sleep 0.1
  printf "y"
  sleep 0.1
  printf "z"
  sleep 0.1
  printf "\r"
  sleep 2
  # Ctrl+C to exit
  printf "\x03"
} | nc localhost 4096 &

wait
