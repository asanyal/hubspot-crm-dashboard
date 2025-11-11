#!/usr/bin/env bash
set -e

# Recreate ~/.ssh and key from secret
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Write the key from the secret
printf "%s\n" "$SSH_PRIVATE_KEY" > ~/.ssh/id_ed25519
chmod 600 ~/.ssh/id_ed25519

# Trust GitHub host (avoids "host key verification failed")
ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null || true
chmod 644 ~/.ssh/known_hosts

# Start agent and load key
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
