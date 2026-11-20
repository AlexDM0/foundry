/**
 * The surface of the CLI the installed files name, frozen per `INSTALL_VERSION` in `cli/FrozenInstalledSurface.json`: the commands and flags the
 * session instructions, the reference, the Assistant brief and the skills name, and the `status --json` and Overseer state fields they read. A
 * version's surface only grows, since a file installed at that version may name any of it; so a frozen name the CLI no longer has means an
 * installed file became wrong, and fails until `INSTALL_VERSION` is bumped. Prose and numbers are not surface, so rewording a template or
 * changing a `DISPATCH_PROTOCOL` number trips nothing. This spec compares the commands and flags, the CLI's side being the help screen;
 * `cli/InstalledSurface.status.spec.ts` compares the status fields, read from a tracker. To retake: add the names a failure lists
 * under the current version, or, after a bump, a new key holding the surface the failures of both specs print; never delete a name from a
 * version already frozen.
 */
import { expect, test, describe } from 'bun:test';

import { PRODUCT_NAMES }                from '../src/shared/constants/ProductNames.ts';
import { helpText }                     from './HelpText.ts';
import { INSTALL_VERSION }              from './constants/InstallVersion.ts';
import type { CliSurface, SurfaceKind } from './testing/InstalledSurfaceScan.ts';
import {
  cliSurfaceOf,
  FLAG_PATTERN,
  FOREIGN_TOOL_FLAGS,
  FROZEN_TABLE_PATH,
  frozenSurfaceTable,
  INSTALLED_TEMPLATE_PATHS,
  installedTextsByPath,
  NAMED_COMMAND_PATTERN,
  namedSurfaceOf,
  SMALLEST_NAMED_COMMAND_COUNT,
  surfaceSentencesOf
} from './testing/InstalledSurfaceScan.ts';

/** The kinds the help screen answers; the status fields need a real tracker. */
const HELP_KINDS: readonly SurfaceKind[] = ['commands', 'flags'];

const FROZEN_TABLE = frozenSurfaceTable();

const INSTALLED_TEXTS = installedTextsByPath();

const HELP_SURFACE: CliSurface = cliSurfaceOf(helpText('posix-shell'), new Set());

function withTextReplaced(texts: Readonly<Record<string, string>>, path: string, searched: string, replacement: string): Readonly<Record<string, string>> {
  const text = texts[path] ?? '';
  expect(text.includes(searched), `${path} holds ${searched}`).toBe(true);
  return { ...texts, [path]: text.replaceAll(searched, replacement) };
}

function cliSurfaceWithHelpReplaced(searched: string, replacement: string): CliSurface {
  expect(helpText('posix-shell').includes(searched), `the help holds ${searched}`).toBe(true);
  return cliSurfaceOf(helpText('posix-shell').replaceAll(searched, replacement), HELP_SURFACE.statusJsonFields);
}

function sentencesWith(installedTexts: Readonly<Record<string, string>>, plantedCliSurface: CliSurface, installVersion = INSTALL_VERSION): readonly string[] {
  return surfaceSentencesOf(namedSurfaceOf(installedTexts, plantedCliSurface), plantedCliSurface, FROZEN_TABLE, installVersion, HELP_KINDS);
}

describe('the scan itself', () => {
  /** Floors well under today's counts, to fail a scan that read the wrong files or a help screen it could not parse. */
  test('it reads the installed files and finds commands and flags in them and in the CLI', () => {
    const expectedPaths = [...INSTALLED_TEMPLATE_PATHS, 'skills/agent-po/SKILL.md', 'skills/agent-progress-orchestrate/SKILL.md', 'skills/agent-pipeline/SKILL.md'];
    expect(Object.keys(INSTALLED_TEXTS)).toEqual(expect.arrayContaining(expectedPaths));
    const namedSurface = namedSurfaceOf(INSTALLED_TEXTS, HELP_SURFACE);
    expect(namedSurface.commands.length, 'commands named').toBeGreaterThanOrEqual(10);
    expect(namedSurface.flags.length, 'flags named').toBeGreaterThanOrEqual(15);
    expect(HELP_SURFACE.commands).toContain('ticket deliver');
    const namedCommandCount = Object.values(INSTALLED_TEXTS).flatMap((text) => [...text.matchAll(NAMED_COMMAND_PATTERN)]).length;
    expect(namedCommandCount, 'command mentions matched by the program-built pattern').toBeGreaterThanOrEqual(SMALLEST_NAMED_COMMAND_COUNT);
  });

  test('the named-command pattern is built from the program: it takes the program\'s commands and no other program\'s, planted in memory', () => {
    const commandsNamedIn = (text: string) => [...text.matchAll(NAMED_COMMAND_PATTERN)].map(([, command = '']) => command);
    expect(commandsNamedIn(`run \`${PRODUCT_NAMES.PROGRAM} status\``)).toEqual(['status']);
    expect(commandsNamedIn('run `example-tool status`, `agent-progressive status` or `my-agent-progress status`')).toEqual([]);
    const plantedTexts = { 'resources/templates/Example.md': 'run `example-tool status` and `example-tool ticket claim`' };
    expect(Object.values(plantedTexts).flatMap((text) => [...text.matchAll(NAMED_COMMAND_PATTERN)]).length).toBeLessThan(SMALLEST_NAMED_COMMAND_COUNT);
  });

  test('every foreign flag is named by an installed file and is not the CLI\'s', () => {
    const allFlags = new Set(Object.values(INSTALLED_TEXTS).flatMap((text) => text.match(FLAG_PATTERN) ?? []));
    expect(FOREIGN_TOOL_FLAGS.filter((flag) => !allFlags.has(flag) || HELP_SURFACE.flags.has(flag))).toEqual([]);
  });
});

