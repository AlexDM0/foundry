/**
 * The launcher port's Claude Code adapter: renders a job's `claude -p` command line, settings, agents, MCP and role files from a neutral
 * profile, and writes the stream-json lines a Watcher sends the session. Pure: the Watcher writes the files and spawns the argv.
 */
import { createHash } from 'node:crypto';
import { join }       from 'node:path';

import type { AgentAdapter }                                       from '../agent-launch/AgentAdapter.ts';
import type { AgentLaunchPlan, StandingReply }                     from '../agent-launch/AgentLaunchPlan.ts';
import type { AgentLaunchRequest }                                 from '../agent-launch/AgentLaunchRequest.ts';
import type { AgentDefinition, NetworkDomainGuard, WorkerProfile } from '../agent-launch/WorkerProfile.ts';
import { PORTABLE_GIT_SETTINGS }                                   from '../git/constants/GitConventions.ts';
import { GitArgumentsUtil }                                        from '../git/utils/GitArgumentsUtil.ts';
import type { AgentHostFacts }                                     from './AgentHostFacts.ts';
import { agentHostFactsFor }                                       from './AgentHostFactsFor.ts';
import { CLAUDE_CONFIG_FOLDER_VARIABLE }                           from './ClaudeConfigFolder.ts';
import { CLAUDE_CODE_CAPABILITIES, CLAUDE_STREAM_LINES }           from './ClaudeStreamLines.ts';

export const CLAUDE_CODE_VENDOR = 'claude-code';
const CLAUDE_PROGRAM_NAME = 'claude';

export const CLAUDE_JOB_FILE_NAMES = {
  settings:     'settings.json',
  agents:       'agents.json',
  mcp:          'mcp.json',
  role:         'role.md',
  reportSchema: 'report.schema.json',
} as const;

/** A parent Claude Code session's variables, which change a nested session's tools; a launched session never carries them. */
export const CLAUDE_NESTING_VARIABLES = ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_MESSAGING_SOCKET', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_SIMPLE'] as const;

/**
 * How a host logs Claude Code in without the keychain or the login file: an API key or token, or a cloud provider and its credentials.
 * `ANTHROPIC_BASE_URL` is not here: it stays a nesting variable, as no probe ran a session with it forwarded.
 */
export const CLAUDE_AUTHENTICATION_VARIABLES = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'AWS_REGION',
  'AWS_PROFILE',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_BEARER_TOKEN_BEDROCK',
  'CLOUD_ML_REGION',
  'ANTHROPIC_VERTEX_PROJECT_ID',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'ANTHROPIC_FOUNDRY_API_KEY',
  'ANTHROPIC_FOUNDRY_RESOURCE',
] as const;

const QUESTION_TOOL_NAME = 'AskUserQuestion';
const USER_INSTRUCTION_FILE_NAME = 'CLAUDE.md';
const INSTRUCTION_FILE_PATHS = [[USER_INSTRUCTION_FILE_NAME], ['CLAUDE.local.md'], ['.claude', USER_INSTRUCTION_FILE_NAME]] as const;
const UUID_HEXADECIMAL_DIGITS = 32;
const UUID_GROUPS = /^(.{8})(.{4})(.{4})(.{4})(.{12})$/;
const UUID_VERSION_DIGIT_INDEX = 12;
const UUID_VARIANT_DIGIT_INDEX = 16;
/** RFC 9562 version 8, a vendor-specific layout: the digits are a hash, not random. */
const UUID_NAME_HASH_VERSION = '8';
const UUID_VARIANT_BITS = 0b1000;
const UUID_VARIANT_MASK = 0b0011;
const HEXADECIMAL_RADIX = 16;
const LOOPBACK_DOMAINS = ['localhost', '127.0.0.1'] as const;
const WEB_FETCH_TOOL_NAME = 'WebFetch';
const STANDING_DENIAL_MESSAGE = 'Permission requests are not answered for this session; work within the tools and paths already allowed.';

