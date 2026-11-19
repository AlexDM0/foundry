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
  'cli/CommandContext.ts: vendor-name: import { claudeCodeAdapterFor }                 from \'../src/lib/claude-code/ClaudeCodeAdapter.ts\';':
    'Permanent: The seam imports the vendor\'s adapter; the one composition root that chooses it.',
  'cli/CommandContext.ts: vendor-name: if (!fakeAgentIsOn()) return claudeCodeAdapterFor(process.platform, agentVariableOf);':
    'Permanent: The seam chooses the vendor\'s adapter, which reads its own variables through the reader it is handed.',
};

/** `<path>: vendor-name: <trimmed line>` of a testing helper, each with the package that removes it or why it stays. */
const ALLOWED_TESTING_LINES: Readonly<Record<string, string>> = {
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
  'cli/testing/InstalledSurfaceScan.ts: vendor-name: + \'cli/constants/InstallVersion.ts (CLAUDE.md, Generated and installed files) and freeze the new version\\\'s surface\'),':
    'Permanent: this repository\'s own agent folders and evidence, which the scans and the smoke skip.',
  'cli/testing/RecordedGitStages.ts: vendor-name: const INSTALLED_SKILLS_FOLDER = \'.claude/skills\';':
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
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
  [
  'src/testing/RecordedGitFlow.ts: vendor-name: \'tree changed with trailer\': { path: \'built.txt\', message: \'Build the example\\n\\nCo-Authored-By: Claude '
    + '<noreply@example.com>\' },'
  ]:
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  'src/testing/RecordedGitFlow.ts: vendor-name: \'agent config changed\':      { path: \'.claude/settings.json\', message: \'Build the example\' },':
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  [
  'src/testing/RecordedGitFlow.ts: vendor-name: export const RECORDED_FOLDER_FLOW_SKILL_IGNORE_TEXT = '
    + '`.claude/skills/${PRODUCT_NAMES.PRODUCT_OWNER_SKILL}/\\n.claude/skills/${PRODUCT_NAMES.ORCHESTRATE_SKILL}/\\n`;'
  ]:
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  'src/testing/RecordedGitFlow.ts: vendor-name: { gitArguments: [\'check-ignore\', \'-q\', `.claude/skills/${PRODUCT_NAMES.PRODUCT_OWNER_SKILL}/`], exitCode: NEGATIVE },':
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
  'src/testing/RecordedGitFlow.ts: vendor-name: { gitArguments: [\'check-ignore\', \'-q\', `.claude/skills/${PRODUCT_NAMES.ORCHESTRATE_SKILL}/`], exitCode: NEGATIVE },':
    'Permanent: a fixture plants the vendor\'s files the fake agent\'s adapter and Customs read.',
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

function portKeysOf(allowedLines: readonly string[]): readonly string[] {
  return allowedLines.filter((key) => isInsideAny(key, PORT_FOLDERS));
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

describe('no entry names the port or Talos', () => {
  test('no key lies under the port\'s folders', () => {
    expect(portKeysOf(ALLOWED_LINES)).toEqual([]);
  });

  test('a planted key of any file under those folders fails, the worker profile\'s included', () => {
    const plantedKeys = [
      'src/lib/agent-launch/AgentAdapter.ts: vendor-name: // Claude.',
      'src/lib/agent-launch/WorkerProfile.ts: port-tool-word: // Edit.',
      'src/lib/talos/Talos.ts: vendor-name: // Claude.',
    ];
    expect(portKeysOf([...ALLOWED_LINES, ...plantedKeys])).toEqual(plantedKeys);
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
      'cli/CommandContext.ts: vendor-name: if (!fakeAgentIsOn()) return claudeCodeAdapterFor(process.platform, agentVariableOf);',
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
