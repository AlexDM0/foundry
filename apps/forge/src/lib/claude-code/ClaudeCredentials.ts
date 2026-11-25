import type { AgentBillingOption, AgentCredentials } from '../agent-launch/AgentAdapter.ts';
import { CLAUDE_API_KEY_VARIABLE }                   from './ClaudeApiKeyVariable.ts';
import { CLAUDE_CONFIG_FOLDER_VARIABLE }             from './ClaudeConfigFolder.ts';

export const CLAUDE_CODE_CREDENTIALS: AgentCredentials = Object.freeze({
  configurationFolderVariableName: CLAUDE_CONFIG_FOLDER_VARIABLE,
  authenticationCheckSentence:     'no managed forceLoginMethod or forceLoginOrgUUID setting refuses API keys',
});

/** The Claude login's subscription by default, or the Console account of the API key, each launch capped by `--max-budget-usd`. */
export const CLAUDE_CODE_BILLING_OPTIONS: readonly AgentBillingOption[] = Object.freeze([
  Object.freeze({ mode: 'subscription', keyVariableName: null, capsEachLaunch: false }),
  Object.freeze({ mode: 'api', keyVariableName: CLAUDE_API_KEY_VARIABLE, capsEachLaunch: true }),
]);