describe('the frozen surface', () => {
  test(`holds for INSTALL_VERSION ${INSTALL_VERSION}: the CLI still has every command and flag frozen, and every one installed is frozen`, () => {
    expect(sentencesWith(INSTALLED_TEXTS, HELP_SURFACE)).toEqual([]);
  });
});

/** Owner answer Q41: the by-hand lifecycle verbs, the hook verbs and the Workflow dispatcher retire without a bump, since 17 names none. */
describe('the retired verbs', () => {
  const RETIRED_COMMANDS = ['dispatcher', 'release', 'review record', 'rework', 'ticket approve', 'ticket claim', 'ticket finish', 'ticket start'];
  const RETIRED_HOOK_EVENTS = ['hook subagent-stop', 'hook pre-tool-use', 'hook post-tool-use'];

  test('frozen key "17" names none of them, and the CLI has none of them', () => {
    const frozenCommands = FROZEN_TABLE['17']?.commands ?? [];
    expect(frozenCommands.length, 'the frozen 17 commands').toBeGreaterThan(0);
    for (const retired of [...RETIRED_COMMANDS, ...RETIRED_HOOK_EVENTS]) {
      expect(frozenCommands, retired).not.toContain(retired);
      expect(HELP_SURFACE.commands.has(retired), retired).toBe(false);
    }
    expect(FROZEN_TABLE['17']?.flags ?? [], 'the dispatcher\'s --run').not.toContain('--run');
  });
});

describe('the guard, planted in memory', () => {
  test('a flag the brief names, renamed in the CLI and the brief without a bump, fails naming the rule', () => {
    const renamedCli = cliSurfaceWithHelpReplaced('--depends-on', '--waits-on');
    const renamedTexts = withTextReplaced(INSTALLED_TEXTS, 'resources/templates/Reference.md', '--depends-on', '--waits-on');
    expect(sentencesWith(renamedTexts, renamedCli)).toContain(`the files installed at INSTALL_VERSION ${INSTALL_VERSION} name the flag --depends-on, which the CLI `
      + 'no longer has: an installed file became wrong, so bump INSTALL_VERSION in cli/constants/InstallVersion.ts (CLAUDE.md, Generated and installed files) '
      + 'and freeze the new version\'s surface');
  });

  test('a command the installed files name, removed from the CLI, fails the same way', () => {
    const withoutRange = cliSurfaceWithHelpReplaced('\n  range', '\n  recount');
    expect(sentencesWith(INSTALLED_TEXTS, withoutRange).some((sentence) => sentence.includes('name the command range, which the CLI no longer has'))).toBe(true);
  });

  test('a reworded template or prompt sentence and a changed number trip nothing', () => {
    const rewordedInstructions = withTextReplaced(INSTALLED_TEXTS, 'resources/templates/SessionInstructions.md', 'no session drives', 'no session runs');
    const rewordedBrief = withTextReplaced(rewordedInstructions, 'resources/templates/AssistantBrief.md', 'booted clean', 'started clean');
    const renumbered = withTextReplaced(rewordedBrief, 'resources/templates/Reference.md', '16 hex digits', '20 hex digits');
    expect(sentencesWith(renumbered, HELP_SURFACE)).toEqual([]);
  });

  test('a name newly installed is asked for under the current version', () => {
    const program = PRODUCT_NAMES.PROGRAM;
    const naming = withTextReplaced(INSTALLED_TEXTS, 'skills/agent-po/SKILL.md', `${program} help`, `${program} help and \`${program} usage\``);
    expect(sentencesWith(naming, HELP_SURFACE)).toEqual([
      `the installed files now name the command usage, which INSTALL_VERSION ${INSTALL_VERSION}'s frozen surface lacks: add it under "${INSTALL_VERSION}" in ${FROZEN_TABLE_PATH}`,
    ]);
  });

  test('a bump without a frozen surface for the new version fails, prints the commands and flags to freeze and names where the fields are', () => {
    const [sentence = ''] = sentencesWith(INSTALLED_TEXTS, HELP_SURFACE, INSTALL_VERSION + 1);
    expect(sentence).toStartWith(`${FROZEN_TABLE_PATH} has no surface for INSTALL_VERSION ${INSTALL_VERSION + 1}: add "${INSTALL_VERSION + 1}": {"commands":[`);
    expect(sentence).toEndWith(', with the statusJsonFields cli/InstalledSurface.status.spec.ts prints');
  });
});
