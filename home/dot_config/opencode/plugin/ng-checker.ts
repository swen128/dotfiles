import type { Plugin } from "@opencode-ai/plugin"

export const NgCheckerPlugin: Plugin = async () => {
  const ngRules = [
    {
      commands: ["curl", "wget"],
      message: "Use the WebFetch tool instead of curl/wget for fetching web content."
    },
    {
      commands: ["npm install", "npm i", "npm run"],
      message: "Use bun instead of npm for package installation."
    },
    {
      commands: ["--no-verify"],
      message: "Git commands with --no-verify flag are not allowed. Ensure all hooks pass."
    },
    {
      commands: ["git add -A", "git add -u"],
      message: "Only stage what you've changed."
    },
    {
      commands: ["rm -rf /", "rm -rf /*"],
      message: "Dangerous command blocked for safety."
    }
  ]

  const validateCommand = (command: string): { error?: { message: string } } => {
    const violatedRule = ngRules.find(rule => 
      rule.commands.find(ngCommand => command.includes(ngCommand))
    )
    
    return violatedRule 
      ? { error: { message: violatedRule.message } }
      : {}
  }

  return {
    "tool.execute.before": async (input: { tool: string; sessionID: string; callID: string }, output: { args: any }) => {
      if (input.tool === "bash" && output.args.command) {
        const validation = validateCommand(output.args.command)
        if (validation.error) {
          console.error(`❌ Command blocked: ${validation.error.message}`)
          throw new Error(validation.error.message)
        }
      }
    }
  }
}
