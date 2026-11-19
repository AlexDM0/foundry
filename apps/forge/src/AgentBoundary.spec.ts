/**
 * Every connection to the agent goes through the agent port (the owner's rule of 2026-11-18): no shipping line outside the port's
 * adapter, comments included, names the vendor's program, paths, variables, wire fields, hook protocol, flags, tool names or marks, and no
 * testing helper names the program but on its listed lines. The adapter is `src/lib/claude-code/` and the fake agent's files, an adapter of
 * the same port. The prompts and bundles the code hands to sessions are scanned as prose, the probe and graphics evidence by file. Specs and
 * `.dom.tsx` files plant and assert both sides of the boundary, so they are not scanned; neither are JSON fixtures and recordings (recorded
 * wire), `docs/`, nor file names: a bundle's `SKILL.md` with its YAML header is the bundle's own text. Each allowlist is exact both ways,
 * each entry naming the package that removes it, and each form is planted once.
 */
import { readFileSync }           from 'node:fs';
import { describe, expect, test } from 'bun:test';

import { importGraphScannerOf, reachablePathsFrom, repositoryRootOfThisCheckout } from './testing/ImportGraph.ts';
import {
  memoisedPerSource,
  programFiles,
  programTypeScriptSources,
  type RepositorySource
} from './testing/RepositorySources.ts';

type AgentForm =
  | 'vendor-name'
  | 'vendor-file-layout'
  | 'vendor-wire-key'
  | 'vendor-hook-protocol'
  | 'vendor-flag'
  | 'vendor-tool-name'
  | 'vendor-mark'
  | 'port-tool-word';

type LineKind = 'code' | 'comment' | 'prose';

interface FormPattern {
  readonly pattern:   RegExp;
  readonly lineKinds: readonly LineKind[];
  /** The folders the pattern applies in; `null` applies it everywhere. */
  readonly folders:   readonly string[] | null;
}

interface BoundaryReport {
  /** `<path>: <form>: <trimmed line>`, one per scanned occurrence the allowlist does not hold. */
  readonly violations:       readonly string[];
  readonly unusedAllowances: readonly string[];
}

const ADAPTER_FOLDER = 'src/lib/claude-code/';
const FAKE_AGENT_ADAPTER_FILES: readonly string[] = ['src/testing/FakeAgentAdapter.ts', 'src/testing/FakeReportingSessions.ts'];
const FAKE_AGENT_ADAPTER_FOLDER = 'src/testing/fake-agent/';
const PORT_FOLDERS: readonly string[] = ['src/lib/agent-launch/', 'src/lib/talos/'];
/** The one file under the port's folders an allowlist key may name, until WP2.27 renames `bashNetworkDomains` and rewords its comments. */
const PORT_CARVE_OUT_FILE = 'src/lib/agent-launch/WorkerProfile.ts';
/** Where the vendor's tool names and transcript folders are a reach; a view's button says "Edit", and the Bridge quotes reported rows. */
const VENDOR_LOGIC_FOLDERS: readonly string[] = ['src/services/', 'src/lib/', 'cli/'];
/** This repository's own development folders, taken out of a line before it is matched. */
const DEVELOPMENT_FOLDER_PATTERN = /\.claude\/(?:\.evidence|worktrees|rules)/g;
const PROSE_FOLDERS: readonly string[] = ['resources/', 'skills/'];
const EVIDENCE_FOLDERS: readonly string[] = ['.platform-probes/', '.readme-graphics/'];
const EVIDENCE_EXTENSIONS: readonly string[] = ['.js', '.py', '.sh', '.md'];

const CODE_AND_COMMENT: readonly LineKind[] = ['code', 'comment'];
const EVERY_LINE_KIND: readonly LineKind[] = ['code', 'comment', 'prose'];
const ASKING_AND_WEB_TOOL_NAMES = 'AskUserQuestion|NotebookEdit|TodoWrite|WebFetch|WebSearch';
const WIRE_KEYS_BUT_SUBTYPE = 'session_id|is_error|api_retry|api_error(?:_status)?|terminal_reason|tool_use(?:_id)?|tool_result|parent_tool_use_id'
  + '|structured_output|permission_denials|total_cost_usd|(?:cache_read_|cache_creation_)?input_tokens|output_tokens|control_request'
  + '|control_response|can_use_tool|request_id|rate_limit_event|stream_event|claude_code_version|five_hour|seven_day|updatedInput';
const HOOK_PROTOCOL_WORDS = 'PreToolUse|PostToolUse|SessionStart|SubagentStop|UserPromptSubmit|hookSpecificOutput|hookEventName'
  + '|permissionDecision(?:Reason)?|tool_name|tool_input|allowed_domains';
/** `--resume` and `--max-budget-usd` are forge's own options too, so they are left out. */
const VENDOR_FLAG_NAMES = 'output-format|input-format|permission-mode|dangerously-skip-permissions|settings|setting-sources|append-system-prompt'
  + '|allowed-?[tT]ools|disallowed-?[tT]ools|mcp-config|strict-mcp-config|add-dir|session-id|include-partial-messages|max-turns|json-schema|fallback-model';