/** The session id a job keeps across every Watcher instance and resume: a UUID formatted from `sha256(scope + "\n" + jobId)`. */
export function claudeSessionIdOf(scope: string, jobId: string): string {
  const digits = createHash('sha256').update(`${scope}\n${jobId}`).digest('hex').slice(0, UUID_HEXADECIMAL_DIGITS).split('');
  digits[UUID_VERSION_DIGIT_INDEX] = UUID_NAME_HASH_VERSION;
  const variantDigit = Number.parseInt(digits[UUID_VARIANT_DIGIT_INDEX] ?? '0', HEXADECIMAL_RADIX);
  digits[UUID_VARIANT_DIGIT_INDEX] = (UUID_VARIANT_BITS | (variantDigit & UUID_VARIANT_MASK)).toString(HEXADECIMAL_RADIX);
  return digits.join('').replace(UUID_GROUPS, '$1-$2-$3-$4-$5');
}

function commandPatternsOf(facts: AgentHostFacts, prefix: readonly string[]): string[] {
  return facts.shellToolNames.map((tool) => `${tool}(${prefix.join(' ')} *)`);
}

function fileRulesOf(facts: AgentHostFacts, tools: readonly string[], path: string): string[] {
  return tools.flatMap((tool) => [`${tool}(${facts.rulePathOf(path)})`, `${tool}(${facts.rulePathOf(path)}/**)`]);
}

function allowRulesOf(facts: AgentHostFacts, profile: WorkerProfile, workingDirectory: string): string[] {
  const webDomains = Array.isArray(profile.webNetworkDomains) ? profile.webNetworkDomains : [];
  return [
    'Read',
    'Agent',
    `Edit(${facts.rulePathOf(workingDirectory)}/**)`,
    `Write(${facts.rulePathOf(workingDirectory)}/**)`,
    ...profile.allowedCommandPrefixes.flatMap((prefix) => commandPatternsOf(facts, prefix)),
    ...webDomains.map((domain) => `WebFetch(domain:${domain})`),
  ];
}

function denyRulesOf(facts: AgentHostFacts, profile: WorkerProfile): string[] {
  const loopbackFetches = profile.webNetworkDomains === 'any' ? LOOPBACK_DOMAINS.map((domain) => `WebFetch(domain:${domain})`) : [];
  // A guard whose program did not resolve cannot start, so every call it would check is denied instead of let through.
  const unguardable = profile.networkDomainGuard?.programPath === null ? guardedToolNamesOf(facts) : [];
  return [
    ...profile.deniedWritableRoots.flatMap((root) => fileRulesOf(facts, ['Edit', 'Write'], root)),
    ...profile.deniedReadableRoots.flatMap((root) => fileRulesOf(facts, ['Read'], root)),
    ...profile.deniedCommandPrefixes.flatMap((prefix) => commandPatternsOf(facts, prefix)),
    ...loopbackFetches,
    ...unguardable,
  ];
}

/** Every instruction file in the folders above the repository, the home folder's own `.claude/CLAUDE.md` included, so none reaches a session. */
function instructionFileExclusionsOf(facts: AgentHostFacts, instructionsRoot: string, configFolder: string): string[] {
  const { dirname, join } = facts.pathModule;
  const ancestors: string[] = [];
  for (let folder = dirname(instructionsRoot); !ancestors.includes(folder); folder = dirname(folder)) ancestors.push(folder);
  const exclusions = ancestors.flatMap((folder) => INSTRUCTION_FILE_PATHS.map((filePath) => facts.excludePathOf(join(folder, ...filePath))));
  const userInstructions = facts.excludePathOf(join(configFolder, USER_INSTRUCTION_FILE_NAME));
  return exclusions.includes(userInstructions) ? exclusions : [...exclusions, userInstructions];
}

function sandboxOf(facts: AgentHostFacts, profile: WorkerProfile): Record<string, unknown> {
  const rootAnchored = (absolutePath: string): string => facts.rulePathOf(absolutePath);
  const signingSockets = profile.commitSigning.kind === 'agent-sockets' ? { allowUnixSockets: profile.commitSigning.sockets.map(rootAnchored) } : {};
  return {
    enabled:                  true,
    failIfUnavailable:        true,
    allowUnsandboxedCommands: false,
    autoAllowBashIfSandboxed: true,
    network:                  { allowedDomains: profile.bashNetworkDomains, strictAllowlist: true, ...signingSockets },
    filesystem:               {
      allowWrite: [profile.hatchDirectory, ...profile.writableRoots].map(rootAnchored),
      denyWrite:  profile.deniedWritableRoots.map(rootAnchored),
      denyRead:   profile.deniedReadableRoots.map(rootAnchored),
    },
  };
}

