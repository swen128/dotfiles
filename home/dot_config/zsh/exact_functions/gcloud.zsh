#!/usr/bin/env zsh

# Function to switch gcloud accounts based on mise environment
gcloud_account_switch() {
  if [[ -n "$GCLOUD_ACCOUNT" ]]; then
    local current_account=$(gcloud config get-value account 2>/dev/null)
    if [[ "$current_account" != "$GCLOUD_ACCOUNT" ]]; then
      echo "Switching gcloud account to: $GCLOUD_ACCOUNT"
      gcloud config set account "$GCLOUD_ACCOUNT"
    fi
  fi
}