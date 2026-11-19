/**
 * The launcher port's Claude Code adapter: renders a job's `claude -p` command line, settings, agents, MCP and role files from a neutral
 * profile, and writes the stream-json lines Talos sends the session. Pure: Talos writes the files and spawns the argv.
 */
import { createHash } from 'node:crypto';
import { join }       from 'node:path';

import type { AgentAdapter }                   from '../agent-launch/AgentAdapter.ts';
import type { AgentLaunchPlan }                from '../agent-launch/AgentLaunchPlan.ts';
import type { AgentLaunchRequest }             from '../agent-launch/AgentLaunchRequest.ts';
import type { AgentDefinition, WorkerProfile } from '../agent-launch/WorkerProfile.ts';
import { PORTABLE_GIT_SETTINGS }               from '../git/constants/GitConventions.ts';
import { GitArgumentsUtil }                    from '../git/utils/GitArgumentsUtil.ts';
import type { AgentHostFacts }                 from './AgentHostFacts.ts';
import { agentHostFactsFor }                   from './AgentHostFactsFor.ts';
import { CLAUDE_API_KEY_VARIABLE }             from './ClaudeApiKeyVariable.ts';
import { CLAUDE_CONFIG_FOLDER_VARIABLE }       from './ClaudeConfigFolder.ts';
import {
  CLAUDE_CODE_CAPABILITIES,
  CLAUDE_CODE_SESSION_ENDINGS,
  CLAUDE_CODE_STANDING_REPLIES,
  CLAUDE_STREAM_LINES
} from './ClaudeStreamLines.ts';

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
 * The variables that bill an API account ahead of the login. Never forwarded from the caller: only API billing gives a session a key, and
 * then only from Talos's own `ANTHROPIC_API_KEY` at spawn.
 */
export const CLAUDE_API_BILLING_VARIABLES = [CLAUDE_API_KEY_VARIABLE, 'ANTHROPIC_AUTH_TOKEN'] as const;

/**
 * How a host logs Claude Code in without the keychain or the login file: an OAuth token, or a cloud provider and its credentials.
 * `ANTHROPIC_BASE_URL` is not here: it stays a nesting variable, as no probe ran a session with it forwarded.
 */
