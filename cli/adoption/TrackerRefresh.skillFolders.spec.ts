/**
 * The skills reach a tracked repository as copies in its `.claude/skills/`, never through a global install, so what matters is that `init`
 * writes each folder byte for byte as this checkout holds it and keeps it out of git, that a later refresh carries a changed source file
 * over, and that a file a user put in the folder survives, since the refresh owns only the files the skill ships. The skill folder retired at
 * install version 10 goes the same way: its shipped files and its `.gitignore` entry are removed, a user's file in it stays.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';


import { workspacePathsFor }                                                          from '../../src/services/tracker/Workspace.ts';
import { filledTemplateOf, productNameTemplateValuesOf }                              from '../../src/shared/FilledTemplate.ts';
import { PRODUCT_NAMES }                                                              from '../../src/shared/constants/ProductNames.ts';
import { GIT_CALL_SHAPES, type RecordedGitStage, useRecordedGit }                     from '../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                                                     from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                                                  from '../../src/testing/ToolGuard.ts';
import { runCommandLine }                                                             from '../Main.ts';
import { createCapturedCommandContext }                                               from '../testing/CapturedCommandContext.ts';
import { createRecordedGitRepository }                                                from '../testing/InitializedScratchRepository.ts';
import { checkIgnoreOf, INIT_IN_A_NEW_REPOSITORY, REFRESH_OF_AN_IGNORING_REPOSITORY } from '../testing/RecordedGitStages.ts';
import { repositoryFileContentsOf }                                                   from '../testing/RepositoryFileContents.ts';
import { installedFileTextsFor, installedSkillFileTexts, skillSourceDirectoryOf }     from './InstalledFileGeneration.ts';
import { refreshTrackedRepository }                                                   from './TrackerRefresh.ts';
import { INSTALLED_SKILL_NAMES, type SkillSourceFolderName }                          from './constants/ClaudeCodeInstall.ts';

const SKILLS = Object.entries(INSTALLED_SKILL_NAMES) as [SkillSourceFolderName, string][];

const RETIRED_SKILL_FOLDER = join('.claude', 'skills', PRODUCT_NAMES.PROGRAM);

const PRODUCT_OWNER_SKILL_FOLDER = join('.claude', 'skills', PRODUCT_NAMES.PRODUCT_OWNER_SKILL);

const INSTALLED_FILE_TEXTS = installedFileTextsFor();

/** The refresh in a repository whose `.gitignore` names none of its folders yet. */
const REFRESH_OF_A_NEW_REPOSITORY: RecordedGitStage = [
  ...Object.values(INSTALLED_SKILL_NAMES).map((installedName) => checkIgnoreOf(`.claude/skills/${installedName}`, GIT_CALL_SHAPES.CHECK_IGNORE_NOT_IGNORED)),
  checkIgnoreOf(PRODUCT_NAMES.WORKTREES_FOLDER, GIT_CALL_SHAPES.CHECK_IGNORE_NOT_IGNORED),
];

const recordedGit = useRecordedGit();

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function scratchRepository(): string {
  const repositoryDirectory = createRecordedGitRepository('skill-folders');
  scratchDirectories.push(repositoryDirectory);
  return repositoryDirectory;
}

/** What git is told to ignore: whether git honours the line is git's behaviour, not this code's. */
function gitIgnoreLinesOf(repositoryDirectory: string): string[] {
  return readFileSync(join(repositoryDirectory, '.gitignore'), 'utf8').split('\n');
}

async function initIn(repositoryDirectory: string): Promise<void> {
  await recordedGit.playStage(INIT_IN_A_NEW_REPOSITORY, async () => {
    const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
    const exitCode = await runCommandLine(['init', '--project', 'Example Agency'], context);
    if (exitCode !== 0) throw new Error(`init exited ${exitCode}: ${context.errorText()}`);
  });
}

