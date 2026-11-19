import type { AgentCredentials }         from '../agent-launch/AgentAdapter.ts';
import { CLAUDE_API_KEY_VARIABLE }       from './ClaudeApiKeyVariable.ts';
import { CLAUDE_CONFIG_FOLDER_VARIABLE } from './ClaudeConfigFolder.ts';

export const CLAUDE_CODE_CREDENTIALS: AgentCredentials = Object.freeze({
  configurationFolderVariableName: CLAUDE_CONFIG_FOLDER_VARIABLE,
  billingKeyVariableName:          CLAUDE_API_KEY_VARIABLE,
  authenticationCheckSentence:     'no managed forceLoginMethod or forceLoginOrgUUID setting refuses API keys',
});
