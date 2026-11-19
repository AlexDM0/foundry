import type { AgentPromptFillName }                            from '../../agent-launch/AgentAdapter.ts';
import { QUESTION_TOOL_NAME }                                  from '../ClaudeStreamMapper.ts';
import { CLAUDE_DIRECTORY_NAME, CLAUDE_PROJECT_MCP_FILE_NAME } from './ClaudeCodePaths.ts';

export const CLAUDE_CODE_DISPLAY_NAME = 'Claude Code';

/** Claude Code's names of the tools and files a prompt mentions, which render every prompt as it read before the port named them. */
export const CLAUDE_CODE_PROMPT_FILLS: Readonly<Record<AgentPromptFillName, string>> = Object.freeze({
  askUserTool:             QUESTION_TOOL_NAME,
  webFetchTool:            'WebFetch',
  webSearchTool:           'WebSearch',
  instructionFile:         'CLAUDE.md',
  agentConfigurationPaths: `\`${CLAUDE_DIRECTORY_NAME}/\`, \`${CLAUDE_PROJECT_MCP_FILE_NAME}\``,
});