export const CLAUDE_AUTHENTICATION_VARIABLES = [
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
/** Claude Code excludes a rules folder by a glob of its files, never by the folder's own path. */
const RULE_FILES_PATH = ['.claude', 'rules', '**'] as const;
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

/** The session id a job keeps across every child instance and resume: a UUID formatted from `sha256(scope + "\n" + jobId)`. */
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

const FILE_CHANGING_TOOL_NAMES = ['Edit', 'Write'] as const;

/** The stage's folders when the profile names them, each as itself and as a folder; else the write root, or the working directory. */
function editAllowRulesOf(facts: AgentHostFacts, profile: WorkerProfile, workingDirectory: string): string[] {
  if (profile.stageFolders !== undefined) return profile.stageFolders.flatMap((folder) => fileRulesOf(facts, FILE_CHANGING_TOOL_NAMES, folder));
  const writeRoot = profile.writeRoot ?? workingDirectory;
  return FILE_CHANGING_TOOL_NAMES.map((tool) => `${tool}(${facts.rulePathOf(writeRoot)}/**)`);
}

function allowRulesOf(facts: AgentHostFacts, profile: WorkerProfile, workingDirectory: string): string[] {
  if (profile.availableTools === 'none') return [];
  const webDomains = Array.isArray(profile.webNetworkDomains) ? profile.webNetworkDomains : [];
  return [
    'Read',
    'Agent',
    ...editAllowRulesOf(facts, profile, workingDirectory),
    ...profile.allowedCommandPrefixes.flatMap((prefix) => commandPatternsOf(facts, prefix)),
    ...webDomains.map((domain) => `WebFetch(domain:${domain})`),
  ];
}

function denyRulesOf(facts: AgentHostFacts, profile: WorkerProfile): string[] {
  const loopbackFetches = profile.webNetworkDomains === 'any' ? LOOPBACK_DOMAINS.map((domain) => `WebFetch(domain:${domain})`) : [];
  // A guard whose program did not resolve cannot start, so every call it would check is denied instead of let through.
  const unguardable = [
    ...profile.networkDomainGuard?.programPath === null ? guardedToolNamesOf(facts) : [],
    ...profile.stageEditGuard?.programPath === null ? FILE_CHANGING_TOOL_NAMES : [],
  ];
  // Auto mode lets Edit and Write reach any path no deny rule names, so the allow rules of a stage's folders alone confine nothing.
  return [
    ...[...profile.deniedWritableRoots, ...profile.deniedEditRoots ?? []].flatMap((root) => fileRulesOf(facts, FILE_CHANGING_TOOL_NAMES, root)),
    ...profile.deniedReadableRoots.flatMap((root) => fileRulesOf(facts, ['Read'], root)),
    ...profile.deniedCommandPrefixes.flatMap((prefix) => commandPatternsOf(facts, prefix)),
    ...loopbackFetches,
    ...unguardable,
  ];
}

/**
 * Every instruction file in the folders above the repository, the home folder's own `.claude/CLAUDE.md` included, so none reaches a session;
 * for a checkout nested in the main checkout, also the main checkout's files and rules above it, which the checkout holds its own copies of.
 */
function instructionFileExclusionsOf(facts: AgentHostFacts, profile: WorkerProfile, configFolder: string): string[] {
  const { dirname, join } = facts.pathModule;
  const ancestors: string[] = [];
  for (let folder = dirname(profile.instructionsRoot); !ancestors.includes(folder); folder = dirname(folder)) ancestors.push(folder);
  const exclusions = ancestors.flatMap((folder) => INSTRUCTION_FILE_PATHS.map((filePath) => facts.excludePathOf(join(folder, ...filePath))));
  const nestedExclusions = (profile.nestedCheckoutAncestors ?? [])
    .flatMap((folder) => [...INSTRUCTION_FILE_PATHS, RULE_FILES_PATH].map((filePath) => facts.excludePathOf(join(folder, ...filePath))));
  const userInstructions = facts.excludePathOf(join(configFolder, USER_INSTRUCTION_FILE_NAME));
  const allExclusions = [...nestedExclusions, ...exclusions];
  return allExclusions.includes(userInstructions) ? allExclusions : [...allExclusions, userInstructions];
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
      allowWrite: [profile.extraWritableDirectory, ...profile.writableRoots].map(rootAnchored),
      denyWrite:  profile.deniedWritableRoots.map(rootAnchored),
      denyRead:   profile.deniedReadableRoots.map(rootAnchored),
    },
  };
}

function guardedToolNamesOf(facts: AgentHostFacts): string[] {
  return [...facts.shellToolNames, WEB_FETCH_TOOL_NAME];
}

interface ToolCallGuard {
  readonly programPath: string | null;
  readonly arguments:   readonly string[];
}

/** Exec form: Claude Code spawns the absolute program with its arguments and no shell, so no PATH lookup or shell quoting decides it. */
function guardEntriesOf(guard: ToolCallGuard | null | undefined, matchers: readonly string[]): Record<string, unknown>[] {
  if (guard === null || guard === undefined || guard.programPath === null) return [];
  const hook = { type: 'command', command: guard.programPath, args: [...guard.arguments] };
  return matchers.map((matcher) => ({ matcher, hooks: [hook] }));
}

/** The network guard before every shell and WebFetch call, then a stage's edit guard before every Edit and Write; no key without either. */
function hooksOf(facts: AgentHostFacts, profile: WorkerProfile): Record<string, unknown> {
  const preToolUse = [
    ...guardEntriesOf(profile.networkDomainGuard, guardedToolNamesOf(facts)),
    ...guardEntriesOf(profile.stageEditGuard, FILE_CHANGING_TOOL_NAMES),
  ];
  return preToolUse.length === 0 ? {} : { hooks: { PreToolUse: preToolUse } };
}