function guardedToolNamesOf(facts: AgentHostFacts): string[] {
  return [...facts.shellToolNames, WEB_FETCH_TOOL_NAME];
}

/** Exec form: Claude Code spawns the absolute program with its arguments and no shell, so no PATH lookup or shell quoting decides it. */
function preToolUseHooksOf(facts: AgentHostFacts, programPath: string, guard: NetworkDomainGuard): Record<string, unknown> {
  const hook = { type: 'command', command: programPath, args: [...guard.arguments] };
  return { PreToolUse: guardedToolNamesOf(facts).map((matcher) => ({ matcher, hooks: [hook] })) };
}

function settingsOf(facts: AgentHostFacts, configFolder: string, request: AgentLaunchRequest): Record<string, unknown> {
  const { profile } = request;
  const guard = profile.networkDomainGuard;
  const hooks = guard === null || guard.programPath === null ? {} : { hooks: preToolUseHooksOf(facts, guard.programPath, guard) };
  return {
    includeCoAuthoredBy: false,
    attribution:         { commit: '', pr: '' },
    autoMemoryEnabled:   false,
    claudeMdExcludes:    instructionFileExclusionsOf(facts, profile.instructionsRoot, configFolder),
    ...facts.sandboxSettingsApply ? { sandbox: sandboxOf(facts, profile) } : {},
    permissions:         { allow: allowRulesOf(facts, profile, request.workingDirectory), deny: denyRulesOf(facts, profile) },
    ...hooks,
  };
}

const READ_ONLY_SEARCH_PROGRAMS = ['rg', 'grep', 'find'] as const;

const READ_ONLY_SUBAGENT = {
  description: 'Named lookups: finds files and lines by searching with rg, grep or find, and reads them.',
  prompt:      'You search the working directory with Read and Bash rg, grep or find, change nothing, and report what you found briefly.',
} as const;

const EDITING_SUBAGENT = {
  description: 'Reads and edits code for a task its parent describes.',
  prompt:      'You read and edit files for the task you are given, and report what you changed briefly.',
} as const;

function subagentToolsOf(facts: AgentHostFacts, readOnly: boolean): string[] {
  if (!readOnly) return ['Read', 'Edit', 'Write', ...facts.shellToolNames];
  return ['Read', ...READ_ONLY_SEARCH_PROGRAMS.flatMap((program) => commandPatternsOf(facts, [program]))];
}

function agentsOf(facts: AgentHostFacts, subagents: readonly AgentDefinition[]): Record<string, unknown> {
  return Object.fromEntries(subagents.map((subagent) => {
    const { description, prompt } = subagent.readOnly ? READ_ONLY_SUBAGENT : EDITING_SUBAGENT;
    const tools = subagentToolsOf(facts, subagent.readOnly);
    return [subagent.name, {
      description, prompt, model: subagent.model, effort: subagent.effort, tools
    }];
  }));
}

/** `core.hooksPath` and the portable settings always; `commit.gpgsign=false` only when no signing allowance lets the sandboxed git sign. */
function gitConfigurationOf(profile: WorkerProfile): Record<string, string> {
  const settings: (readonly [string, string])[] = [['core.hooksPath', profile.gitHooksDirectory], ...PORTABLE_GIT_SETTINGS];
  if (profile.commitSigning.kind === 'unsigned') settings.push(['commit.gpgsign', 'false']);
  return GitArgumentsUtil.environmentOf(settings);
}

function childEnvironmentOf(request: AgentLaunchRequest): Record<string, string> {
  const environment = Object.fromEntries(Object.entries(request.environment)
    .filter(([name]) => !(CLAUDE_NESTING_VARIABLES as readonly string[]).includes(name)));
  return { ...environment, ...gitConfigurationOf(request.profile) };
}

function disallowedToolsOf(profile: WorkerProfile): string[] {
  return [
    ...profile.webNetworkDomains === 'any' ? [] : ['WebSearch'],
    ...profile.webNetworkDomains === 'none' ? ['WebFetch'] : [],
    ...profile.askUser ? [] : [QUESTION_TOOL_NAME],
  ];
}

