import type { AgentConfigurationNames } from '../../agent-launch/AgentAdapter.ts';

export const CLAUDE_DIRECTORY_NAME = '.claude';

export const CLAUDE_PROJECT_MCP_FILE_NAME = '.mcp.json';

export const CLAUDE_CODE_CONFIGURATION_NAMES: AgentConfigurationNames = Object.freeze({
  folderNames: Object.freeze([CLAUDE_DIRECTORY_NAME]),
  fileNames:   Object.freeze([CLAUDE_PROJECT_MCP_FILE_NAME]),
});
