/**
 * The scan both installed surface specs share: what the installed files name, what the CLI has, and the sentences a difference from
 * `cli/FrozenInstalledSurface.json` prints. `cli/InstalledSurface.spec.ts` compares the commands and flags, read from the help screen;
 * `cli/InstalledSurface.status.spec.ts` compares the `status --json` fields, read from a tracker on recorded git answers.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join }                      from 'node:path';

import { filledTemplateOf, productNameTemplateValuesOf } from '../../src/shared/FilledTemplate.ts';
import { ORIGINAL_PRODUCT_NAMES, PRODUCT_NAMES }         from '../../src/shared/constants/ProductNames.ts';

export const SURFACE_KINDS = ['commands', 'flags', 'statusJsonFields'] as const;

export type SurfaceKind = typeof SURFACE_KINDS[number];

export type Surface = Readonly<Record<SurfaceKind, readonly string[]>>;

export type FrozenSurfaceTable = Readonly<Record<string, Surface>>;

export type CliSurface = Readonly<Record<SurfaceKind, ReadonlySet<string>>>;

const SURFACE_KIND_WORDS: Readonly<Record<SurfaceKind, string>> = {
  commands:         'command',
  flags:            'flag',
  statusJsonFields: '`status --json` field',
};

const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');

export const FROZEN_TABLE_PATH = 'cli/FrozenInstalledSurface.json';

const STATUS_FIELDS_SPEC_PATH = 'cli/InstalledSurface.status.spec.ts';

export const INSTALLED_TEMPLATE_PATHS = [
  'resources/templates/SessionInstructions.md',
  'resources/templates/AssistantBrief.md',
  'resources/templates/Reference.md',
  'resources/templates/Constitution.md',
  'resources/templates/OnboarderBrief.md',
  'resources/prompts/BuildPrompt.md',
  'resources/prompts/ReviewPrompt.md',
  'resources/prompts/ProductOwnerPrompt.md',
  // The hook command `init` and `update` write into the settings file.
  'cli/adoption/constants/ClaudeCodeInstall.ts',
];

const INSTALLED_SKILL_FOLDERS = ['skills/agent-po', 'skills/agent-progress-orchestrate'];

/** Flags of other tools' commands the installed files spell out; exact both ways, and none of them is the CLI's. Version 17's files spell out none. */
export const FOREIGN_TOOL_FLAGS: readonly string[] = [];

export const FLAG_PATTERN = /--[a-z][a-z-]*[a-z]/g;

/** The templates and skills are filled with the program's name as `init` fills them; the released program's name is matched too. */
function namedCommandPatternOf(programNames: readonly string[]): RegExp {
  const programAlternatives = [...new Set(programNames)].map((programName) => RegExp.escape(programName)).join('|');
  return new RegExp(`(?<![\\w-])(?:${programAlternatives}) ([a-z]+)(?: ([a-z][a-z-]*))?`, 'g');
}

export const NAMED_COMMAND_PATTERN = namedCommandPatternOf([PRODUCT_NAMES.PROGRAM, ORIGINAL_PRODUCT_NAMES.PROGRAM]);

/** Below the count the installed files name today, so a pattern that stops matching fails rather than passing on nothing. */
export const SMALLEST_NAMED_COMMAND_COUNT = 30;

const HELP_COMMAND_LINE_PATTERN = /^ {2}([a-z]+)(?: ([a-z][a-z|-]*))?/gm;

/** A backtick in markdown, or an escaped one inside a TypeScript template literal. */
const BACKTICKED_NAME_PATTERN = /\\?`([A-Za-z]+)\\?`/g;

function repositoryFileText(path: string): string {
  return readFileSync(join(REPOSITORY_ROOT, path), 'utf8');
}

export function frozenSurfaceTable(): FrozenSurfaceTable {
  return JSON.parse(repositoryFileText(FROZEN_TABLE_PATH)) as FrozenSurfaceTable;
}

