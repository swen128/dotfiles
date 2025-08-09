import type { Plugin } from "@opencode-ai/plugin"

export const NotificationPlugin: Plugin = async ({ client, $ }) => {
  return {
    event: async ({ event }) => {
      // Send notification on session completion
      if (event.type === "session.idle") {
        await $`open -g raycast://confetti`
      }
    },
  }
}

