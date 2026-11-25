/**
 * A build named beside the released program reaches none of the released program's files, and the released program none of the side-by-side
 * build's. The cases that matter: the other program's root variable is ignored by the binary; `init` and `update` work beside the other
 * program's data folder and leave it untouched; an `update` leaves the other program's installed files byte for byte and installs its own
 * skills under its own names; and the skill folders of the two are their own. Every expected name derives from the constant, and each case
 * runs the binary once as built and once preloaded to be the other program, so flipping the constant edits no case here.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';
import {
  ORIGINAL_PRODUCT_NAMES,
  PRODUCT_NAMES,
  type ProductNames,
  SIDE_BY_SIDE_PRODUCT_NAMES
} from '../src/shared/constants/ProductNames.ts';
import { rootOverrideVariableOf }                                      from '../src/shared/constants/RootOverrideVariable.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                     from '../src/testing/ChildProcessCaseTimeout.ts';
import { type RecordedGitStage, useRecordedGit }                       from '../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                                      from '../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                                   from '../src/testing/ToolGuard.ts';
import { INSTALLED_SKILL_NAMES, installedSkillNamesFor }               from './adoption/constants/AgentInstall.ts';
import { type AgentProgressResult, runAgentProgressBesideRecordedGit } from './testing/CliProcess.ts';
import { createRecordedGitRepository }                                 from './testing/InitializedScratchRepository.ts';
import {
  binaryInitInANewRepositoryOf,
  COMMON_FOLDER_AT_THE_ROOT,
  initOnAnExistingTrackerOf,
  refreshOfAnIgnoringRepositoryOf
} from './testing/RecordedGitStages.ts';

const OTHER_PRODUCT_NAMES = PRODUCT_NAMES === ORIGINAL_PRODUCT_NAMES ? SIDE_BY_SIDE_PRODUCT_NAMES : ORIGINAL_PRODUCT_NAMES;

/** Each program in turn: the binary as built, and the binary preloaded to be the other program. */
const BOTH_PROGRAMS = [
  { names: PRODUCT_NAMES, otherNames: OTHER_PRODUCT_NAMES, runsAsTheOtherProgram: false },
  { names: OTHER_PRODUCT_NAMES, otherNames: PRODUCT_NAMES, runsAsTheOtherProgram: true },
] as const;

type ProgramSide = (typeof BOTH_PROGRAMS)[number];

const recordedGit = useRecordedGit();

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function scratchRepository(): string {
  const repositoryDirectory = createRecordedGitRepository('product-name-isolation');
  scratchDirectories.push(repositoryDirectory);
  return repositoryDirectory;
}

/** This process holds a directory to this build's names: it asks git for the root of each one that holds no tracker under them. */
function isolationCheckStageOf(directories: readonly string[]): RecordedGitStage {
  return directories.filter((directory) => !existsSync(join(directory, PRODUCT_NAMES.DATA_FOLDER, 'progress.json'))).map(() => COMMON_FOLDER_AT_THE_ROOT);
}

function binaryRunAs(side: ProgramSide, repositoryDirectory: string) {
  return async (commandLineArguments: readonly string[], recordedGitStage: RecordedGitStage, environment?: Record<string, string>): Promise<AgentProgressResult> => {
    const overriddenRoots = Object.values(environment ?? {});
    return await runAgentProgressBesideRecordedGit(recordedGit, isolationCheckStageOf([repositoryDirectory, ...overriddenRoots]), commandLineArguments, {
      currentDirectory:      repositoryDirectory,
      runsAsTheOtherProgram: side.runsAsTheOtherProgram,
      recordedGitStage,
      ...(environment === undefined ? {} : { environment }),
    });
  };
}

function hookSettingsOf(productNames: Readonly<ProductNames>): string {
  const hookCommand = { type: 'command', command: `${productNames.PROGRAM} hook subagent-stop`, timeout: 20 };
  return `${JSON.stringify({ hooks: { SubagentStop: [{ matcher: '', hooks: [hookCommand] }] } }, null, 2)}\n`;
}

test('each program\'s skill folders are its own', () => {
  expect(INSTALLED_SKILL_NAMES).toEqual(installedSkillNamesFor(PRODUCT_NAMES));
  expect(Object.values(installedSkillNamesFor(SIDE_BY_SIDE_PRODUCT_NAMES))).toEqual(['forge-po', 'forge-pipeline']);
});