export function installedTextsByPath(): Readonly<Record<string, string>> {
  const skillPaths = INSTALLED_SKILL_FOLDERS.flatMap((folder) => readdirSync(join(REPOSITORY_ROOT, folder))
    .filter((fileName) => fileName.endsWith('.md'))
    .map((fileName) => `${folder}/${fileName}`));
  return Object.fromEntries([...INSTALLED_TEMPLATE_PATHS, ...skillPaths].sort()
    .map((path) => [path, filledTemplateOf(repositoryFileText(path), productNameTemplateValuesOf(PRODUCT_NAMES))]));
}

export function cliSurfaceOf(help: string, statusDocumentKeys: ReadonlySet<string>): CliSurface {
  const commands = new Set<string>();
  for (const [, command = '', subcommands] of help.matchAll(HELP_COMMAND_LINE_PATTERN)) {
    commands.add(command);
    for (const subcommand of subcommands?.split('|') ?? []) commands.add(`${command} ${subcommand}`);
  }
  return { commands, flags: new Set(help.match(FLAG_PATTERN) ?? []), statusJsonFields: statusDocumentKeys };
}

/** Commands and fields are kept only where the CLI has them, since prose says `agent-progress itself` too; a frozen name the CLI drops still fails. */
export function namedSurfaceOf(installedTexts: Readonly<Record<string, string>>, cliSurface: CliSurface): Surface {
  const texts = Object.values(installedTexts);
  const commands = new Set<string>();
  for (const [, command = '', subcommand] of texts.flatMap((text) => [...text.matchAll(NAMED_COMMAND_PATTERN)])) {
    const withSubcommand = `${command} ${subcommand ?? ''}`;
    if (cliSurface.commands.has(withSubcommand)) commands.add(withSubcommand);
    else if (cliSurface.commands.has(command)) commands.add(command);
  }
  const flags = new Set(texts.flatMap((text) => text.match(FLAG_PATTERN) ?? []).filter((flag) => !FOREIGN_TOOL_FLAGS.includes(flag)));
  const backtickedNames = texts.flatMap((text) => [...text.matchAll(BACKTICKED_NAME_PATTERN)].map(([, name = '']) => name));
  const statusJsonFields = new Set(backtickedNames.filter((name) => cliSurface.statusJsonFields.has(name)));
  return { commands: [...commands].sort(), flags: [...flags].sort(), statusJsonFields: [...statusJsonFields].sort() };
}

/** Only the compared kinds are judged; a missing version asks for them, and for the fields the integration spec prints when it compares fewer. */
export function surfaceSentencesOf(
  namedSurface: Surface,
  cliSurface: CliSurface,
  frozenTable: FrozenSurfaceTable,
  installVersion: number,
  comparedKinds: readonly SurfaceKind[],
): readonly string[] {
  const versionKey = String(installVersion);
  if (!Object.hasOwn(frozenTable, versionKey)) {
    const surfaceToFreeze = Object.fromEntries(comparedKinds.map((kind) => [kind, namedSurface[kind]]));
    const kindsLeft = SURFACE_KINDS.filter((kind) => !comparedKinds.includes(kind));
    const kindsLeftClause = kindsLeft.length === 0 ? '' : `, with the ${kindsLeft.join(' and ')} ${STATUS_FIELDS_SPEC_PATH} prints`;
    return [`${FROZEN_TABLE_PATH} has no surface for INSTALL_VERSION ${versionKey}: add "${versionKey}": ${JSON.stringify(surfaceToFreeze)}${kindsLeftClause}`];
  }
  const frozenSurface = frozenTable[versionKey] ?? namedSurface;
  return comparedKinds.flatMap((kind) => [
    ...frozenSurface[kind].filter((name) => !cliSurface[kind].has(name)).map((name) => `the files installed at INSTALL_VERSION ${versionKey} name the `
      + `${SURFACE_KIND_WORDS[kind]} ${name}, which the CLI no longer has: an installed file became wrong, so bump INSTALL_VERSION in `
      + 'cli/constants/InstallVersion.ts (CLAUDE.md, Generated and installed files) and freeze the new version\'s surface'),
    ...namedSurface[kind].filter((name) => !frozenSurface[kind].includes(name)).map((name) => 'the installed files now name the '
      + `${SURFACE_KIND_WORDS[kind]} ${name}, which INSTALL_VERSION ${versionKey}'s frozen surface lacks: add it under "${versionKey}" in ${FROZEN_TABLE_PATH}`),
  ]);
}