async function refreshSkillsIn(repositoryDirectory: string, skillFileTexts: ReadonlyMap<string, string>, stage: RecordedGitStage): Promise<void> {
  await recordedGit.playStage(stage, async () => refreshTrackedRepository({
    workspace:               workspacePathsFor(repositoryDirectory),
    installedFileTexts:      INSTALLED_FILE_TEXTS,
    installedSkillFileTexts: Object.fromEntries(Object.values(INSTALLED_SKILL_NAMES).map((installedName) => [installedName, skillFileTexts])),
    commandName:             'update',
    optOutFlags:             new Set(['no-hooks'] as const),
    writesTheBriefFirst:     false,
    standardError:           () => undefined,
  }));
}

describeWhenGitIsRecorded('the installed skill folders', () => {
  test('init writes each skill folder under the product\'s name for it, this checkout\'s files filled with that name, and git-ignores it', async () => {
    const repositoryDirectory = scratchRepository();

    await initIn(repositoryDirectory);

    for (const [sourceFolderName, installedName] of SKILLS) {
      const installedFolder = join(repositoryDirectory, '.claude', 'skills', installedName);
      const sourceFiles     = repositoryFileContentsOf(skillSourceDirectoryOf(sourceFolderName));
      const fillValues      = { ...productNameTemplateValuesOf(PRODUCT_NAMES), skillName: installedName };
      expect(repositoryFileContentsOf(installedFolder)).toEqual(new Map([...sourceFiles].map(([path, text]) => [path, filledTemplateOf(text, fillValues)])));
      expect(readFileSync(join(installedFolder, 'SKILL.md'), 'utf8')).toContain(`\nname: ${installedName}\n`);
      expect(gitIgnoreLinesOf(repositoryDirectory), installedName).toContain(`.claude/skills/${installedName}/`);
    }
  });

  test('every source SKILL.md takes its name from the install, so the folder and the name Claude Code reads cannot disagree', () => {
    for (const [sourceFolderName] of SKILLS) {
      expect(readFileSync(join(skillSourceDirectoryOf(sourceFolderName), 'SKILL.md'), 'utf8'), sourceFolderName).toStartWith('---\nname: {{skillName}}\n');
    }
  });

  test('the files read for each skill are every file of its source folder, SKILL.md among them', () => {
    const skillFileTexts = installedSkillFileTexts();
    for (const [sourceFolderName, installedName] of SKILLS) {
      expect([...(skillFileTexts[installedName]?.keys() ?? [])]).toEqual([...repositoryFileContentsOf(skillSourceDirectoryOf(sourceFolderName)).keys()].sort());
      expect(skillFileTexts[installedName]?.has('SKILL.md'), installedName).toBe(true);
    }
  });

  test('a refresh rewrites a changed skill file and leaves a file the user added to the folder untouched', async () => {
    const repositoryDirectory = scratchRepository();
    const firstVersion = new Map([['SKILL.md', 'Example skill, first version\n'], ['notes/Reference.md', 'Example reference\n']]);
    await refreshSkillsIn(repositoryDirectory, firstVersion, REFRESH_OF_A_NEW_REPOSITORY);
    const userFilePath = join(repositoryDirectory, PRODUCT_OWNER_SKILL_FOLDER, 'Example user notes.md');
    writeFileSync(userFilePath, 'Alex Example\'s own notes\n');

    const secondVersion = new Map([['SKILL.md', 'Example skill, second version\n'], ['notes/Reference.md', 'Example reference\n']]);
    await refreshSkillsIn(repositoryDirectory, secondVersion, REFRESH_OF_AN_IGNORING_REPOSITORY);

    const installedFolder = join(repositoryDirectory, PRODUCT_OWNER_SKILL_FOLDER);
    expect(readFileSync(join(installedFolder, 'SKILL.md'), 'utf8')).toBe('Example skill, second version\n');
    expect(readFileSync(join(installedFolder, 'notes', 'Reference.md'), 'utf8')).toBe('Example reference\n');
    expect(existsSync(userFilePath)).toBe(true);
    expect(readFileSync(userFilePath, 'utf8')).toBe('Alex Example\'s own notes\n');
  });

  test('a second refresh adds no second .gitignore entry', async () => {
    const repositoryDirectory = scratchRepository();
    const skillFileTexts = new Map([['SKILL.md', 'Example skill\n']]);
    await refreshSkillsIn(repositoryDirectory, skillFileTexts, REFRESH_OF_A_NEW_REPOSITORY);
    await refreshSkillsIn(repositoryDirectory, skillFileTexts, REFRESH_OF_AN_IGNORING_REPOSITORY);

    expect(readFileSync(join(repositoryDirectory, '.gitignore'), 'utf8'))
      .toBe(`.claude/skills/${PRODUCT_NAMES.PRODUCT_OWNER_SKILL}/\n.claude/skills/${PRODUCT_NAMES.ORCHESTRATE_SKILL}/\n${PRODUCT_NAMES.WORKTREES_FOLDER}/\n`);
  });
});