/** A confined request on a host whose sandbox settings do not apply is refused, so no session meant to be confined starts without them. */
function sandboxSettingsOf(facts: AgentHostFacts, request: AgentLaunchRequest): Record<string, unknown> {
  if (facts.sandboxSettingsApply) return { sandbox: sandboxOf(facts, request.profile) };
  if (request.confinement === 'confined') throw new Error('a confined session was asked for on a host where no Claude Code sandbox setting applies');
  return {};
}

function settingsOf(facts: AgentHostFacts, configFolder: string, request: AgentLaunchRequest): Record<string, unknown> {
  const { profile } = request;
  return {
    includeCoAuthoredBy: false,
    attribution:         { commit: '', pr: '' },
    autoMemoryEnabled:   false,
    claudeMdExcludes:    instructionFileExclusionsOf(facts, profile, configFolder),
    ...sandboxSettingsOf(facts, request),
    permissions:         { allow: allowRulesOf(facts, profile, request.workingDirectory), deny: denyRulesOf(facts, profile) },
    ...hooksOf(facts, profile),
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

const VARIABLES_NEVER_PASSED: readonly string[] = [...CLAUDE_NESTING_VARIABLES, ...CLAUDE_API_BILLING_VARIABLES];

function childEnvironmentOf(request: AgentLaunchRequest): Record<string, string> {
  const environment = Object.fromEntries(Object.entries(request.environment).filter(([name]) => !VARIABLES_NEVER_PASSED.includes(name)));
  return { ...environment, ...gitConfigurationOf(request.profile) };
}

/** `--max-budget-usd` works only with `-p`, which every launch passes. */
function budgetArgumentsOf(request: AgentLaunchRequest): string[] {
  const { billing } = request;
  return billing?.mode === 'api' && billing.maxBudgetUsd !== undefined ? ['--max-budget-usd', String(billing.maxBudgetUsd)] : [];
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
    // An empty list is Claude Code's own spelling of no built-in tool at all.
    ...request.profile.availableTools === 'none' ? ['--tools', ''] : [],
    ...disallowedTools.length === 0 ? [] : ['--disallowedTools', disallowedTools.join(',')],
    ...budgetArgumentsOf(request),
  ];
}

function jsonTextOf(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Every permission request but a question is denied at once, so no session waits on a question nobody answers. */
function planOf(facts: AgentHostFacts, configFolder: string, request: AgentLaunchRequest): AgentLaunchPlan {
  const pathOf = (fileName: string): string => join(request.jobFilesDirectory, fileName);
  const reportSchemaFiles = request.reportSchema === null ? [] : [{ path: pathOf(CLAUDE_JOB_FILE_NAMES.reportSchema), text: jsonTextOf(request.reportSchema) }];
  return {
    argv:        argvOf(request, pathOf),
    environment: childEnvironmentOf(request),
    ...request.billing?.mode === 'api' ? { environmentFromTalos: { [CLAUDE_API_KEY_VARIABLE]: CLAUDE_API_KEY_VARIABLE } } : {},
    files:       [
      { path: pathOf(CLAUDE_JOB_FILE_NAMES.settings), text: jsonTextOf(settingsOf(facts, configFolder, request)) },
      { path: pathOf(CLAUDE_JOB_FILE_NAMES.agents), text: jsonTextOf(agentsOf(facts, request.profile.subagents)) },
      { path: pathOf(CLAUDE_JOB_FILE_NAMES.mcp), text: jsonTextOf({ mcpServers: {} }) },
      { path: pathOf(CLAUDE_JOB_FILE_NAMES.role), text: request.roleBrief },
      ...reportSchemaFiles,
    ],
    standingReplies: CLAUDE_CODE_STANDING_REPLIES,
    ...CLAUDE_CODE_SESSION_ENDINGS,
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
