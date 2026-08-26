import type { Plugin } from "@opencode-ai/plugin";

export const BashDescriptionPlugin: Plugin = async () => ({
  "tool.definition": async (input, output) => {
    if (input.toolID !== "bash") return;

    output.description = output.description.replace(/\n# Git and GitHub\n[\s\S]*?(?=\n# |$)/, "");
  },
});