function argvOf(request: AgentLaunchRequest, pathOf: (fileName: string) => string): string[] {
  const disallowedTools = disallowedToolsOf(request.profile);
  return [
    request.programPath,
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    ...request.resume ? ['--resume', request.sessionId] : ['--session-id', request.sessionId],
    '--model',
    request.model,
    '--effort',
    request.effort,
    '--setting-sources',
    'project',
    '--strict-mcp-config',
    '--mcp-config',
    pathOf(CLAUDE_JOB_FILE_NAMES.mcp),
    '--settings',
    pathOf(CLAUDE_JOB_FILE_NAMES.settings),
    '--agents',
    pathOf(CLAUDE_JOB_FILE_NAMES.agents),
    '--append-system-prompt-file',
    pathOf(CLAUDE_JOB_FILE_NAMES.role),
    ...request.reportSchema === null ? [] : ['--json-schema', jsonTextOf(request.reportSchema)],
    '--permission-mode',
    'auto',
    '--permission-prompt-tool',
    'stdio',
    ...request.profile.skills ? [] : ['--disable-slash-commands'],
    ...disallowedTools.length === 0 ? [] : ['--disallowedTools', disallowedTools.join(',')],
  ];
}

function jsonTextOf(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Every permission request but a question is denied at once, so no session waits on a Watcher nobody watches. */
const DENY_EVERY_PERMISSION_BUT_A_QUESTION: StandingReply = {
  whenAllEqual:  { 'type': 'control_request', 'request.subtype': 'can_use_tool' },
  whenNoneEqual: { 'request.tool_name': QUESTION_TOOL_NAME },
  replyTemplate: JSON.stringify({
    type:     'control_response',
    response: { subtype: 'success', request_id: '{{request_id}}', response: { behavior: 'deny', message: STANDING_DENIAL_MESSAGE } },
  }),
};

function planOf(facts: AgentHostFacts, configFolder: string, request: AgentLaunchRequest): AgentLaunchPlan {
  const pathOf = (fileName: string): string => join(request.jobFilesDirectory, fileName);
  const reportSchemaFiles = request.reportSchema === null ? [] : [{ path: pathOf(CLAUDE_JOB_FILE_NAMES.reportSchema), text: jsonTextOf(request.reportSchema) }];
  return {
    argv:        argvOf(request, pathOf),
    environment: childEnvironmentOf(request),
    files:       [
      { path: pathOf(CLAUDE_JOB_FILE_NAMES.settings), text: jsonTextOf(settingsOf(facts, configFolder, request)) },
      { path: pathOf(CLAUDE_JOB_FILE_NAMES.agents), text: jsonTextOf(agentsOf(facts, request.profile.subagents)) },
      { path: pathOf(CLAUDE_JOB_FILE_NAMES.mcp), text: jsonTextOf({ mcpServers: {} }) },
      { path: pathOf(CLAUDE_JOB_FILE_NAMES.role), text: request.roleBrief },
      ...reportSchemaFiles,
    ],
    standingReplies: [DENY_EVERY_PERMISSION_BUT_A_QUESTION],
  };
}

/** `configFolderVariable` is `CLAUDE_CONFIG_DIR` as the caller read it, which every session it launches inherits. */
export function createClaudeCodeAdapter(facts: AgentHostFacts, configFolderVariable?: string): AgentAdapter {
  const configFolderOf = (homeDirectory: string): string => facts.configFolderOf(homeDirectory, configFolderVariable);
  return Object.freeze<AgentAdapter>({
    vendor:                 CLAUDE_CODE_VENDOR,
    capabilities:           CLAUDE_CODE_CAPABILITIES,
    sandboxDenyShape:       facts.sandboxDenyShape,
    // The config folder passes with the login, so a session writes the transcripts the readers find there.
    inheritedVariableNames: [...CLAUDE_AUTHENTICATION_VARIABLES, CLAUDE_CONFIG_FOLDER_VARIABLE],
    credentialPathsOf:      (homeDirectory) => facts.credentialPathsOf(homeDirectory, configFolderOf(homeDirectory)),
    programPathOf:          (resolver, forbiddenRoots) => resolver.absolutePathOf(CLAUDE_PROGRAM_NAME, forbiddenRoots),
    planOf:                 (request) => planOf(facts, configFolderOf(request.homeDirectory), request),
    sessionIdOf:            claudeSessionIdOf,
    ...CLAUDE_STREAM_LINES,
  });
}

export function claudeCodeAdapterFor(platform: string, configFolderVariable?: string): AgentAdapter {
  return createClaudeCodeAdapter(agentHostFactsFor(platform), configFolderVariable);
}