/** Plants what an install at version 9 left: the retired skill's two files, its `.gitignore` entry and the manifest naming 9. */
function plantVersionNineSkillFolder(repositoryDirectory: string): void {
  const retiredFolder = join(repositoryDirectory, RETIRED_SKILL_FOLDER);
  mkdirSync(retiredFolder, { recursive: true });
  writeFileSync(join(retiredFolder, 'SKILL.md'), 'Example retired skill\n');
  writeFileSync(join(retiredFolder, 'Reference.md'), 'Example retired reference\n');
  appendFileSync(join(repositoryDirectory, '.gitignore'), `.claude/skills/${PRODUCT_NAMES.PROGRAM}/\n`);
  writeFileSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'version.json'), '{\n  "installVersion": 9,\n  "agentHost": "claude-code"\n}\n');
}

async function updateIn(repositoryDirectory: string): Promise<string> {
  return await recordedGit.playStage(REFRESH_OF_AN_IGNORING_REPOSITORY, async () => {
    const context  = createCapturedCommandContext({ currentDirectory: repositoryDirectory });
    const exitCode = await runCommandLine(['update'], context);
    if (exitCode !== 0) throw new Error(`update exited ${exitCode}: ${context.errorText()}`);
    return context.outputText();
  });
}

describeWhenGitIsRecorded('the retired agent-progress skill folder', () => {
  test('update over a version 9 install removes the files it installed there, the folder and its .gitignore entry', async () => {
    const repositoryDirectory = scratchRepository();
    await initIn(repositoryDirectory);
    plantVersionNineSkillFolder(repositoryDirectory);

    const output = await updateIn(repositoryDirectory);

    expect(existsSync(join(repositoryDirectory, RETIRED_SKILL_FOLDER))).toBe(false);
    expect(readFileSync(join(repositoryDirectory, '.gitignore'), 'utf8')).not.toContain(`.claude/skills/${PRODUCT_NAMES.PROGRAM}/\n`);
    expect(readFileSync(join(repositoryDirectory, '.gitignore'), 'utf8')).toContain(`.claude/skills/${PRODUCT_NAMES.PRODUCT_OWNER_SKILL}/\n`);
    expect(output).toContain(`${RETIRED_SKILL_FOLDER}, .gitignore entry removed)`);
    expect(output).toContain('retired (');
  });

  test('a file the user put in the retired folder stays, with the folder, while the installed files go', async () => {
    const repositoryDirectory = scratchRepository();
    await initIn(repositoryDirectory);
    plantVersionNineSkillFolder(repositoryDirectory);
    const userFilePath = join(repositoryDirectory, RETIRED_SKILL_FOLDER, 'Example user notes.md');
    writeFileSync(userFilePath, 'Alex Example\'s own notes\n');

    await updateIn(repositoryDirectory);

    expect(readdirSync(join(repositoryDirectory, RETIRED_SKILL_FOLDER))).toEqual(['Example user notes.md']);
    expect(readFileSync(userFilePath, 'utf8')).toBe('Alex Example\'s own notes\n');
  });

  test('a repository that never had the retired folder hears nothing about it', async () => {
    const repositoryDirectory = scratchRepository();
    await initIn(repositoryDirectory);

    expect(await updateIn(repositoryDirectory)).not.toContain('retired (');
  });
});