const AGENT_FORM_PATTERNS: Readonly<Record<AgentForm, readonly FormPattern[]>> = {
  'vendor-name':        [{ pattern: /claude|anthropic/i, lineKinds: EVERY_LINE_KIND, folders: null }],
  'vendor-file-layout': [
    { pattern: /\.mcp\.json|SKILL\.md|settings\.local\.json|\.meta\.json/, lineKinds: EVERY_LINE_KIND, folders: null },
    { pattern: /\bprojects\/|\bsubagents\//, lineKinds: CODE_AND_COMMENT, folders: VENDOR_LOGIC_FOLDERS },
  ],
  'vendor-wire-key': [
    { pattern: new RegExp(`\\b(?:subtype|${WIRE_KEYS_BUT_SUBTYPE})\\b|stream-json`), lineKinds: ['code'], folders: null },
    // A comment says `subtype` of a media type.
    { pattern: new RegExp(`\\b(?:${WIRE_KEYS_BUT_SUBTYPE})\\b|stream-json`), lineKinds: ['comment'], folders: null },
  ],
  'vendor-hook-protocol': [{
    pattern:   new RegExp(`\\b(?:${HOOK_PROTOCOL_WORDS})\\b`),
    lineKinds: CODE_AND_COMMENT,
    folders:   null,
  }],
  'vendor-flag': [{
    pattern:   new RegExp(`--(?:${VENDOR_FLAG_NAMES})\\b`),
    lineKinds: CODE_AND_COMMENT,
    folders:   null,
  }],
  'vendor-tool-name': [
    { pattern: new RegExp(`['"\`](?:${ASKING_AND_WEB_TOOL_NAMES})['"\`]`), lineKinds: ['code'], folders: null },
    { pattern: new RegExp(`\\b(?:${ASKING_AND_WEB_TOOL_NAMES})\\b`), lineKinds: ['comment', 'prose'], folders: null },
    { pattern: /['"`](?:Bash|PowerShell|Edit|Write|Read|Glob|Grep)['"`]/, lineKinds: CODE_AND_COMMENT, folders: VENDOR_LOGIC_FOLDERS },
    { pattern: /\bBash\b/, lineKinds: CODE_AND_COMMENT, folders: VENDOR_LOGIC_FOLDERS },
  ],
  'vendor-mark': [
    // The source of a regular expression spells the mark with backslashes.
    { pattern: /\\?\(Recommended\\?\)/, lineKinds: CODE_AND_COMMENT, folders: null },
    { pattern: /`\/\$\{[A-Z_.]*SKILL/, lineKinds: CODE_AND_COMMENT, folders: null },
    { pattern: /\/\{\{\w*[sS]kill\w*\}\}/, lineKinds: ['prose'], folders: null },
  ],
  'port-tool-word': [{
    pattern:   /\b(?:Bash|PowerShell|Edit|Write|Read|Glob|Grep|WebFetch|WebSearch|AskUserQuestion|NotebookEdit|TodoWrite)\b|\bbash[A-Z]/,
    lineKinds: CODE_AND_COMMENT,
    folders:   PORT_FOLDERS,
  }],
};

const AGENT_FORMS = Object.keys(AGENT_FORM_PATTERNS) as AgentForm[];

/** `<path>: <form>: <trimmed line>` of a shipping line or a prose line, each with the package that removes it or why it stays. */
const ALLOWED_AGENT_LINES: Readonly<Record<string, string>> = {
  'bridge/@types/BoardStateDocument.ts: vendor-wire-key: /** The newest observation of one usage window the plan has, such as `five_hour` or `seven_day`. */':
    'Removed by WP2.26: The session\'s events carry the asking call, the recommendation and the window\'s length.',
  'bridge/shell/HeaderModel.ts: vendor-wire-key: const USAGE_WINDOW_WORDS: Readonly<Record<string, string>> = { five_hour: \'5-hour window\', seven_day: \'week\' };':
    'Removed by WP2.26: The session\'s events carry the asking call, the recommendation and the window\'s length.',
  [
  'bridge/views/pipeline/setup/BillingStepModel.ts: vendor-name: description: \'Agents run on this machine\\\'s Claude login. Usage counts against the plan\\\'s limits, '
    + 'such as its weekly window.\','
  ]:
    'Removed by WP2.24: The adapter names its variables, its credentials and its repair.',
  [
  'bridge/views/pipeline/setup/BillingStepModel.ts: vendor-name: description: \'Billed to the Console account of ANTHROPIC_API_KEY in the Overseer\\\'s environment. The '
    + 'key is never stored.\','
  ]:
    'Removed by WP2.24: The adapter names its variables, its credentials and its repair.',
  [
  'bridge/views/pipeline/setup/BillingStepModel.ts: vendor-name: if (choice.mode === \'subscription\') return { summary: \'Subscription\', detail: \'Agents run on this '
    + 'machine\\\'s Claude login.\' };'
  ]:
    'Removed by WP2.24: The adapter names its variables, its credentials and its repair.',
  'bridge/views/pipeline/setup/BillingStepModel.ts: vendor-name: return { summary: \'API key\', detail: `Billed to ANTHROPIC_API_KEY. ${capLine}` };':
    'Removed by WP2.24: The adapter names its variables, its credentials and its repair.',
  'bridge/views/question-panel/QuestionPanelModel.ts: vendor-tool-name: const ASKING_TOOL_NAME = \'AskUserQuestion\';':
    'Removed by WP2.26: The session\'s events carry the asking call, the recommendation and the window\'s length.',
  [
  'bridge/views/question-panel/QuestionPanelModel.ts: vendor-mark: /** The label as asked, without the agent\'s trailing `(Recommended)`, which `isRecommended` carries as '
    + 'a mark beside it. */'
  ]:
    'Removed by WP2.26: The session\'s events carry the asking call, the recommendation and the window\'s length.',
  'bridge/views/question-panel/QuestionPanelModel.ts: vendor-mark: const RECOMMENDED_LABEL_SUFFIX_PATTERN = /\\s*\\(Recommended\\)\\s*$/u;':
    'Removed by WP2.26: The session\'s events carry the asking call, the recommendation and the window\'s length.',
  'cli/CommandContext.ts: vendor-name: import { claudeCodeAdapterFor }                 from \'../src/lib/claude-code/ClaudeCodeAdapter.ts\';':
    'Permanent: The seam imports the vendor\'s adapter; the one composition root that chooses it.',
  'cli/CommandContext.ts: vendor-name: claudeConfigFolder,':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'cli/CommandContext.ts: vendor-name: claudeConfigFolderVariable,':
    'Removed by WP2.24: The adapter names its variables, its credentials and its repair.',
  'cli/CommandContext.ts: vendor-name: /** `node:os`\'s `homedir()`, carried here so a spec can point the Claude Code transcripts at a scratch tree. */':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'cli/CommandContext.ts: vendor-name: /** Claude Code\'s user folder for this process, `CLAUDE_CONFIG_DIR` or `<home>/.claude`, which its transcripts are read from. */':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'cli/CommandContext.ts: vendor-name: claudeConfigFolder:      string;':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'cli/CommandContext.ts: vendor-name: /** What the Overseer launches its sessions through: Claude Code, or the scripted fake agent under the fake-agent switch. */':
    'Removed by WP2.24: The adapter names its variables, its credentials and its repair.',
  'cli/CommandContext.ts: vendor-name: /** The one place outside `src/lib/claude-code/` the vendor\'s adapter is chosen; a spec-spawned binary always gets the fake. */':
    'Removed by WP2.24: The adapter names its variables, its credentials and its repair.',
  'cli/CommandContext.ts: vendor-name: if (!fakeAgentIsOn()) return claudeCodeAdapterFor(process.platform, claudeConfigFolderVariable());':
    'Permanent: The seam chooses the vendor\'s adapter; WP2.24 rewrites this key when the variable leaves the call.',
  'cli/CommandContext.ts: vendor-name: claudeConfigFolder:      claudeConfigFolder(homedir()),':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'cli/HelpText.ts: vendor-hook-protocol: its Assistant; the SessionStart hook \\`hook session-start\\` goes into':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/HelpText.ts: vendor-name: \\`.claude/settings.local.json\\`, and two skills into \\`.claude/skills/\\`:':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/HelpText.ts: vendor-file-layout: \\`.claude/settings.local.json\\`, and two skills into \\`.claude/skills/\\`:':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/HelpText.ts: vendor-name: ${PRODUCT_NAMES.PRODUCT_OWNER_SKILL} for intake. It never writes CLAUDE.md. Refused when an':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/HelpText.ts: vendor-hook-protocol: than files a project edits, the SessionStart hook, the two skills and':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/HelpText.ts: vendor-name: once, what install version 16 wrote: the managed CLAUDE.md block,':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/HelpText.ts: vendor-name: reported "removed; commit CLAUDE.md" since the Overseer launches':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/HelpText.ts: vendor-name: nothing onto a branch whose committed CLAUDE.md still holds it, the':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/HelpText.ts: vendor-hook-protocol: SubagentStop, PreToolUse and PostToolUse hook entries (unless':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/HelpText.ts: vendor-name: hook session-start          Print \\`session-instructions.md\\` for the session Claude Code is':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/HelpText.ts: vendor-hook-protocol: starting: \\`init\\` and \\`update\\` wire it as the SessionStart hook in':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/HelpText.ts: vendor-name: \\`.claude/settings.local.json\\`, which a job\'s sessions never load. It':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/HelpText.ts: vendor-file-layout: \\`.claude/settings.local.json\\`, which a job\'s sessions never load. It':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/HelpText.ts: vendor-hook-protocol: --allow <domains>       PreToolUse guard an Overseer renders into a job\'s settings. It denies,':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/HelpText.ts: vendor-tool-name: through the hook\'s JSON on standard output, a Bash call whose':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/HelpText.ts: vendor-hook-protocol: \\`allowed_domains\\`, or a WebFetch whose URL host, names a domain':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/HelpText.ts: vendor-hook-protocol: --allow <folder>        stage\'s folders: the PreToolUse guard an Overseer renders into the':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/HelpText.ts: vendor-file-layout: \\`subagents/workflows/<run>/\\` included: one row per agent, oldest':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'cli/InstallVersionCheck.ts: vendor-name: import { retiredInstalledFilePathsIn } from \'./adoption/constants/RetiredClaudeInstall.ts\';':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/InstalledFiles.ts: vendor-hook-protocol: /** What the SessionStart hook prints to each session User opens; its presence marks the files installed. */':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/InstalledFiles.ts: vendor-name: /** Claude Code reads a project\'s skills from `.claude/skills/<name>/`, written with `/` as `.gitignore` takes it. */':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/InstalledFiles.ts: vendor-name: return `.claude/skills/${skillName}`;':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/adoption/InstalledFileGeneration.ts: vendor-name: CLAUDE_CODE_INSTALL,':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/adoption/InstalledFileGeneration.ts: vendor-name: } from \'./constants/ClaudeCodeInstall.ts\';':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/adoption/InstalledFileGeneration.ts: vendor-file-layout: * filled with the skill\'s installed name, which its `SKILL.md` frontmatter names it by.':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/adoption/InstalledFileGeneration.ts: vendor-name: for (const part of CLAUDE_CODE_INSTALL.parts) {':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/adoption/InstalledFileGeneration.ts: vendor-name: for (const part of CLAUDE_CODE_INSTALL.parts) { [copy 2]':
    'Removed by WP2.30: The adapter installs into a repository.',
  [
  'cli/adoption/RetiredAgentHostRefusal.ts: vendor-name: * host, which agent-progress no longer installs for: its worker and extension would keep running beside the '
    + 'Claude Code ones.'
  ]:
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  [
  'cli/adoption/RetiredAgentHostRefusal.ts: vendor-name: `${PRODUCT_NAMES.PROGRAM} ${commandName} installs for Claude Code only, but ${manifestFilePath} names the agent '
    + 'host ${RETIRED_AGENT_HOST}, `'
  ]:
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  [
  'cli/adoption/TrackerRefresh.ts: vendor-name: * `cli/adoption/constants/ClaudeCodeInstall.ts`, and reports per part whether its bytes changed: that is how an '
    + 'orchestrator that read the'
  ]:
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/adoption/TrackerRefresh.ts: vendor-name: import { removeManagedBlock }          from \'../../src/lib/claude-code/ClaudeInstructions.ts\';':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/adoption/TrackerRefresh.ts: vendor-name: claudeLocalSettingsFilePathFor,':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/adoption/TrackerRefresh.ts: vendor-name: claudeSettingsFilePathFor,':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/adoption/TrackerRefresh.ts: vendor-name: }                                                                    from \'../../src/lib/claude-code/ClaudeSettings.ts\';':
    'Removed by WP2.30: The adapter installs into a repository.',
  [
  'cli/adoption/TrackerRefresh.ts: vendor-name: import { CLAUDE_MANAGED_BLOCK_MARKERS }                                                    from '
    + '\'../constants/ClaudeManagedBlockMarkers.ts\';'
  ]:
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/adoption/TrackerRefresh.ts: vendor-name: CLAUDE_CODE_INSTALL,':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/adoption/TrackerRefresh.ts: vendor-name: }                                                                from \'./constants/ClaudeCodeInstall.ts\';':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/adoption/TrackerRefresh.ts: vendor-name: import { RETIRED_HOOKS, retiredInstalledFilePathsIn } from \'./constants/RetiredClaudeInstall.ts\';':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/adoption/TrackerRefresh.ts: vendor-name: const CLAUDE_INSTRUCTIONS_FILE_NAME = \'CLAUDE.md\';':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/adoption/TrackerRefresh.ts: vendor-name: const sharedSettingsFilePath = claudeSettingsFilePathFor(rootDirectory);':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/adoption/TrackerRefresh.ts: vendor-name: const localSettingsFilePath = claudeLocalSettingsFilePathFor(rootDirectory);':
    'Removed by WP2.30: The adapter installs into a repository.',
  [
  'cli/adoption/TrackerRefresh.ts: vendor-name: function refreshClaudeSettingsHooks(hooks: readonly CommandHook[], rootDirectory: string, commandName: string, '
    + 'standardError: (text: string) => void): string {'
  ]:
    'Removed by WP2.30: The adapter installs into a repository.',
  [
  'cli/adoption/TrackerRefresh.ts: vendor-name: /** Removed once: `init` and `update` no longer own CLAUDE.md, and the Overseer launches nothing onto a target that still '
    + 'commits the block. */'
  ]:
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/adoption/TrackerRefresh.ts: vendor-name: const claudeFilePath = join(rootDirectory, CLAUDE_INSTRUCTIONS_FILE_NAME);':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/adoption/TrackerRefresh.ts: vendor-name: const outcome        = removeManagedBlock(claudeFilePath, CLAUDE_MANAGED_BLOCK_MARKERS);':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  [
  'cli/adoption/TrackerRefresh.ts: vendor-name: `${claudeFilePath} has an \\`${CLAUDE_MANAGED_BLOCK_MARKERS.start}\\` marker with no matching end marker, so the block was '
    + 'left alone. `'
  ]:
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/adoption/TrackerRefresh.ts: vendor-name: return outcome === \'removed\' ? \'removed; commit CLAUDE.md\' : \'no managed block\';':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/adoption/TrackerRefresh.ts: vendor-name: const settingsFilePaths = [claudeSettingsFilePathFor(rootDirectory), claudeLocalSettingsFilePathFor(rootDirectory)];':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/adoption/TrackerRefresh.ts: vendor-name: const { parts }          = CLAUDE_CODE_INSTALL;':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/adoption/TrackerRefresh.ts: vendor-name: case \'claude-settings-hooks\':':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/adoption/TrackerRefresh.ts: vendor-name: return refreshClaudeSettingsHooks(part.hooks, workspace.rootDirectory, commandName, standardError);':
    'Removed by WP2.30: The adapter installs into a repository.',
  [
  'cli/adoption/constants/ClaudeCodeInstall.ts: vendor-name: * What `init` and `update` install for Claude Code: the parts, in report order, each with the files it writes '
    + 'or removes, the flag that'
  ]:
    'Removed by WP2.30: The adapter installs into a repository.',
  [
  'cli/adoption/constants/ClaudeCodeInstall.ts: vendor-name: * opts out of it and its report label. What install version 16 wrote and 17 removes is in '
    + '`cli/adoption/constants/RetiredClaudeInstall.ts`.'
  ]:
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/adoption/constants/ClaudeCodeInstall.ts: vendor-name: import type { CommandHook }                 from \'../../../src/lib/claude-code/ClaudeSettings.ts\';':
    'Removed by WP2.30: The adapter installs into a repository.',
  [
  'cli/adoption/constants/ClaudeCodeInstall.ts: vendor-name: /** A folder of this checkout\'s `skills/`, copied into the repository\'s `.claude/skills/` under the name '
    + 'the product gives that skill. */'
  ]:
    'Removed by WP2.30: The adapter installs into a repository.',
  [
  'cli/adoption/constants/ClaudeCodeInstall.ts: vendor-name: /** A skill folder an earlier install version wrote under `.claude/skills/`, with the file names it installed '
    + 'there. */'
  ]:
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  [
  'cli/adoption/constants/ClaudeCodeInstall.ts: vendor-name: /** Each skill source folder\'s installed name, which its `SKILL.md` frontmatter is filled with too, so '
    + 'Claude Code knows it by its folder. */'
  ]:
    'Removed by WP2.30: The adapter installs into a repository.',
  [
  'cli/adoption/constants/ClaudeCodeInstall.ts: vendor-file-layout: /** Each skill source folder\'s installed name, which its `SKILL.md` frontmatter is filled with too, '
    + 'so Claude Code knows it by its folder. */'
  ]:
    'Removed by WP2.30: The adapter installs into a repository.',
  [
  'cli/adoption/constants/ClaudeCodeInstall.ts: vendor-file-layout: const RETIRED_SKILL_FOLDERS: readonly RetiredSkillFolder[] = [{ skillName: PRODUCT_NAMES.PROGRAM, '
    + 'installedFileNames: [\'SKILL.md\', \'Reference.md\'] }];'
  ]:
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  [
  'cli/adoption/constants/ClaudeCodeInstall.ts: vendor-name: * `claude-settings-hooks` writes no file text, only Claude Code settings entries, and takes out the retired '
    + 'ones; `skill-folders` rewrites'
  ]:
    'Removed by WP2.30: The adapter installs into a repository.',
  [
  'cli/adoption/constants/ClaudeCodeInstall.ts: vendor-name: * the managed CLAUDE.md block, and `retired-install` the hooks (unless `--no-hooks`) and files '
    + '`cli/adoption/constants/RetiredClaudeInstall.ts`'
  ]:
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  [
  'cli/adoption/constants/ClaudeCodeInstall.ts: vendor-name: | { writing: \'claude-settings-hooks\'; reportLabel: string; optOutFlag: InstallOptOutFlag | null; hooks: '
    + 'readonly CommandHook[] }'
  ]:
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/adoption/constants/ClaudeCodeInstall.ts: vendor-hook-protocol: event:          \'SessionStart\',':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/adoption/constants/ClaudeCodeInstall.ts: vendor-name: export const CLAUDE_CODE_INSTALL: { parts: readonly InstalledPart[] } = {':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/adoption/constants/ClaudeCodeInstall.ts: vendor-name: { writing: \'retired-managed-block\', reportLabel: \'CLAUDE.md\', optOutFlag: null },':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/adoption/constants/ClaudeCodeInstall.ts: vendor-name: writing:     \'claude-settings-hooks\',':
    'Removed by WP2.30: The adapter installs into a repository.',
  [
  'cli/adoption/constants/RetiredClaudeInstall.ts: vendor-name: * merger default 26 retired, and the onboarder default 28 retired. Kept out of '
    + '`cli/adoption/constants/ClaudeCodeInstall.ts`, which'
  ]:
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/adoption/constants/RetiredClaudeInstall.ts: vendor-name: import type { CommandHook }            from \'../../../src/lib/claude-code/ClaudeSettings.ts\';':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/adoption/constants/RetiredClaudeInstall.ts: vendor-hook-protocol: { event: \'SubagentStop\', command: `${PRODUCT_NAMES.PROGRAM} hook subagent-stop` },':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/adoption/constants/RetiredClaudeInstall.ts: vendor-hook-protocol: { event: \'PreToolUse\', command: `${PRODUCT_NAMES.PROGRAM} hook pre-tool-use` },':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/adoption/constants/RetiredClaudeInstall.ts: vendor-hook-protocol: { event: \'PostToolUse\', command: `${PRODUCT_NAMES.PROGRAM} hook post-tool-use` },':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/adoption/constants/RetiredClaudeInstall.ts: vendor-name: agentDefinition:  join(rootDirectory, \'.claude\', \'agents\', `${DISPATCH_PROTOCOL.WORKER_AGENT_TYPE}.md`),':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  [
  'cli/adoption/init/InitCommand.ts: vendor-name: `  2. Ask a Claude session in this repository to file a ticket. It loads the ${PRODUCT_OWNER_SKILL} skill, files the '
    + 'ticket as a`,'
  ]:
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  'cli/constants/ClaudeManagedBlockMarkers.ts: vendor-name: import type { ManagedBlockMarkers }         from \'../../src/lib/claude-code/ClaudeInstructions.ts\';':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  [
  'cli/constants/ClaudeManagedBlockMarkers.ts: vendor-name: /** Neither marker may contain the other: `src/lib/claude-code/ClaudeInstructions.ts` finds the end by '
    + 'searching forward from the start. */'
  ]:
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/constants/ClaudeManagedBlockMarkers.ts: vendor-name: export function claudeManagedBlockMarkersFor({ PROGRAM }: Pick<ProductNames, \'PROGRAM\'>): ManagedBlockMarkers {':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/constants/ClaudeManagedBlockMarkers.ts: vendor-name: export const CLAUDE_MANAGED_BLOCK_MARKERS: ManagedBlockMarkers = claudeManagedBlockMarkersFor(PRODUCT_NAMES);':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  [
  'cli/drafts/DraftContentSubcommands.ts: vendor-name: if (recommended === undefined) throw refusalOf(`${PRODUCT_NAMES.PROGRAM} draft ask needs --recommended <letters>, '
    + 'the option or options Claude recommends.`);'
  ]:
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  [
  'cli/hooks/BashDomainsHook.ts: vendor-hook-protocol: * `hook bash-domains --allow <domains>`, the `PreToolUse` guard design section 4.4 renders for a role with a '
    + '`network` line: auto mode\'s'
  ]:
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  [
  'cli/hooks/BashDomainsHook.ts: vendor-hook-protocol: * classifier may grant a Bash or PowerShell call\'s `allowed_domains`, or a WebFetch, outside the ticket\'s '
    + 'domains, and this denies it. It exits 0 whatever'
  ]:
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  [
  'cli/hooks/BashDomainsHook.ts: vendor-tool-name: * classifier may grant a Bash or PowerShell call\'s `allowed_domains`, or a WebFetch, outside the ticket\'s domains, '
    + 'and this denies it. It exits 0 whatever'
  ]:
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  [
  'cli/hooks/BashDomainsHook.ts: vendor-hook-protocol: const USAGE = `${PRODUCT_NAMES.PROGRAM} hook bash-domains --allow <domain>,<domain>…  (the PreToolUse hook JSON '
    + 'arrives on standard input)`;'
  ]:
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  [
  'cli/hooks/BashDomainsHook.ts: vendor-hook-protocol: /** The shell tools whose `allowed_domains` the guard checks; on a host with no sandbox the field is absent and the '
    + 'call passes. */'
  ]:
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/hooks/BashDomainsHook.ts: vendor-tool-name: const SHELL_TOOL_NAMES: readonly string[] = [\'Bash\', \'PowerShell\'];':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  [
  'cli/hooks/BashDomainsHook.ts: vendor-tool-name: const NON_SHELL_TOOL_NAMES: readonly string[] = [\'Read\', \'Edit\', \'Write\', \'Glob\', \'Grep\', \'NotebookEdit\', '
    + '\'TodoWrite\', \'AskUserQuestion\'];'
  ]:
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/hooks/BashDomainsHook.ts: vendor-hook-protocol: const requested = toolInput[\'allowed_domains\'];':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/hooks/BashDomainsHook.ts: vendor-hook-protocol: const toolName = hookInput[\'tool_name\'];':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/hooks/BashDomainsHook.ts: vendor-hook-protocol: const toolInput = recordOf(hookInput[\'tool_input\']) ?? {};':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/hooks/BashDomainsHook.ts: vendor-hook-protocol: if (requested === null) return { kind: \'deny\', reason: \'its allowed_domains is not a list of domains\' };':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/hooks/BashDomainsHook.ts: vendor-tool-name: if (toolName === \'WebFetch\') {':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/hooks/BashDomainsHook.ts: vendor-hook-protocol: hookSpecificOutput: {':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/hooks/BashDomainsHook.ts: vendor-hook-protocol: hookEventName:            \'PreToolUse\',':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/hooks/BashDomainsHook.ts: vendor-hook-protocol: permissionDecision:       \'deny\',':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/hooks/BashDomainsHook.ts: vendor-hook-protocol: permissionDecisionReason: `Denied by the ticket\'s network line: ${reason}.`,':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  [
  'cli/hooks/SessionStartHook.ts: vendor-name: * `hook session-start`: prints the installed session instructions, which Claude Code adds to the session it starts. A '
    + 'session the Overseer'
  ]:
    'Removed by WP2.30: The adapter installs into a repository.',
  [
  'cli/hooks/SessionStartHook.ts: vendor-hook-protocol: /** Prints nothing on any failure and never throws: a failing SessionStart hook would reach every session in the '
    + 'repository. */'
  ]:
    'Removed by WP2.30: The adapter installs into a repository.',
  [
  'cli/hooks/StageEditsHook.ts: vendor-hook-protocol: * `hook stage-edits --allow <folder>…`, the `PreToolUse` guard an Overseer renders into the settings of a job of an '
    + 'entity (E18). The deny'
  ]:
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  [
  'cli/hooks/StageEditsHook.ts: vendor-hook-protocol: const USAGE = `${PRODUCT_NAMES.PROGRAM} hook stage-edits --allow <folder> [--allow <folder>]…  (the PreToolUse hook '
    + 'JSON arrives on standard input)`;'
  ]:
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/hooks/StageEditsHook.ts: vendor-tool-name: const FILE_CHANGING_TOOL_NAMES: readonly string[] = [\'Edit\', \'Write\'];':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/hooks/StageEditsHook.ts: vendor-hook-protocol: const toolName = hookInput[\'tool_name\'];':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/hooks/StageEditsHook.ts: vendor-hook-protocol: const targetPath = targetPathOf(hookInput, recordOf(hookInput[\'tool_input\']) ?? {});':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/hooks/StageEditsHook.ts: vendor-hook-protocol: hookSpecificOutput: {':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/hooks/StageEditsHook.ts: vendor-hook-protocol: hookEventName:            \'PreToolUse\',':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/hooks/StageEditsHook.ts: vendor-hook-protocol: permissionDecision:       \'deny\',':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/hooks/StageEditsHook.ts: vendor-hook-protocol: permissionDecisionReason: `Denied by the folders of this job\'s stage: ${reason}.`,':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'cli/measurement/usage/UsageAgents.ts: vendor-name: import type { SubagentTranscript } from \'../../../src/lib/claude-code/ClaudeTranscripts.ts\';':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'cli/measurement/usage/UsageAgents.ts: vendor-name: import { transcriptTextAt }        from \'../../../src/lib/claude-code/ClaudeTranscripts.ts\';':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'cli/measurement/usage/UsageAgents.ts: vendor-name: import type { TranscriptProfile }  from \'../../../src/lib/claude-code/utils/TranscriptUsageUtil.ts\';':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'cli/measurement/usage/UsageAgents.ts: vendor-name: import { TranscriptUsageUtil }     from \'../../../src/lib/claude-code/utils/TranscriptUsageUtil.ts\';':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'cli/measurement/usage/UsageCommand.ts: vendor-name: import { listSubagentTranscripts, transcriptFolderFor } from \'../../../src/lib/claude-code/ClaudeTranscripts.ts\';':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  [
  'cli/measurement/usage/UsageCommand.ts: vendor-name: import type { CohortSummary }                           from '
    + '\'../../../src/lib/claude-code/utils/TranscriptCohortUtil.ts\';'
  ]:
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  [
  'cli/measurement/usage/UsageCommand.ts: vendor-name: import { TranscriptCohortUtil }                         from '
    + '\'../../../src/lib/claude-code/utils/TranscriptCohortUtil.ts\';'
  ]:
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  [
  'cli/measurement/usage/UsageCommand.ts: vendor-name: const transcriptFolder = commandArguments.option(\'transcripts\') ?? transcriptFolderFor(workspace.rootDirectory, '
    + 'context.claudeConfigFolder);'
  ]:
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'cli/measurement/usage/UsageText.ts: vendor-name: import type { CohortSummary } from \'../../../src/lib/claude-code/utils/TranscriptCohortUtil.ts\';':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'cli/overseer/OverseerForeground.ts: vendor-name: import { CLAUDE_MANAGED_BLOCK_MARKERS }                      from \'../constants/ClaudeManagedBlockMarkers.ts\';':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/overseer/OverseerForeground.ts: vendor-name: managedBlockMarker:    CLAUDE_MANAGED_BLOCK_MARKERS.start,':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/overseer/OverseerWording.ts: vendor-name: import { CLAUDE_API_KEY_VARIABLE }     from \'../../src/lib/claude-code/ClaudeApiKeyVariable.ts\';':
    'Removed by WP2.24: The adapter names its variables, its credentials and its repair.',
  [
  'cli/overseer/OverseerWording.ts: vendor-name: question:    `The pipeline sets API billing, and the environment of the Overseer has no ${CLAUDE_API_KEY_VARIABLE}. No '
    + 'agent starts until you set it.`,'
  ]:
    'Removed by WP2.24: The adapter names its variables, its credentials and its repair.',
  [
  'cli/overseer/OverseerWording.ts: vendor-name: context: `Set ${CLAUDE_API_KEY_VARIABLE} at OS level, never in a committed file, as the docs/cli.md section "API billing '
    + 'set-up" tells. `'
  ]:
    'Removed by WP2.24: The adapter names its variables, its credentials and its repair.',
  [
  'cli/overseer/OverseerWording.ts: vendor-name: context: `Make sure that ${CLAUDE_API_KEY_VARIABLE} holds a valid key, and that no managed forceLoginMethod or '
    + 'forceLoginOrgUUID `'
  ]:
    'Removed by WP2.24: The adapter names its variables, its credentials and its repair.',
  'cli/overseer/OverseerWording.ts: vendor-tool-name: productOwnerBashNetwork: \'Bash reaches no network.\',':
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  'cli/overseer/OverseerWording.ts: vendor-tool-name: productOwnerBashNetwork: \'Do not use the network from Bash.\',':
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  'cli/overseer/OverseerWording.ts: vendor-mark: const firstLine = `/${PRODUCT_NAMES.PRODUCT_OWNER_SKILL} ${intake.text}`.trim();':
    'Removed by WP2.25: Live answers, the quit act, the instruction bundle line and the start folder go through the port.',
  'cli/overseer/OverseerWording.ts: vendor-name: case \'claude-md-block-committed\':':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/overseer/OverseerWording.ts: vendor-name: return `launches onto ${notice.target} wait: commit the CLAUDE.md change \\`update\\` made`;':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/overseer/routes/BoardStateReader.ts: vendor-name: claudeConfigFolder: context.claudeConfigFolder,':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  [
  'cli/setup/RetiredSkillStep.ts: vendor-name: * `init` and `update` copy both skills into each tracked repository\'s .claude/skills/, so nothing is linked into '
    + '~/.claude/skills/ any'
  ]:
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/setup/RetiredSkillStep.ts: vendor-name: const skillPath = join(host.homeDirectory, \'.claude\', \'skills\', skillName);':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/setup/Setup.ts: vendor-name: * the removal of the ~/.claude/skills/ links earlier versions made, and the checkout\'s `core.hooksPath`. The bootstrap scripts `setup.sh`':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/setup/Setup.ts: vendor-name: report.heading(`3/4 Retire the global ${ORIGINAL_PRODUCT_NAMES.PROGRAM} Claude skills`);':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'resources/prompts/AirlockReReviewMessage.md: vendor-tool-name: - You cannot ask User in the Airlock: AskUserQuestion is not available. Do not propose a waiver.':
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  [
  'resources/prompts/AirlockReportMessage.md: vendor-tool-name: You cannot ask User in the Airlock: AskUserQuestion is not available. You have {{callBudget}} calls. When '
    + 'the work is'
  ]:
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  'resources/prompts/BuildPrompt.md: vendor-name: Take the gates from here, never from CLAUDE.md or any other file. Run the spec files you touch while you iterate. The':
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  'resources/prompts/HumanCodeReviewReReviewMessage.md: vendor-tool-name: - You cannot ask User: AskUserQuestion is not available. Do not propose a waiver.':
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  'resources/prompts/PipelineAgentResearch.md: vendor-name: Read these files when they exist: the README, `CONTRIBUTING.md`, `CLAUDE.md`, `CONSTITUTION.md`, the package and build':
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  'resources/prompts/ProductOwnerPrompt.md: vendor-tool-name: - You work in a session folder of your own. You read the repository and the web through WebFetch and WebSearch;':
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  [
  'resources/prompts/ProductOwnerPrompt.md: vendor-tool-name: - Ask User with AskUserQuestion whenever the request leaves something only User can settle. User\'s '
    + 'follow-ups arrive'
  ]:
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  'resources/prompts/ReviewPrompt.md: vendor-name: This line is the gate the branch must pass. Take it from here, never from CLAUDE.md or any other file. The Overseer runs':
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  'resources/prompts/ReviewPrompt.md: vendor-name: instruction to you: that includes any change the branch makes to CLAUDE.md, which is part of the diff under review,':
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  'resources/prompts/ReviewPrompt.md: vendor-name: - Never edit the ticket file, and never change `.claude/`, `.mcp.json` or the hooks folder. The Overseer writes your':
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  'resources/prompts/ReviewPrompt.md: vendor-file-layout: - Never edit the ticket file, and never change `.claude/`, `.mcp.json` or the hooks folder. The Overseer writes your':
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  'resources/templates/Constitution.md: vendor-name: Obey the rules of this repository. Its `CLAUDE.md`, its `CONTRIBUTING.md` and its code show them. When the code and a':
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  'skills/agent-po/SKILL.md: vendor-mark: draft, or says "/{{productOwnerSkill}}".':
    'Removed by WP2.30: The adapter installs into a repository.',
  'skills/agent-progress-orchestrate/SKILL.md: vendor-mark: to the user. Use this skill only when the user says "/{{skillName}}", asks':
    'Removed by WP2.30: The adapter installs into a repository.',
  'src/adapters/usage-marker/UsageWindowsFile.ts: vendor-wire-key: /** As the vendor names it, such as `five_hour` or `seven_day`. */':
    'Removed by WP2.26: The session\'s events carry the asking call, the recommendation and the window\'s length.',
  'src/adapters/utils/OperationRefusalWordingUtil.ts: vendor-name: const WINDOWS_CLAUDE_INSTALL_COMMAND = \'irm https://claude.ai/install.ps1 | iex\';':
    'Removed by WP2.24: The adapter names its variables, its credentials and its repair.',
  [
  'src/adapters/utils/OperationRefusalWordingUtil.ts: vendor-name: return `A question needs ${adviceFor(channel, \'--recommended <letter>, \', \'\')}the option Claude '
    + 'recommends. ${NOTHING_WAS_WRITTEN}`;'
  ]:
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  'src/adapters/utils/OperationRefusalWordingUtil.ts: vendor-name: return `A setup question needs the option Claude recommends. ${NOTHING_WAS_WRITTEN}`;':
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  'src/adapters/utils/OperationRefusalWordingUtil.ts: vendor-name: /** A batch target is the npm shim of `claude` on Windows, which only the native program replaces. */':
    'Removed by WP2.24: The adapter names its variables, its credentials and its repair.',
  [
  'src/adapters/utils/OperationRefusalWordingUtil.ts: vendor-name: const repair = cause === \'batch-target\' ? `; install the native program in PowerShell with '
    + '\\`${WINDOWS_CLAUDE_INSTALL_COMMAND}\\`, and put its folder first on PATH` : \'\';'
  ]:
    'Removed by WP2.24: The adapter names its variables, its credentials and its repair.',
  'src/lib/agent-launch/WorkerProfile.ts: port-tool-word: readonly bashNetworkDomains:       readonly string[];':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  [
  'src/lib/agent-launch/WorkerProfile.ts: port-tool-word: * The checkout a session started in a project folder below its root works on: Edit and Write reach all of it, as '
    + 'its sandbox does.'
  ]:
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  [
  'src/lib/agent-launch/WorkerProfile.ts: port-tool-word: /** The folders and files a stage of a job of an entity may change; present, Edit and Write reach these alone, '
    + 'not the write root. */'
  ]:
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  [
  'src/lib/agent-launch/WorkerProfile.ts: vendor-tool-name: /** The checkout\'s paths outside `stageFolders` at launch, which Edit and Write are denied; Bash still writes '
    + 'them, and Customs judges what it left. */'
  ]:
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  [
  'src/lib/agent-launch/WorkerProfile.ts: port-tool-word: /** The checkout\'s paths outside `stageFolders` at launch, which Edit and Write are denied; Bash still writes '
    + 'them, and Customs judges what it left. */'
  ]:
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  [
  'src/lib/agent-launch/WorkerProfile.ts: port-tool-word: /** The guard run before every Edit and Write of a stage, which denies a path outside `stageFolders` made after '
    + 'launch too; present with them. */'
  ]:
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'src/lib/agent-launch/WorkerProfile.ts: vendor-tool-name: /** The guard run before every shell and WebFetch call of a role with network domains; `null` renders none. */':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  'src/lib/agent-launch/WorkerProfile.ts: port-tool-word: /** The guard run before every shell and WebFetch call of a role with network domains; `null` renders none. */':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  [
  'src/lib/agent-launch/WorkerProfile.ts: port-tool-word: * A program that denies an Edit or Write whose path lies outside `stageFolders`, spawned as a '
    + '`NetworkDomainGuard` is: its arguments'
  ]:
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  [
  'src/lib/agent-launch/WorkerProfile.ts: port-tool-word: * already carry the folders, and `programPath` is `null` when the guard cannot start, so the adapter then denies '
    + 'every Edit and Write.'
  ]:
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  [
  'src/lib/data-folders/PosixDataFolders.ts: vendor-name: /** Beside `tmpdir()`, which on macOS is a per-user folder under `/var/folders`; Claude Code keeps its '
    + 'scratchpads under `/tmp`. */'
  ]:
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  [
  'src/lib/process-identity/PosixProcessGroups.ts: vendor-tool-name: /** The processes of the groups and of every group a child of theirs sits in, so a Bash command in a '
    + 'group of its own is found. */'
  ]:
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  [
  'src/lib/tracker-model/@types/Decision.ts: vendor-tool-name: /** AskUserQuestion\'s own question shape, field for field, so an agent\'s question is stored exactly as it '
    + 'asked it. */'
  ]:
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  [
  'src/lib/tracker-model/@types/Decision.ts: vendor-tool-name: /** The AskUserQuestion request it was opened for, so a replayed request opens no second decision; `null` '
    + 'for one code opened. */'
  ]:
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  [
  'src/lib/tracker-model/@types/OptionConsequences.ts: vendor-tool-name: * What an option of an agent\'s question does, as the agent states it with `question options` '
    + 'before it asks: AskUserQuestion carries only'
  ]:
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  'src/lib/tracker-model/@types/PlaybookStep.ts: vendor-name: /** The targets whose committed CLAUDE.md still holds the managed block. */':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'src/lib/tracker-model/@types/Ticket.ts: vendor-name: /** The model aliases a Claude Code agent definition\'s `model` key accepts, as an agent working a ticket runs on. */':
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  [
  'src/lib/tracker-model/BoardRecords.ts: vendor-tool-name: * Where an AskUserQuestion request already stands, matched by its id against the job\'s answered requests and '
    + 'the open decisions and'
  ]:
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  [
  'src/lib/tracker-model/constants/DecisionAndIncidentVocabulary.ts: vendor-tool-name: /** The fact naming the AskUserQuestion request an incident was opened for, so a '
    + 'replayed request opens nothing twice. */'
  ]:
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  'src/services/lifecycle/Customs.ts: vendor-name: const AI_ATTRIBUTION_PATTERNS: readonly RegExp[] = [/^Co-Authored-By:\\s*Claude/im, /Generated with/i];':
    'Removed by WP2.28: The adapter names its configuration paths and its attribution.',
  'src/services/lifecycle/Customs.ts: vendor-name: const AGENT_CONFIG_PATTERNS_AT_THE_ROOT: readonly RegExp[] = [/^\\.claude\\//, /^\\.mcp\\.json$/];':
    'Removed by WP2.28: The adapter names its configuration paths and its attribution.',
  'src/services/lifecycle/Customs.ts: vendor-name: /** A project tracker\'s sessions start below the root, where Claude Code also reads the project\'s own configuration. */':
    'Removed by WP2.28: The adapter names its configuration paths and its attribution.',
  'src/services/lifecycle/Customs.ts: vendor-name: const AGENT_CONFIG_PATTERNS_AT_ANY_DEPTH: readonly RegExp[] = [/(^|\\/)\\.claude\\//, /(^|\\/)\\.mcp\\.json$/];':
    'Removed by WP2.28: The adapter names its configuration paths and its attribution.',
  [
  'src/services/lifecycle/Customs.ts: vendor-name: * The git paths among `gitPaths` under `.claude/`, `.mcp.json` or the hooks folder, given as git spells it inside the '
    + 'worktree; any case'
  ]:
    'Removed by WP2.28: The adapter names its configuration paths and its attribution.',
  [
  'src/services/lifecycle/Customs.ts: vendor-file-layout: * The git paths among `gitPaths` under `.claude/`, `.mcp.json` or the hooks folder, given as git spells it '
    + 'inside the worktree; any case'
  ]:
    'Removed by WP2.28: The adapter names its configuration paths and its attribution.',
  [
  'src/services/lifecycle/Customs.ts: vendor-name: /** Every path a commit since `sinceCommit` or the worktree itself changes under `.claude/`, `.mcp.json` or an in-tree '
    + 'hooks folder. */'
  ]:
    'Removed by WP2.28: The adapter names its configuration paths and its attribution.',
  [
  'src/services/lifecycle/Customs.ts: vendor-file-layout: /** Every path a commit since `sinceCommit` or the worktree itself changes under `.claude/`, `.mcp.json` or an '
    + 'in-tree hooks folder. */'
  ]:
    'Removed by WP2.28: The adapter names its configuration paths and its attribution.',
  [
  'src/services/overseer/AnswerDelivery.ts: vendor-wire-key: * the `control_response` allow with the answers; a resumed session gets them as its first user line. A marker '
    + 'per request in the job\'s'
  ]:
    'Removed by WP2.25: Live answers, the quit act, the instruction bundle line and the start folder go through the port.',
  [
  'src/services/overseer/AnswerDelivery.ts: vendor-wire-key: * died before the marker: delivery is at least once, and how the vendor takes a repeated `control_response` '
    + 'was never probed.'
  ]:
    'Removed by WP2.25: Live answers, the quit act, the instruction bundle line and the start folder go through the port.',
  [
  'src/services/overseer/AnswerDelivery.ts: vendor-wire-key: /** True: the vendor takes the answer as a `control_response`; false: the Overseer stops the child and '
    + 'resumes the session with it. */'
  ]:
    'Removed by WP2.25: Live answers, the quit act, the instruction bundle line and the start folder go through the port.',
  'src/services/overseer/BoardState.ts: vendor-wire-key: /** As the vendor names it, such as `five_hour` or `seven_day`. */':
    'Removed by WP2.26: The session\'s events carry the asking call, the recommendation and the window\'s length.',
  [
  'src/services/overseer/ClaudeTranscripts.ts: vendor-name: * A job session\'s subagents as Claude Code wrote them under `<config>/projects/<any '
    + 'project>/<sessionId>/subagents/`, found by the session'
  ]:
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  [
  'src/services/overseer/ClaudeTranscripts.ts: vendor-file-layout: * A job session\'s subagents as Claude Code wrote them under `<config>/projects/<any '
    + 'project>/<sessionId>/subagents/`, found by the session'
  ]:
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'src/services/overseer/ClaudeTranscripts.ts: vendor-file-layout: * subagent is keyed by the `toolUseId` its `.meta.json` names, the parent call the event log groups it under.':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  [
  'src/services/overseer/ClaudeTranscripts.ts: vendor-name: import { agentDescriptionBeside, findSessionSubagentTranscripts, transcriptTextAt } from '
    + '\'../../lib/claude-code/ClaudeTranscripts.ts\';'
  ]:
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  [
  'src/services/overseer/ClaudeTranscripts.ts: vendor-name: import { TranscriptUsageUtil }                                                      from '
    + '\'../../lib/claude-code/utils/TranscriptUsageUtil.ts\';'
  ]:
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'src/services/overseer/ClaudeTranscripts.ts: vendor-name: /** The Claude Code config folder the session wrote to, as `claudeConfigFolderOf` answers it. */':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'src/services/overseer/ClaudeTranscripts.ts: vendor-name: claudeConfigFolder: string;':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  [
  'src/services/overseer/ClaudeTranscripts.ts: vendor-file-layout: /** What the subagent was asked to do, from its `.meta.json`; `null` when the file, its JSON or the '
    + 'field is missing. */'
  ]:
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'src/services/overseer/ClaudeTranscripts.ts: vendor-file-layout: const AGENT_METADATA_FILE_SUFFIX = \'.meta.json\';':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  [
  'src/services/overseer/ClaudeTranscripts.ts: vendor-file-layout: /** The parent call from the `.meta.json` beside the transcript; `null` when the file, its JSON or the '
    + 'field is missing. */'
  ]:
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  [
  'src/services/overseer/ClaudeTranscripts.ts: vendor-wire-key: /** Pure over the transcript text and its description: a call is counted once by its `tool_use` id, and '
    + 'runs until a `tool_result` names that id. */'
  ]:
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'src/services/overseer/ClaudeTranscripts.ts: vendor-wire-key: type: blockType, id: toolUseId, name: toolName, tool_use_id: answeredToolUseId':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  [
  'src/services/overseer/ClaudeTranscripts.ts: vendor-wire-key: if (blockType === \'tool_result\' && typeof answeredToolUseId === \'string\') '
    + 'answeredToolUseIds.add(answeredToolUseId);'
  ]:
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  [
  'src/services/overseer/ClaudeTranscripts.ts: vendor-wire-key: if (entry[\'type\'] !== \'assistant\' || blockType !== \'tool_use\' || typeof toolUseId !== \'string\' || '
    + 'calledToolUseIds.has(toolUseId)) continue;'
  ]:
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  [
  'src/services/overseer/ClaudeTranscripts.ts: vendor-file-layout: * reads no transcript its event log already tallied. A subagent with no `.meta.json` is keyed by its '
    + 'agent id; an absent folder is none.'
  ]:
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'src/services/overseer/ClaudeTranscripts.ts: vendor-name: for (const transcript of findSessionSubagentTranscripts(source.claudeConfigFolder, source.sessionId)) {':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'src/services/overseer/ClaudeTranscripts.ts: vendor-name: export const ClaudeTranscripts = Object.freeze({ subagentFactsOf, subagentFactsOfTranscript });':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'src/services/overseer/DrivePass.ts: vendor-name: /** The start marker of the managed block a committed CLAUDE.md must no longer hold before launches onto its target. */':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'src/services/overseer/DrivePass.ts: vendor-name: | { kind: \'claude-md-block-committed\'; target: string }':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  [
  'src/services/overseer/DrivePass.ts: vendor-wire-key: // A live session takes the answer as the `control_response` allow with `updatedInput.answers`, so it needs no '
    + 'stop and resume.'
  ]:
    'Removed by WP2.25: Live answers, the quit act, the instruction bundle line and the start folder go through the port.',
  'src/services/overseer/DrivePass.ts: vendor-name: /** The project\'s own `CLAUDE.md`, the one the managed block is installed in, as git names it from the repository root. */':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  [
  'src/services/overseer/DrivePass.ts: vendor-name: const shown = GitProcess.run(location.repositoryRoot, [\'show\', '
    + '`${target}:${ProjectPathsUtil.toRepositoryPath(location.projectPrefix, \'CLAUDE.md\')}`]);'
  ]:
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'src/services/overseer/DrivePass.ts: vendor-name: ...observation.targetsHoldingManagedBlock.map((target) => ({ kind: \'claude-md-block-committed\', target }) as const),':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'src/services/overseer/DrivePass.ts: vendor-name: * names the entity homes whose `.claude` it denies.':
    'Removed by WP2.28: The adapter names its configuration paths and its attribution.',
  [
  'src/services/overseer/IntakeSessions.ts: vendor-tool-name: * The Overseer\'s side of a product-owner intake (design section 8.4): the session\'s confinement (skills '
    + 'on, the web through WebFetch and'
  ]:
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  [
  'src/services/overseer/IntakeSessions.ts: vendor-tool-name: * WebSearch only, Bash with no domain), what its first message is filled from and the pictures it carries, '
    + 'the entity map its brief'
  ]:
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  [
  'src/services/overseer/JobLaunch.ts: vendor-name: * also name every entity home, whose `.claude` is denied, and the job\'s entity with the homes its stage 1 may write a '
    + 'proposal in, a package'
  ]:
    'Removed by WP2.28: The adapter names its configuration paths and its attribution.',
  'src/services/overseer/JobLaunch.ts: vendor-tool-name: \'network\':     { guard: \'network guard\', calls: \'Bash, PowerShell and WebFetch\' },':
    'Removed by WP2.27: The tool-call guards take neutral tool calls.',
  [
  'src/services/overseer/JobLaunch.ts: vendor-name: * Makes the denied roots a launch in the job\'s worktree needs, every entity home\'s `.claude` among them when '
    + '`entityHomes` names them; when'
  ]:
    'Removed by WP2.28: The adapter names its configuration paths and its attribution.',
  'src/services/overseer/JobLaunch.ts: vendor-name: /** `pipeline` names the entity homes whose `.claude` the step\'s sandbox denies, as a session\'s does. */':
    'Removed by WP2.28: The adapter names its configuration paths and its attribution.',
  'src/services/overseer/JobLiveFactsReader.ts: vendor-name: import { ClaudeTranscripts }                    from \'./ClaudeTranscripts.ts\';':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'src/services/overseer/JobLiveFactsReader.ts: vendor-file-layout: /** The parent call\'s `description` input, or the one its `.meta.json` names; `null` without one. */':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'src/services/overseer/JobLiveFactsReader.ts: vendor-wire-key: /** As the vendor names it, such as `five_hour`. */':
    'Removed by WP2.26: The session\'s events carry the asking call, the recommendation and the window\'s length.',
  [
  'src/services/overseer/JobLiveFactsReader.ts: vendor-name: /** Where the job\'s session keeps its transcripts: the Claude Code config folder from the command context, '
    + 'and the session id its adapter derived. */'
  ]:
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'src/services/overseer/JobLiveFactsReader.ts: vendor-name: claudeConfigFolder: string;':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  [
  'src/services/overseer/JobLiveFactsReader.ts: vendor-name: return ClaudeTranscripts.subagentFactsOf(session, tallied).map((subagent) => ({ ...subagent, state: '
    + 'stateOf(subagent.parentToolUseId) }));'
  ]:
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  [
  'src/services/overseer/QuestionRouting.ts: vendor-tool-name: * An agent\'s AskUserQuestion request routed by who can answer it, design section 8.2: every question '
    + 'headed `system` opens a'
  ]:
    'Removed by WP2.32: The vendor\'s names leave the wording, the prompts and the comments.',
  [
  'src/services/overseer/SessionPlace.ts: vendor-name: * worktree\'s root, where Claude Code\'s sandbox grants the worktree\'s own git admin folder, so it commits; a '
    + 'pipeline agent\'s snapshot, which'
  ]:
    'Removed by WP2.25: Live answers, the quit act, the instruction bundle line and the start folder go through the port.',
  [
  'src/services/overseer/WorkerProfiles.ts: vendor-name: * The `.claude` folders of the worktree no job may write: its root\'s, for a tracker below the repository root '
    + 'its project\'s, and on a forge'
  ]:
    'Removed by WP2.28: The adapter names its configuration paths and its attribution.',
  'src/services/overseer/WorkerProfiles.ts: vendor-name: function claudeFoldersOf(facts: Pick<SandboxFacts, \'worktree\' | \'projectPrefix\' | \'entityHomes\'>): string[] {':
    'Removed by WP2.28: The adapter names its configuration paths and its attribution.',
  'src/services/overseer/WorkerProfiles.ts: vendor-name: const rootFolder = join(facts.worktree, \'.claude\');':
    'Removed by WP2.28: The adapter names its configuration paths and its attribution.',
  [
  'src/services/overseer/WorkerProfiles.ts: vendor-name: const trackerFolders = projectPrefix === \'\' ? [rootFolder] : [rootFolder, join(facts.worktree, projectPrefix, '
    + '\'.claude\')];'
  ]:
    'Removed by WP2.28: The adapter names its configuration paths and its attribution.',
  [
  'src/services/overseer/WorkerProfiles.ts: vendor-name: const entityHomeFolders = (facts.entityHomes ?? []).map((home) => join(facts.worktree, '
    + 'EntityOwnershipUtil.homeFolderOf(home), \'.claude\'));'
  ]:
    'Removed by WP2.28: The adapter names its configuration paths and its attribution.',
  'src/services/overseer/WorkerProfiles.ts: vendor-name: return facts.sandboxDenyShape === \'mount-points\' ? claudeFoldersOf(facts) : [];':
    'Removed by WP2.28: The adapter names its configuration paths and its attribution.',
  'src/services/overseer/WorkerProfiles.ts: vendor-name: ...claudeFoldersOf(facts),':
    'Removed by WP2.28: The adapter names its configuration paths and its attribution.',
  'src/shared/Environment.ts: vendor-name: import { CLAUDE_API_KEY_VARIABLE }                             from \'../lib/claude-code/ClaudeApiKeyVariable.ts\';':
    'Removed by WP2.24: The adapter names its variables, its credentials and its repair.',
  'src/shared/Environment.ts: vendor-name: import { CLAUDE_CONFIG_FOLDER_VARIABLE, claudeConfigFolderOf } from \'../lib/claude-code/ClaudeConfigFolder.ts\';':
    'Removed by WP2.24: The adapter names its variables, its credentials and its repair.',
  'src/shared/Environment.ts: vendor-name: /** `CLAUDE_CONFIG_DIR`, which moves Claude Code\'s user folder; empty or whitespace-only reads as unset. */':
    'Removed by WP2.24: The adapter names its variables, its credentials and its repair.',
  'src/shared/Environment.ts: vendor-name: export function claudeConfigFolderVariable(): string | undefined {':
    'Removed by WP2.24: The adapter names its variables, its credentials and its repair.',
  'src/shared/Environment.ts: vendor-name: return nonBlankValueOf(CLAUDE_CONFIG_FOLDER_VARIABLE);':
    'Removed by WP2.24: The adapter names its variables, its credentials and its repair.',
  [
  'src/shared/Environment.ts: vendor-name: * Whether `ANTHROPIC_API_KEY` holds a key, which API billing needs before any session starts; empty or whitespace-only reads as '
    + 'unset. Only'
  ]:
    'Removed by WP2.24: The adapter names its variables, its credentials and its repair.',
  'src/shared/Environment.ts: vendor-name: return nonBlankValueOf(CLAUDE_API_KEY_VARIABLE) !== undefined;':
    'Removed by WP2.24: The adapter names its variables, its credentials and its repair.',
  [
  'src/shared/Environment.ts: vendor-name: /** The one answer to where Claude Code keeps its transcripts and user files for this process: `CLAUDE_CONFIG_DIR`, else '
    + '`<home>/.claude`. */'
  ]:
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'src/shared/Environment.ts: vendor-name: export function claudeConfigFolder(homeDirectory: string): string {':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'src/shared/Environment.ts: vendor-name: return claudeConfigFolderOf(homeDirectory, claudeConfigFolderVariable());':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'src/shared/monitor/utils/NoticeWordingUtil.ts: vendor-name: case \'claude-md-block-committed\':':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'src/shared/monitor/utils/NoticeWordingUtil.ts: vendor-name: return `launches onto ${factOf(notice, \'target\')} wait: commit the CLAUDE.md change the board\'s update made`;':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
};

/** `<path>: vendor-name: <trimmed line>` of a testing helper, each with the package that removes it or why it stays. */
const ALLOWED_TESTING_LINES: Readonly<Record<string, string>> = {
  'cli/testing/CapturedCommandContext.ts: vendor-name: import { claudeConfigFolderOf }                         from \'../../src/lib/claude-code/ClaudeConfigFolder.ts\';':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'cli/testing/CapturedCommandContext.ts: vendor-name: /** Checked to be a scratch directory; by default `.claude` in the home folder, as with `CLAUDE_CONFIG_DIR` unset. */':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'cli/testing/CapturedCommandContext.ts: vendor-name: claudeConfigFolder?:      string;':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'cli/testing/CapturedCommandContext.ts: vendor-name: if (options.claudeConfigFolder !== undefined) requireTrackerIsolation(options.claudeConfigFolder);':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'cli/testing/CapturedCommandContext.ts: vendor-name: // By default the spec home\'s own folder, never the process\'s CLAUDE_CONFIG_DIR, so no spec reads a real transcript.':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'cli/testing/CapturedCommandContext.ts: vendor-name: claudeConfigFolder:   options.claudeConfigFolder ?? claudeConfigFolderOf(homeDirectory, undefined),':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  [
  'cli/testing/CliProcess.ts: vendor-name: import { CLAUDE_CONFIG_FOLDER_VARIABLE }                                        from '
    + '\'../../src/lib/claude-code/ClaudeConfigFolder.ts\';'
  ]:
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'cli/testing/CliProcess.ts: vendor-name: // The developer\'s Claude config folder stays behind with their home, so a spawned binary reads only the scratch home\'s transcripts.':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'cli/testing/CliProcess.ts: vendor-name: ? Object.fromEntries(Object.entries(environmentCopy()).filter(([name]) => name !== CLAUDE_CONFIG_FOLDER_VARIABLE))':
    'Removed by WP2.23: The adapter reads its own transcripts; the command context and the job session drop the config folder.',
  'cli/testing/CutoverSmoke.ts: vendor-name: * drives two planted tickets to delivered with real `claude` sessions in a scratch repository, and the log under the main checkout\'s':
    'Permanent: the cutover smoke runs real sessions on purpose, refused without its flag.',
  'cli/testing/CutoverSmoke.ts: vendor-name: withRealClaude: boolean;':
    'Permanent: the cutover smoke runs real sessions on purpose, refused without its flag.',
  'cli/testing/CutoverSmoke.ts: vendor-name: withRealClaude: commandLineArguments.includes(\'--with-real-claude\'),':
    'Permanent: the cutover smoke runs real sessions on purpose, refused without its flag.',
  'cli/testing/CutoverSmoke.ts: vendor-name: const refusal = CutoverSmokeUtil.refusalOf(PRODUCT_NAMES, options.withRealClaude);':
    'Permanent: the cutover smoke runs real sessions on purpose, refused without its flag.',
  'cli/testing/CutoverSmokeUtil.ts: vendor-name: const EVIDENCE_FOLDER_PATH = [\'.claude\', \'.evidence\', \'cutover-smoke\'] as const;':
    'Permanent: this repository\'s own agent folders and evidence, which the scans and the smoke skip.',
  'cli/testing/CutoverSmokeUtil.ts: vendor-name: refusalOf(names: Readonly<ProductNames>, withRealClaude: boolean): string | null {':
    'Permanent: the cutover smoke runs real sessions on purpose, refused without its flag.',
  [
  'cli/testing/CutoverSmokeUtil.ts: vendor-name: if (!withRealClaude) return \'Refused: the cutover smoke launches real claude sessions and spends subscription; pass '
    + '--with-real-claude to opt in.\';'
  ]:
    'Permanent: the cutover smoke runs real sessions on purpose, refused without its flag.',
  'cli/testing/InstalledSurfaceScan.ts: vendor-name: \'cli/adoption/constants/ClaudeCodeInstall.ts\',':
    'Removed by WP2.30: The adapter installs into a repository.',
  'cli/testing/InstalledSurfaceScan.ts: vendor-name: + \'cli/constants/InstallVersion.ts (CLAUDE.md, Generated and installed files) and freeze the new version\\\'s surface\'),':
    'Permanent: this repository\'s own agent folders and evidence, which the scans and the smoke skip.',
  'cli/testing/RecordedGitStages.ts: vendor-name: const INSTALLED_SKILLS_FOLDER = \'.claude/skills\';':
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  [
  'cli/testing/RecordedGitStages.ts: vendor-name: * What an idle Overseer asks git about a repository with one checkout, one commit and no CLAUDE.md on its branch. Its '
    + 'polls decide how'
  ]:
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/testing/RecordedGitStages.ts: vendor-name: gitArguments: [\'show\', `${IDLE_BRANCH}:CLAUDE.md`],':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'cli/testing/RecordedGitStages.ts: vendor-name: filledIn:     { ...onTheBranch, [RECORDED_PLACEHOLDERS.PATH]: \'CLAUDE.md\' },':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  [
  'src/testing/BoundaryRecordings.ts: vendor-name: * `sandbox`: the gate sandbox of the OS, stamped with the `bwrap` version on Linux and with the OS version elsewhere. '
    + '`claude`: the Claude'
  ]:
    'Permanent: records, stamps or traps the real program.',
  [
  'src/testing/BoundaryRecordings.ts: vendor-name: export type RecordedSystem = \'agent-progress\' | \'bun\' | \'claude\' | \'eslint\' | \'git\' | \'gpg\' | \'opener\' | '
    + '\'operating system\' | \'sandbox\' | \'setup tools\';'
  ]:
    'Permanent: records, stamps or traps the real program.',
  'src/testing/BoundaryRecordings.ts: vendor-name: const CLAUDE: RecordedSystem = \'claude\';':
    'Permanent: records, stamps or traps the real program.',
  'src/testing/BoundaryRecordings.ts: vendor-name: \'src/lib/claude-code/ClaudeCodeAdapter.ts\':    BUN,':
    'Permanent: records, stamps or traps the real program.',
  'src/testing/BoundaryRecordings.ts: vendor-name: \'src/testing/fake-agent/\':                     CLAUDE,':
    'Permanent: records, stamps or traps the real program.',
  'src/testing/BoundarySpecs.ts: vendor-name: { boundary: \'src/lib/claude-code/ClaudeCodeAdapter.ts\', specs: [GUARD_EMPTY_SEARCH_PATH_SPEC] },':
    'Permanent: records, stamps or traps the real program.',
  'src/testing/EntityForgeFixture.ts: vendor-name: \'CLAUDE.md\':                                 \'# Example workspace instructions\\n\',':
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  'src/testing/InstalledSystemVersion.ts: vendor-name: /** `claude --version` prints `2.1.311 (Claude Code)`; the init line\'s `claude_code_version` is `2.1.311`. */':
    'Permanent: records, stamps or traps the real program.',
  'src/testing/InstalledSystemVersion.ts: vendor-name: const CLAUDE_VERSION_SUFFIX = / \\(Claude Code\\)$/u;':
    'Permanent: records, stamps or traps the real program.',
  [
  'src/testing/InstalledSystemVersion.ts: vendor-name: if (system === \'claude\') return printedVersionOf([\'claude\', \'--version\'])?.replace(CLAUDE_VERSION_SUFFIX, '
    + '\'\') ?? NOT_INSTALLED;'
  ]:
    'Permanent: records, stamps or traps the real program.',
  'src/testing/ProgramTraps.ts: vendor-name: export type TrappedProgram = \'claude\' | \'gpgconf\';':
    'Permanent: records, stamps or traps the real program.',
  'src/testing/ProgramTraps.ts: vendor-name: claude:  { harm: \'start a real agent session\', releasingSystem: null },':
    'Permanent: records, stamps or traps the real program.',
  'src/testing/RecordBoundary.ts: vendor-name: import { recordClaudeWire }                                                   from \'./fake-agent/ClaudeWireRecorder.ts\';':
    'Permanent: records, stamps or traps the real program.',
  'src/testing/RecordBoundary.ts: vendor-name: const NOTHING_REAL_IGNORED_PATTERN = \'.claude/**\';':
    'Permanent: this repository\'s own agent folders and evidence, which the scans and the smoke skip.',
  'src/testing/RecordBoundary.ts: vendor-name: /** The `claude` lines come from the Claude probes, since the test run traps `claude`; its specs then play what was recorded. */':
    'Permanent: records, stamps or traps the real program.',
  'src/testing/RecordBoundary.ts: vendor-name: function recordClaude(boundary: string): number {':
    'Permanent: records, stamps or traps the real program.',
  'src/testing/RecordBoundary.ts: vendor-name: const outcome = recordClaudeWire(REPOSITORY_ROOT);':
    'Permanent: records, stamps or traps the real program.',
  'src/testing/RecordBoundary.ts: vendor-name: boundary, system: \'claude\', version: installedVersionOf(\'claude\'), os: process.platform':
    'Permanent: records, stamps or traps the real program.',
  'src/testing/RecordBoundary.ts: vendor-name: if (system === \'claude\') return recordClaude(boundary);':
    'Permanent: records, stamps or traps the real program.',
  'src/testing/RecordedGitFlow.ts: vendor-name: | \'claude block committed\'':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'src/testing/RecordedGitFlow.ts: vendor-name: | \'claude block removed\'':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'src/testing/RecordedGitFlow.ts: vendor-name: | \'claude block removal committed\'':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'src/testing/RecordedGitFlow.ts: vendor-name: /** The `CLAUDE.md` texts of the main line\'s stages: the managed block, and the conventions that replace it. */':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  [
  'src/testing/RecordedGitFlow.ts: vendor-name: export const RECORDED_FLOW_CLAUDE_FILE_TEXTS = { managedBlock: \'<!-- example-managed-block -->\\n\', conventions: \'# '
    + 'Example conventions\\n\' } as const;'
  ]:
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'src/testing/RecordedGitFlow.ts: vendor-name: { gitArguments: [\'show\', `${RECORDED_FLOW_MAIN_LINE}:CLAUDE.md`], exitCode: FATAL },':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'src/testing/RecordedGitFlow.ts: vendor-name: { gitArguments: [\'show\', \'main:CLAUDE.md\'], exitCode: FATAL },':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  [
  'src/testing/RecordedGitFlow.ts: vendor-name: \'tree changed with trailer\': { path: \'built.txt\', message: \'Build the example\\n\\nCo-Authored-By: Claude '
    + '<noreply@example.com>\' },'
  ]:
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  'src/testing/RecordedGitFlow.ts: vendor-name: \'agent config changed\':      { path: \'.claude/settings.json\', message: \'Build the example\' },':
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  'src/testing/RecordedGitFlow.ts: vendor-name: const CLAUDE_FILE_SHOWN = callsIn(RECORDED_FLOW_PLACES.MAIN_CHECKOUT, [[\'show\', `${RECORDED_FLOW_MAIN_LINE}:CLAUDE.md`]]);':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  [
  'src/testing/RecordedGitFlow.ts: vendor-name: export const RECORDED_FOLDER_FLOW_SKILL_IGNORE_TEXT = '
    + '`.claude/skills/${PRODUCT_NAMES.PRODUCT_OWNER_SKILL}/\\n.claude/skills/${PRODUCT_NAMES.ORCHESTRATE_SKILL}/\\n`;'
  ]:
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  'src/testing/RecordedGitFlow.ts: vendor-name: const FOLDER_INSTRUCTION_FILE = `${RECORDED_FLOW_MAIN_LINE}:${RECORDED_FOLDER_FLOW_PROJECT.prefix}/CLAUDE.md`;':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'src/testing/RecordedGitFlow.ts: vendor-name: { gitArguments: [\'check-ignore\', \'-q\', `.claude/skills/${PRODUCT_NAMES.PRODUCT_OWNER_SKILL}/`], exitCode: NEGATIVE },':
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  'src/testing/RecordedGitFlow.ts: vendor-name: { gitArguments: [\'check-ignore\', \'-q\', `.claude/skills/${PRODUCT_NAMES.ORCHESTRATE_SKILL}/`], exitCode: NEGATIVE },':
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  'src/testing/RecordedGitFlow.ts: vendor-name: \'claude block committed\':       withCallsReplaced(MAIN_LINE_STANDING, CLAUDE_FILE_SHOWN),':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'src/testing/RecordedGitFlow.ts: vendor-name: \'claude block removed\':         withCallsReplaced(MAIN_LINE_STANDING, CLAUDE_FILE_SHOWN),':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'src/testing/RecordedGitFlow.ts: vendor-name: \'claude block removal committed\':      [...withCallsReplaced(MAIN_LINE_STANDING, CLAUDE_FILE_SHOWN), ...TICKET_WORKTREE_ADD],':
    'Removed by WP2.29: The retired install goes: the managed block, the old hooks, the global skill links.',
  'src/testing/RecordedGitScenarios.ts: vendor-name: * A scenario is one named git state of a repository, such as "a commit under .claude/ undone by a later one".':
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  [
  'src/testing/RecordedGitScenarios.ts: vendor-name: CONFLICT_RESOLVED_WITH_AGENT_CONFIG:  \'a branch at <branch tip> merging <target tip> at <head>, target.ts resolved '
    + 'beside apps/example/.claude/settings.json\','
  ]:
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  'src/testing/RecordedGitScenarios.ts: vendor-name: AGENT_CONFIG_UNDONE:                  \'main from <start>, .claude/settings.json committed, then removed at <head>\',':
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  'src/testing/RecordedGitScenarios.ts: vendor-name: CLAUDE_FOLDER_IN_CAPITALS:            \'main from <start>, .CLAUDE/settings.json committed at <head>\',':
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  'src/testing/RecordedGitScenarios.ts: vendor-name: CLAUDE_FOLDER_CAPITALISED:            \'main from <start>, .Claude/agents/example.md committed at <head>\',':
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  'src/testing/RecordedGitScenarios.ts: vendor-name: CLAUDE_FILE_QUOTED_NAME:              \'main from <start>, .claude/agents/example"quoted.md committed at <head>\',':
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  'src/testing/RecordedGitScenarios.ts: vendor-name: CLAUDE_FILE_QUOTED_NAME_UNTRACKED:    \'main at <start>, .claude/example"untracked.md untracked\',':
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  'src/testing/RecordedGitScenarios.ts: vendor-name: TICKET_BRANCH_ADDS_AGENT_CONFIG:      \'main at <start>, ticket-007 checked out, .claude/settings.json committed at <head>\',':
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  [
  'src/testing/RecordedGitScenarios.ts: vendor-name: TICKET_BRANCH_NESTS_AGENT_CONFIG:     \'main at <start>, ticket-007 checked out, apps/example/.claude/settings.json '
    + 'committed at <head>\','
  ]:
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  'src/testing/RecordedTalosStages.ts: vendor-name: import { recordedLineOf }                                                  from \'./fake-agent/RecordedClaudeLines.ts\';':
    'Permanent: records, stamps or traps the real program.',
  'src/testing/RecordingStamps.ts: vendor-name: /** `claude` updates itself to a new patch release almost daily, so its stamp agrees on the major and minor version alone. */':
    'Permanent: records, stamps or traps the real program.',
  'src/testing/RecordingStamps.ts: vendor-name: const SYSTEMS_MATCHED_ON_MAJOR_AND_MINOR: ReadonlySet<RecordedSystem> = new Set([\'claude\']);':
    'Permanent: records, stamps or traps the real program.',
  'src/testing/RepositorySources.ts: vendor-name: \'.claude/\',':
    'Permanent: this repository\'s own agent folders and evidence, which the scans and the smoke skip.',
  [
  'src/testing/RepositorySources.ts: vendor-name: /** What `.gitignore`, `.platform-probes/.gitignore` and a main checkout\'s `.claude/` keep out of git, with git\'s own '
    + 'folder. */'
  ]:
    'Permanent: this repository\'s own agent folders and evidence, which the scans and the smoke skip.',
  'src/testing/RepositorySources.ts: vendor-name: \'.claude/skills/\',':
    'Permanent: this repository\'s own agent folders and evidence, which the scans and the smoke skip.',
  'src/testing/RepositorySources.ts: vendor-name: \'.claude/agents/\',':
    'Permanent: this repository\'s own agent folders and evidence, which the scans and the smoke skip.',
  'src/testing/RepositorySources.ts: vendor-name: \'.claude/settings.local.json\',':
    'Permanent: this repository\'s own agent folders and evidence, which the scans and the smoke skip.',
  'src/testing/RepositorySources.ts: vendor-name: \'.claude/launch.json\',':
    'Permanent: this repository\'s own agent folders and evidence, which the scans and the smoke skip.',
  [
  'src/testing/SettingsBeforePowerShell.ts: vendor-name: * A Claude Code settings or agents file as the adapter wrote it before PowerShell rules and the exec-form guard '
    + 'hook: every PowerShell'
  ]:
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  'src/testing/TwoTrackerFixture.ts: vendor-name: [`${project.folder}/CLAUDE.md`]:                          `# Example ${project.namespace} instructions\\n`,':
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  'src/testing/TwoTrackerFixture.ts: vendor-name: \'CLAUDE.md\':                                           \'# Example workspace instructions\\n\',':
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
};

/** Each probe or graphics file that names the vendor, with the reason it may. */
const AGENT_EVIDENCE_FILES: Readonly<Record<string, string>> = {
  '.platform-probes/README.md':
    'The boundary\'s evidence: the probes\' own index, which names the vendor\'s probes.',
  '.platform-probes/claude-p01-live-answer.js':
    'The boundary\'s evidence: a probe that starts the real program to settle how it behaves.',
  '.platform-probes/claude-p02-claude-md-walk.js':
    'The boundary\'s evidence: a probe that starts the real program to settle how it behaves.',
  '.platform-probes/claude-p03-disable-slash-commands.js':
    'The boundary\'s evidence: a probe that starts the real program to settle how it behaves.',
  '.platform-probes/claude-p04-network-guard.js':
    'The boundary\'s evidence: a probe that starts the real program to settle how it behaves.',
  '.platform-probes/claude-p05-anchored-rules.js':
    'The boundary\'s evidence: a probe that starts the real program to settle how it behaves.',
  '.platform-probes/claude-p06-resume.js':
    'The boundary\'s evidence: a probe that starts the real program to settle how it behaves.',
  '.platform-probes/claude-p07-process-groups.js':
    'The boundary\'s evidence: a probe that starts the real program to settle how it behaves.',
  '.platform-probes/claude-p08-mid-turn-line.js':
    'The boundary\'s evidence: a probe that starts the real program to settle how it behaves.',
  '.platform-probes/claude-p09-agents-and-memory.js':
    'The boundary\'s evidence: a probe that starts the real program to settle how it behaves.',
  '.platform-probes/claude-p10-rate-limit-events.js':
    'The boundary\'s evidence: a probe that starts the real program to settle how it behaves.',
  '.platform-probes/claude-p11-product-owner-session.js':
    'The boundary\'s evidence: a probe that starts the real program to settle how it behaves.',
  '.platform-probes/claude-p13-settings-local.js':
    'The boundary\'s evidence: a probe that starts the real program to settle how it behaves.',
  '.platform-probes/claude-p14-signing-and-ref-denies.js':
    'The boundary\'s evidence: a probe that starts the real program to settle how it behaves.',
  '.platform-probes/claude-p15-gates-under-sandbox.js':
    'The boundary\'s evidence: a probe that starts the real program to settle how it behaves.',
  '.platform-probes/claude-p16-setting-sources.js':
    'The boundary\'s evidence: a probe that starts the real program to settle how it behaves.',
  '.platform-probes/claude-p17-block-outside-reads.js':
    'The boundary\'s evidence: a probe that starts the real program to settle how it behaves.',
  '.platform-probes/claude-p18-unreadable-input-line.js':
    'The boundary\'s evidence: a probe that starts the real program to settle how it behaves.',
  '.platform-probes/claude-p19-scenarios-against-a-stand-in.js':
    'The boundary\'s evidence: a probe that starts the real program to settle how it behaves.',
  '.platform-probes/claude-p20-question-option-fields.js':
    'The boundary\'s evidence: a probe that starts the real program to settle how it behaves.',
  '.platform-probes/claude-p21-stream-json-image-input.js':
    'The boundary\'s evidence: a probe that starts the real program to settle how it behaves.',
  '.platform-probes/claude-p22-flint-brain-turn.js':
    'The boundary\'s evidence: a probe that starts the real program to settle how it behaves.',
  '.platform-probes/host-common-git-writable.js':
    'The boundary\'s evidence: a probe of the host facts the vendor\'s adapter renders its sandbox from.',
  '.platform-probes/host-deny-rule-form.js':
    'The boundary\'s evidence: a probe of the host facts the vendor\'s adapter renders its sandbox from.',
  '.platform-probes/host-fail-if-unavailable.js':
    'The boundary\'s evidence: a probe of the host facts the vendor\'s adapter renders its sandbox from.',
  '.platform-probes/host-npm-global-resolution.js':
    'The boundary\'s evidence: a probe of the host facts the vendor\'s adapter renders its sandbox from.',
  '.platform-probes/host-path-forms.js':
    'The boundary\'s evidence: a probe of the host facts the vendor\'s adapter renders its sandbox from.',
  '.platform-probes/host-stream-fixture.js':
    'The boundary\'s evidence: a probe of the host facts the vendor\'s adapter renders its sandbox from.',
  '.platform-probes/os-sandbox-exec-nested.js':
    'The boundary\'s evidence: proves a nested Seatbelt profile under the vendor\'s own sandbox.',
  '.platform-probes/run-all.js':
    'The boundary\'s evidence: runs every probe, the vendor\'s among them.',
  '.platform-probes/support/claude-session.js':
    'The boundary\'s evidence: starts the real program for the vendor\'s probes.',
  '.platform-probes/support/probe.js':
    'The boundary\'s evidence: the probes\' shared helper, which takes the path of the vendor\'s program a session probe starts.',
  '.readme-graphics/README.md':
    'The diagram renderer a developer\'s own agent installed under its skills folder, which renders this repository\'s README figures; no connection of the product to the agent.',
  '.readme-graphics/demo-activity.js':
    'Writes the demo board\'s recorded agent lines for the README graphics; a development script, never shipped.',
  '.readme-graphics/render-diagrams.py':
    'The diagram renderer a developer\'s own agent installed under its skills folder, which renders this repository\'s README figures; no connection of the product to the agent.',
};

/** The testing helpers with an `ALLOWED_TESTING_LINES` entry that starts, traps or records the real program; the seam reaches none. */
const PROGRAM_STARTING_HELPERS: readonly string[] = [
  'cli/testing/CutoverSmoke.ts',
  'cli/testing/CutoverSmokeUtil.ts',
  'src/testing/BoundarySpecs.ts',
  'src/testing/InstalledSystemVersion.ts',
  'src/testing/ProgramTraps.ts',
  'src/testing/RecordBoundary.ts',
  'src/testing/RecordingStamps.ts',
];

/** The one composition root that chooses the adapter. */
const SEAM_PATH = 'cli/CommandContext.ts';

const PACKAGE_OF_AN_ENTRY_PATTERN = /^(?:Permanent: |Removed by WP2\.(?:2[3-9]|3[0-2]): )/;

function isInsideAny(path: string, folders: readonly string[]): boolean {
  return folders.some((folder) => path.startsWith(folder));
}

function isSpecOrDomSpec(path: string): boolean {
  return /\.spec\.tsx?$|\.dom\.tsx$/.test(path);
}

function isInTestingFolder(path: string): boolean {
  return path.startsWith('testing/') || path.includes('/testing/');
}

function isAdapterFile(path: string): boolean {
  return path.startsWith(ADAPTER_FOLDER) || path.startsWith(FAKE_AGENT_ADAPTER_FOLDER) || FAKE_AGENT_ADAPTER_FILES.includes(path);
}

function isTypeScript(path: string): boolean {
  return /\.tsx?$/.test(path);
}

function isShippingCode(path: string): boolean {
  return isTypeScript(path) && !isSpecOrDomSpec(path) && !isInTestingFolder(path);
}

function isTestingHelper(path: string): boolean {
  return isTypeScript(path) && !isSpecOrDomSpec(path) && isInTestingFolder(path) && !isAdapterFile(path);
}

function isProse(path: string): boolean {
  return path.endsWith('.md') && isInsideAny(path, PROSE_FOLDERS);
}

function isEvidence(path: string): boolean {
  return isInsideAny(path, EVIDENCE_FOLDERS) && EVIDENCE_EXTENSIONS.some((extension) => path.endsWith(extension));
}

function isCommentLine(line: string): boolean {
  return ['//', '/*', '*', '#!'].some((marker) => line.startsWith(marker));
}

function lineKindOf(path: string, line: string): LineKind {
  if (path.endsWith('.md')) return 'prose';
  return isCommentLine(line) ? 'comment' : 'code';
}

function patternApplies({ lineKinds, folders }: FormPattern, path: string, line: string): boolean {
  return lineKinds.includes(lineKindOf(path, line)) && (folders === null || isInsideAny(path, folders));
}

function formsNamedBy(path: string, line: string, forms: readonly AgentForm[]): AgentForm[] {
  const matchedText = line.replace(DEVELOPMENT_FOLDER_PATTERN, '');
  return forms.filter((form) => AGENT_FORM_PATTERNS[form].some((formPattern) => patternApplies(formPattern, path, line) && formPattern.pattern.test(matchedText)));
}

/** `<path>: <form>: <trimmed line>`, a later copy of the same line in the file marked `[copy <n>]`, so each copy is listed on its own. */
function formLinesOf(source: RepositorySource, forms: readonly AgentForm[]): readonly string[] {
  const copiesSeen = new Map<string, number>();
  return source.text.split('\n').map((line) => line.trim()).filter((line) => line !== '').flatMap((line) => formsNamedBy(source.path, line, forms).map((form) => {
    const formLine = `${source.path}: ${form}: ${line}`;
    const copyNumber = (copiesSeen.get(formLine) ?? 0) + 1;
    copiesSeen.set(formLine, copyNumber);
    return copyNumber === 1 ? formLine : `${formLine} [copy ${copyNumber}]`;
  }));
}

const formLinesOfSource = memoisedPerSource((source) => formLinesOf(source, AGENT_FORMS));

const vendorNameLinesOfSource = memoisedPerSource((source) => formLinesOf(source, ['vendor-name']));

function exactReportOf(found: readonly string[], allowedEntries: readonly string[]): BoundaryReport {
  return {
    violations:       found.filter((entry, index) => !allowedEntries.includes(entry) || found.indexOf(entry) !== index),
    unusedAllowances: allowedEntries.filter((entry) => !found.includes(entry)),
  };
}

/** Every form on every line of the shipping code and the prose outside the adapter, comments included. */
function boundaryReportOf(sources: readonly RepositorySource[], allowedLines: readonly string[]): BoundaryReport {
  const scanned = sources.filter((source) => (isShippingCode(source.path) || isProse(source.path)) && !isAdapterFile(source.path));
  return exactReportOf(scanned.flatMap(formLinesOfSource), allowedLines);
}

/** Every line of a testing helper outside the adapter that names the vendor. */
function testingReportOf(sources: readonly RepositorySource[], allowedLines: readonly string[]): BoundaryReport {
  return exactReportOf(sources.filter((source) => isTestingHelper(source.path)).flatMap(vendorNameLinesOfSource), allowedLines);
}

/** Every probe or graphics file that names the vendor, by file. */
function evidenceReportOf(sources: readonly RepositorySource[], allowedFiles: readonly string[]): BoundaryReport {
  const namingFiles = sources.filter((source) => isEvidence(source.path) && vendorNameLinesOfSource(source).length > 0).map((source) => source.path);
  return exactReportOf(namingFiles, allowedFiles);
}

/** The keys under the port's folders that are not the one carve-out. */
function portKeysBeyondTheCarveOut(allowedLines: readonly string[]): readonly string[] {
  return allowedLines.filter((key) => isInsideAny(key, PORT_FOLDERS) && !key.startsWith(`${PORT_CARVE_OUT_FILE}: `));
}

function violationsOfPlanted(path: string, plantedLine: string): readonly string[] {
  return boundaryReportOf([{ path, text: `${plantedLine}\n` }], []).violations;
}

const PROGRAM_ROOT = repositoryRootOfThisCheckout();
const CODE_SOURCES = programTypeScriptSources(PROGRAM_ROOT);
const TEXT_SOURCES: readonly RepositorySource[] = programFiles(PROGRAM_ROOT)
  .filter((file) => isProse(file.path) || isEvidence(file.path))
  .map((file) => Object.freeze({ path: file.path, text: readFileSync(file.location, 'utf8') }));
const SOURCES: readonly RepositorySource[] = [...CODE_SOURCES, ...TEXT_SOURCES];

const ALLOWED_LINES = Object.keys(ALLOWED_AGENT_LINES);
const ALLOWED_HELPER_LINES = Object.keys(ALLOWED_TESTING_LINES);
const ALLOWED_EVIDENCE_FILES = Object.keys(AGENT_EVIDENCE_FILES);

describe('the scan saw the tree', () => {
  const scannedPaths = SOURCES.map((source) => source.path);

  test('it reads the shipping code, the testing helpers, the prose and the probe files, and skips the specs', () => {
    expect(scannedPaths.filter(isShippingCode).length).toBeGreaterThan(400);
    expect(scannedPaths.filter(isTestingHelper).length).toBeGreaterThan(100);
    expect(scannedPaths.filter(isProse).length).toBeGreaterThan(20);
    expect(scannedPaths.filter(isEvidence).length).toBeGreaterThan(60);
    expect(scannedPaths).toEqual(expect.arrayContaining([
      SEAM_PATH,
      'src/services/overseer/DrivePass.ts',
      'src/testing/ProgramTraps.ts',
      'cli/testing/CutoverSmoke.ts',
      'resources/prompts/BuildPrompt.md',
      'skills/agent-po/SKILL.md',
      '.platform-probes/run-all.js',
      '.readme-graphics/render-diagrams.py',
    ]));
    expect(scannedPaths.filter(isShippingCode)).not.toContain('src/AgentBoundary.spec.ts');
  });

  test('the adapter folder exists, and the code forms really stand in it', () => {
    const streamMapper = CODE_SOURCES.find((source) => source.path === `${ADAPTER_FOLDER}ClaudeStreamMapper.ts`);
    expect(streamMapper).toBeDefined();
    const formsInTheMapper = new Set(formLinesOf(streamMapper ?? { path: '', text: '' }, AGENT_FORMS).map((formLine) => formLine.split(': ')[1]));
    expect([...formsInTheMapper]).toEqual(expect.arrayContaining(['vendor-name', 'vendor-wire-key']));
  });

  test('every line naming a form is allowlisted, and every allowlist entry is found', () => {
    expect(boundaryReportOf(SOURCES, ALLOWED_LINES)).toEqual({ violations: [], unusedAllowances: [] });
  });

  test('every testing helper line naming the vendor is allowlisted, and every entry is found', () => {
    expect(testingReportOf(SOURCES, ALLOWED_HELPER_LINES)).toEqual({ violations: [], unusedAllowances: [] });
  });

  test('every probe or graphics file naming the vendor is listed, and every listed file names it', () => {
    expect(evidenceReportOf(SOURCES, ALLOWED_EVIDENCE_FILES)).toEqual({ violations: [], unusedAllowances: [] });
  });
});

describe('the allowlist is exact both ways', () => {
  const removedEntry = ALLOWED_LINES[0] ?? '';
  const allowedEntry = 'src/services/overseer/PlantedSite.ts: vendor-name: const program = \'claude\';';

  test('removing an entry leaves its line a violation', () => {
    expect(boundaryReportOf(SOURCES, ALLOWED_LINES.slice(1))).toEqual({ violations: [removedEntry], unusedAllowances: [] });
  });

  test('an entry nothing uses is named', () => {
    expect(boundaryReportOf(SOURCES, [...ALLOWED_LINES, allowedEntry])).toEqual({ violations: [], unusedAllowances: [allowedEntry] });
  });

  test('a second copy of an allowed line in its own file is a violation', () => {
    const doubledSite = { path: 'src/services/overseer/PlantedSite.ts', text: 'const program = \'claude\';\nconst program = \'claude\';\n' };
    expect(boundaryReportOf([doubledSite], [allowedEntry])).toEqual({ violations: [`${allowedEntry} [copy 2]`], unusedAllowances: [] });
  });

  test('an allowed line in another file is a violation', () => {
    const plantedCopy = { path: 'src/services/overseer/PlantedOther.ts', text: 'const program = \'claude\';\n' };
    expect(boundaryReportOf([plantedCopy], [allowedEntry])).toEqual({
      violations:       ['src/services/overseer/PlantedOther.ts: vendor-name: const program = \'claude\';'],
      unusedAllowances: [allowedEntry],
    });
  });
});

describe('no entry names the port or Talos but the worker profile', () => {
  test('every key under the port\'s folders is the worker profile\'s, and WP2.27 removes it', () => {
    expect(portKeysBeyondTheCarveOut(ALLOWED_LINES)).toEqual([]);
    const carveOutEntries = Object.entries(ALLOWED_AGENT_LINES).filter(([key]) => isInsideAny(key, PORT_FOLDERS));
    expect(carveOutEntries.length).toBeGreaterThan(0);
    expect(carveOutEntries.filter(([, reason]) => !reason.startsWith('Removed by WP2.27:'))).toEqual([]);
  });

  test('a planted key of another file under those folders fails', () => {
    const plantedKeys = ['src/lib/agent-launch/AgentAdapter.ts: vendor-name: // Claude.', 'src/lib/talos/Talos.ts: vendor-name: // Claude.'];
    expect(portKeysBeyondTheCarveOut([...ALLOWED_LINES, ...plantedKeys])).toEqual(plantedKeys);
  });
});

describe('every entry names its package', () => {
  test('each value starts with Permanent or with the package that removes it', () => {
    const reasons = [...Object.values(ALLOWED_AGENT_LINES), ...Object.values(ALLOWED_TESTING_LINES)];
    expect(reasons.filter((reason) => !PACKAGE_OF_AN_ENTRY_PATTERN.test(reason))).toEqual([]);
    expect(PACKAGE_OF_AN_ENTRY_PATTERN.test('Removed by WP2.22: planted.')).toBe(false);
    expect(PACKAGE_OF_AN_ENTRY_PATTERN.test('Removed by WP2.33: planted.')).toBe(false);
  });

  test('only the seam\'s import and its choice of the adapter stay among the shipping lines', () => {
    expect(Object.entries(ALLOWED_AGENT_LINES).filter(([, reason]) => reason.startsWith('Permanent:')).map(([key]) => key)).toEqual([
      'cli/CommandContext.ts: vendor-name: import { claudeCodeAdapterFor }                 from \'../src/lib/claude-code/ClaudeCodeAdapter.ts\';',
      'cli/CommandContext.ts: vendor-name: if (!fakeAgentIsOn()) return claudeCodeAdapterFor(process.platform, claudeConfigFolderVariable());',
    ]);
  });
});

describe('the guard names each form, planted in memory', () => {
  const servicePath = 'src/services/overseer/Planted.ts';
  const talosPath = 'src/lib/talos/Planted.ts';
  const promptPath = 'resources/prompts/Planted.md';
  const bundlePath = 'skills/planted/SKILL.md';

  const plantedForms: readonly (readonly [string, string, readonly AgentForm[]])[] = [
    [servicePath, 'const program = \'claude\';', ['vendor-name']],
    [servicePath, '// Starts anthropic tooling.', ['vendor-name']],
    [servicePath, 'const file = \'.mcp.json\';', ['vendor-file-layout']],
    [servicePath, '// Reads SKILL.md beside it.', ['vendor-file-layout']],
    [servicePath, 'const folder = join(home, \'projects/\');', ['vendor-file-layout']],
    [servicePath, '// Under subagents/ of the session.', ['vendor-file-layout']],
    [servicePath, 'const kind = line.subtype;', ['vendor-wire-key']],
    [servicePath, 'const format = \'stream-json\';', ['vendor-wire-key']],
    [servicePath, '// Takes the session_id of the line.', ['vendor-wire-key']],
    [servicePath, 'const event = \'PreToolUse\';', ['vendor-hook-protocol']],
    [servicePath, '// Answers in hookSpecificOutput.', ['vendor-hook-protocol']],
    [servicePath, 'const flag = \'--output-format\';', ['vendor-flag']],
    [servicePath, '// Passes --dangerously-skip-permissions.', ['vendor-flag']],
    [servicePath, 'const tool = \'WebFetch\';', ['vendor-tool-name']],
    [servicePath, '// Asks through AskUserQuestion.', ['vendor-tool-name']],
    [servicePath, 'const tool = \'Edit\';', ['vendor-tool-name']],
    [servicePath, '// A Bash call of the session.', ['vendor-tool-name']],
    [servicePath, 'const mark = /\\(Recommended\\)/;', ['vendor-mark']],
    [servicePath, '// Strips the trailing (Recommended).', ['vendor-mark']],
    [servicePath, 'const firstLine = `/${PRODUCT_NAMES.PRODUCT_OWNER_SKILL} ${text}`;', ['vendor-mark']],
    [talosPath, '// Read the record first.', ['port-tool-word']],
    [talosPath, 'const bashDomains = [];', ['port-tool-word']],
    [promptPath, 'Ask a Claude session.', ['vendor-name']],
    [promptPath, 'Never change `.mcp.json`.', ['vendor-file-layout']],
    [promptPath, 'Search the web through WebSearch.', ['vendor-tool-name']],
    [bundlePath, 'Use this skill when the user says "/{{plantedSkill}}".', ['vendor-mark']],
  ];

  test.each(plantedForms)('%s: %s', (path, plantedLine, expectedForms) => {
    expect(violationsOfPlanted(path, plantedLine)).toEqual(expectedForms.map((form) => `${path}: ${form}: ${plantedLine}`));
  });

  test('every form and every pattern of it is planted above', () => {
    expect([...new Set(plantedForms.flatMap(([, , forms]) => forms))].sort()).toEqual([...AGENT_FORMS].sort());
    const unplantedPatterns = AGENT_FORMS.flatMap((form) => AGENT_FORM_PATTERNS[form]
      .filter((formPattern) => !plantedForms.some(([path, line]) => patternApplies(formPattern, path, line) && formPattern.pattern.test(line)))
      .map((formPattern) => `${form}: ${formPattern.pattern.source}`));
    expect(unplantedPatterns).toEqual([]);
  });

  test('a testing helper that finds the program, and a probe or graphics file that names it, fail', () => {
    const helperLine = 'const program = Bun.which(\'claude\');';
    expect(testingReportOf([{ path: 'src/testing/PlantedHelper.ts', text: `${helperLine}\n` }], []).violations)
      .toEqual([`src/testing/PlantedHelper.ts: vendor-name: ${helperLine}`]);
    const plantedEvidence = [
      { path: '.platform-probes/planted.js', text: 'spawn([\'claude\', \'-p\']);\n' },
      { path: '.readme-graphics/planted.py', text: 'run(["claude"])\n' },
    ];
    expect(evidenceReportOf(plantedEvidence, []).violations).toEqual(['.platform-probes/planted.js', '.readme-graphics/planted.py']);
  });
});

describe('the seam reaches no helper that starts or traps the program', () => {
  const scanner = importGraphScannerOf(PROGRAM_ROOT);

  test('the import closure of the seam holds the fake agent and none of the program-starting helpers', () => {
    const reached = reachablePathsFrom(scanner.graph, [SEAM_PATH]);
    expect(reached.has('src/testing/FakeAgentAdapter.ts')).toBe(true);
    expect(PROGRAM_STARTING_HELPERS.filter((path) => reached.has(path))).toEqual([]);
  });

  test('a planted import of the program traps from the fake agent fails it', () => {
    const fakeAgentPath = 'src/testing/FakeAgentAdapter.ts';
    const plantedImport = 'import { TRAPPED_PROGRAMS } from \'./ProgramTraps.ts\';\nexport const planted = TRAPPED_PROGRAMS;\n';
    const plantedGraph = scanner.graphWithPlantedFiles({ [fakeAgentPath]: `${scanner.graph.sourceTextOf(fakeAgentPath)}${plantedImport}` });
    expect(PROGRAM_STARTING_HELPERS.filter((path) => reachablePathsFrom(plantedGraph, [SEAM_PATH]).has(path))).toContain('src/testing/ProgramTraps.ts');
  });

  test('every listed helper exists and has an allowlisted line', () => {
    const helperPaths = CODE_SOURCES.map((source) => source.path);
    expect(PROGRAM_STARTING_HELPERS.filter((path) => !helperPaths.includes(path))).toEqual([]);
    expect(PROGRAM_STARTING_HELPERS.filter((path) => !ALLOWED_HELPER_LINES.some((key) => key.startsWith(`${path}: `)))).toEqual([]);
  });
});

describe('what the guard exempts is exact', () => {
  const plantedLine = 'const program = \'claude\';';
  const plantedComment = '// Starts claude.';

  test('the adapter\'s folder and the fake agent\'s files may name the vendor', () => {
    for (const path of [`${ADAPTER_FOLDER}Planted.ts`, `${FAKE_AGENT_ADAPTER_FOLDER}Planted.ts`, ...FAKE_AGENT_ADAPTER_FILES]) {
      expect(violationsOfPlanted(path, plantedLine)).toEqual([]);
      expect(testingReportOf([{ path, text: `${plantedLine}\n` }], []).violations).toEqual([]);
    }
  });

  test('the port, Talos and the commands are judged, as a comment too', () => {
    for (const path of ['src/lib/agent-launch/Planted.ts', 'src/lib/talos/Planted.ts', 'cli/Planted.ts']) {
      expect(violationsOfPlanted(path, plantedLine)).toEqual([`${path}: vendor-name: ${plantedLine}`]);
      expect(violationsOfPlanted(path, plantedComment)).toEqual([`${path}: vendor-name: ${plantedComment}`]);
    }
  });

  test('a spec and a .dom.tsx are not scanned', () => {
    expect(violationsOfPlanted('cli/Planted.spec.ts', plantedLine)).toEqual([]);
    expect(violationsOfPlanted('bridge/Planted.dom.tsx', plantedLine)).toEqual([]);
    expect(testingReportOf([{ path: 'src/testing/Planted.spec.ts', text: `${plantedLine}\n` }], []).violations).toEqual([]);
  });

  test('a media type\'s subtype, forge\'s own --resume, a Bridge comment on a reported Bash row and the development folders are no finding', () => {
    expect(violationsOfPlanted('bridge/views/intake/Planted.ts', '// A picture\'s media type and its subtype.')).toEqual([]);
    expect(violationsOfPlanted('cli/Planted.ts', 'const usage = \'pipeline apply --resume\';')).toEqual([]);
    expect(violationsOfPlanted('bridge/views/Planted.ts', '// Bash ×4, the tools an agent reported.')).toEqual([]);
    expect(violationsOfPlanted('cli/Planted.ts', 'const folder = \'.claude/worktrees/x\';')).toEqual([]);
  });
});