describeWhenGitIsRecorded('two programs side by side, each run as a binary', () => {
  test('the preloaded binary is the other program, so every case below runs both branches', async () => {
    for (const side of BOTH_PROGRAMS) {
      const repositoryDirectory = scratchRepository();
      const initialised         = await binaryRunAs(side, repositoryDirectory)(['init', '--project', 'Example Agency'], binaryInitInANewRepositoryOf(side.names));
      expect(initialised.exitCode, initialised.standardError).toBe(0);
      expect(existsSync(join(repositoryDirectory, side.names.DATA_FOLDER, 'progress.json')), side.names.PROGRAM).toBe(true);
      expect(existsSync(join(repositoryDirectory, side.otherNames.DATA_FOLDER)), side.names.PROGRAM).toBe(false);
    }
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('init and update work beside the other program\'s data folder and leave it untouched', async () => {
    for (const side of BOTH_PROGRAMS) {
      const repositoryDirectory = scratchRepository();
      const run                 = binaryRunAs(side, repositoryDirectory);
      expect((await run(['init', '--project', 'Example Agency'], binaryInitInANewRepositoryOf(side.names))).exitCode).toBe(0);
      const otherProgressPath = join(repositoryDirectory, side.otherNames.DATA_FOLDER, 'progress.json');
      mkdirSync(join(repositoryDirectory, side.otherNames.DATA_FOLDER), { recursive: true });
      writeFileSync(otherProgressPath, '{ "example": "the other program\'s tracker" }\n');

      for (const outcome of [await run(['init'], initOnAnExistingTrackerOf(side.names)), await run(['update'], refreshOfAnIgnoringRepositoryOf(side.names))]) {
        expect(outcome.exitCode, outcome.standardError).toBe(0);
      }
      expect(readFileSync(otherProgressPath, 'utf8')).toBe('{ "example": "the other program\'s tracker" }\n');
    }
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('the binary ignores the other program\'s root variable pointing at the other program\'s tracker', async () => {
    for (const side of BOTH_PROGRAMS) {
      const otherRepository = scratchRepository();
      const ownRepository   = scratchRepository();
      mkdirSync(join(otherRepository, side.otherNames.DATA_FOLDER), { recursive: true });
      writeFileSync(join(otherRepository, side.otherNames.DATA_FOLDER, 'progress.json'), '{ "example": "the other program\'s tracker" }\n');

      const result = await binaryRunAs(side, ownRepository)(['status', '--json'], [COMMON_FOLDER_AT_THE_ROOT], { [rootOverrideVariableOf(side.otherNames)]: otherRepository });

      expect(result.exitCode, side.names.PROGRAM).toBe(1);
      expect(result.standardError).toContain(ownRepository);
      expect(result.standardError).not.toContain(otherRepository);
    }
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('update leaves the other program\'s instruction file, hooks, agent definition and skill folders byte for byte, and keeps its own skills', async () => {
    for (const side of BOTH_PROGRAMS) {
      const repositoryDirectory = scratchRepository();
      const run                 = binaryRunAs(side, repositoryDirectory);
      const otherFiles: Readonly<Record<string, string>> = {
        'CLAUDE.md':                                                         `The ${side.otherNames.PROGRAM} program's instructions.\n`,
        '.claude/settings.local.json':                                       hookSettingsOf(side.otherNames),
        [`.claude/agents/${side.otherNames.PROGRAM}-worker.md`]:             '---\nname: the other program\'s worker\n---\n',
        [`.claude/skills/${side.otherNames.PRODUCT_OWNER_SKILL}/SKILL.md`]:  '---\nname: the other program\'s skill\n---\n',
        [`.claude/skills/${side.otherNames.PIPELINE_SETUP_SKILL}/SKILL.md`]: '---\nname: the other program\'s skill\n---\n',
      };
      expect((await run(['init', '--project', 'Example Agency'], binaryInitInANewRepositoryOf(side.names))).exitCode).toBe(0);
      for (const [relativePath, text] of Object.entries(otherFiles)) {
        mkdirSync(join(repositoryDirectory, relativePath, '..'), { recursive: true });
        const existingText = existsSync(join(repositoryDirectory, relativePath)) ? readFileSync(join(repositoryDirectory, relativePath), 'utf8') : '';
        writeFileSync(join(repositoryDirectory, relativePath), relativePath === 'CLAUDE.md' ? `${existingText}\n${text}` : text);
      }
      const before = Object.fromEntries(Object.keys(otherFiles).map((relativePath) => [relativePath, readFileSync(join(repositoryDirectory, relativePath), 'utf8')]));

      const updated = await run(['update'], refreshOfAnIgnoringRepositoryOf(side.names));
      expect(updated.exitCode, updated.standardError).toBe(0);

      const settingsText = readFileSync(join(repositoryDirectory, '.claude/settings.local.json'), 'utf8');
      expect(settingsText).toContain(`"${side.otherNames.PROGRAM} hook subagent-stop"`);
      expect(settingsText).toContain(`"${side.names.PROGRAM} hook session-start"`);
      for (const relativePath of Object.keys(otherFiles).filter((path) => path !== '.claude/settings.local.json')) {
        expect(readFileSync(join(repositoryDirectory, relativePath), 'utf8'), `${side.names.PROGRAM}: ${relativePath}`).toBe(before[relativePath] ?? '');
      }
      for (const skillName of [side.names.PRODUCT_OWNER_SKILL, side.names.PIPELINE_SETUP_SKILL]) {
        expect(readFileSync(join(repositoryDirectory, '.claude', 'skills', skillName, 'SKILL.md'), 'utf8')).toStartWith(`---\nname: ${skillName}\n`);
      }
    }
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
