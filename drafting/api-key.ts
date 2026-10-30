// The Anthropic key for the commands that call Claude. Resolve's own variable comes first, so a key kept apart from
// Claude Code's (which bills an ANTHROPIC_API_KEY it finds instead of the subscription) wins; the standard one also works.
export const KEY_VARS = ["RESOLVE_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"] as const;

export const apiKey = () => KEY_VARS.map((v) => process.env[v]).find(Boolean);

// One line that says how to set it, for a command that stops before calling Claude.
export const KEY_HELP = "Set RESOLVE_ANTHROPIC_API_KEY (or ANTHROPIC_API_KEY) to an Anthropic API key: export RESOLVE_ANTHROPIC_API_KEY=sk-ant-...";
