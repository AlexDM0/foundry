/**
 * Machine setup runs in-process here under an injected host, so every platform's run is checked on one machine. Bun is a recorder: it
 * answers `--version` and writes what `build` would, and nothing else runs. Git is real, on a scratch repository standing in for the
 * checkout, because `core.hooksPath` is what makes the tracked pre-commit hook gate every worktree. The cases that matter: all four steps
 * run in order on macOS and on Windows; the Windows run puts Bun's bin folder on the User PATH through PowerShell and never names bash;
 * a Bun below `.bun-version` stops setup before anything is installed; --instruct-only writes nothing; and the retired skill links are
 * removed only when they resolve into the checkout.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { PRODUCT_NAMES }                                           from '../../src/shared/constants/ProductNames.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }                 from '../../src/testing/ChildProcessCaseTimeout.ts';
import { createCanonicalScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchWorkspace.ts';
import { testWhenGitIsPresent }                                    from '../../src/testing/ToolGuard.ts';
import { pinnedBunVersionOf }                                      from './BunStep.ts';
import { runSetup }                                                from './Setup.ts';
import { type FinishedCommand, type SetupHost }                    from './SetupHost.ts';

const CHECKOUT_ROOT = join(import.meta.dir, '..', '..');
const PINNED_BUN_VERSION = pinnedBunVersionOf(CHECKOUT_ROOT);
const OLD_BUN_VERSION = '1.0.0';
const EXAMPLE_RC_CONTENT = '# Alex Example\'s shell configuration\n';

interface HostChoices {
  readonly platform?:      NodeJS.Platform;
  readonly answer?:        boolean;
  readonly bunVersions?:   readonly string[];
  readonly programOnPath?: string | null;
}

interface RecordedSetup {
  readonly host:     SetupHost;
  readonly commands: string[][];
  readonly output:   () => string;
  readonly bunCalls: () => string[];
}

let scratchDirectory = '';
let homeDirectory = '';
let checkoutDirectory = '';
let bunProgram = '';

beforeEach(() => {
  scratchDirectory = createCanonicalScratchDirectory('setup-steps');
  homeDirectory = join(scratchDirectory, 'home');
  checkoutDirectory = join(scratchDirectory, 'checkout');
  bunProgram = join(scratchDirectory, 'bun-install', 'bin', 'bun');
  mkdirSync(join(scratchDirectory, 'bun-install', 'bin'), { recursive: true });
  mkdirSync(homeDirectory);
  mkdirSync(checkoutDirectory);
  writeFileSync(bunProgram, '');
  writeFileSync(join(homeDirectory, '.zshrc'), EXAMPLE_RC_CONTENT);
  writeFileSync(join(checkoutDirectory, '.bun-version'), `${PINNED_BUN_VERSION}\n`);
  Bun.spawnSync(['git', 'init', '--quiet', checkoutDirectory], { stdout: 'ignore', stderr: 'ignore' });
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

function realGit(command: readonly string[], workingDirectory: string): FinishedCommand {
  const finished = Bun.spawnSync([...command], { cwd: workingDirectory, stdout: 'pipe', stderr: 'pipe' });
  return { exitCode: finished.exitCode, output: finished.stdout.toString() };
}

/** Bun's `build` writes the file after `--outfile`, so the rename that installs the launcher has something to move. */
function recordedBun(command: readonly string[], versions: string[]): FinishedCommand {
  if (command[1] === '--version') return { exitCode: 0, output: `${versions.length > 1 ? versions.shift() : versions[0]}\n` };
  if (command[1] === 'build') writeFileSync(command[command.indexOf('--outfile') + 1] ?? '', 'compiled launcher');
  return { exitCode: 0, output: '' };
}

function recordedSetup(choices: HostChoices = {}): RecordedSetup {
  const commands: string[][] = [];
  const writtenText: string[] = [];
  const versions = [...(choices.bunVersions ?? [PINNED_BUN_VERSION])];
  const host: SetupHost = {
    platform:            choices.platform ?? 'darwin',
    checkoutDirectory,
    homeDirectory,
    bunProgram,
    bunInstallFolder:    join(scratchDirectory, 'bun-install'),
    searchPath:          [join(scratchDirectory, 'elsewhere')],
    userShell:           '/bin/zsh',
    programOnSearchPath: () => choices.programOnPath ?? null,
    run:                 (command, workingDirectory) => {
      commands.push([...command]);
      if (command[0] === 'git') return realGit(command, workingDirectory);
      if (command[0] === bunProgram) return recordedBun(command, versions);
      return { exitCode: 0, output: '' };
    },
    answersYes: () => choices.answer ?? false,
    write:      (text) => writtenText.push(text),
  };
  return {
    host,
    commands,
    output:   () => writtenText.join(''),
    bunCalls: () => commands.filter((command) => command[0] === bunProgram).map((command) => command[1] ?? ''),
  };
}

function hooksPathOfCheckout(): string {
  return realGit(['git', '-C', checkoutDirectory, 'config', '--get', 'core.hooksPath'], checkoutDirectory).output.trim();
}

function skillsFolder(): string {
  return join(homeDirectory, '.claude', 'skills');
}

describe('the four steps on each platform', () => {
  testWhenGitIsPresent('on macOS setup checks Bun, installs, links and compiles the launcher, offers the shell startup file, and sets core.hooksPath', () => {
    const setup = recordedSetup({ answer: true });
    expect(runSetup([], setup.host), setup.output()).toBe(0);
    expect(setup.bunCalls()).toEqual(['--version', 'install', 'link', 'build']);
    expect(readFileSync(join(scratchDirectory, 'bun-install', 'bin', PRODUCT_NAMES.PROGRAM), 'utf8')).toBe('compiled launcher');
    expect(readFileSync(join(homeDirectory, '.zshrc'), 'utf8')).toBe(`${EXAMPLE_RC_CONTENT}\nexport PATH="${join(scratchDirectory, 'bun-install', 'bin')}:$PATH"\n`);
    expect(hooksPathOfCheckout()).toBe('.githooks');
    const headings = ['1/4 Bun', '2/4 Dependencies', '3/4 Retire', '4/4 The pre-commit hook'].map((heading) => setup.output().indexOf(heading));
    expect(headings.every((position, index) => position >= 0 && (index === 0 || position > (headings[index - 1] ?? 0)))).toBe(true);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  testWhenGitIsPresent('on Windows setup compiles an .exe launcher and writes the User PATH through PowerShell, never naming bash or a startup file', () => {
    const setup = recordedSetup({ platform: 'win32', answer: true });
    expect(runSetup([], setup.host), setup.output()).toBe(0);
    expect(setup.bunCalls()).toEqual(['--version', 'install', 'link', 'build']);
    expect(readdirSync(join(scratchDirectory, 'bun-install', 'bin')).sort()).toEqual([`${PRODUCT_NAMES.PROGRAM}.exe`, 'bun']);
    const userPathCommand = setup.commands.find((command) => command[0] === 'powershell.exe');
    expect(userPathCommand?.at(-1)).toContain('SetEnvironmentVariable(\'Path\'');
    expect(userPathCommand?.at(-1)).toContain(`'${join(scratchDirectory, 'bun-install', 'bin')}'`);
    expect(userPathCommand?.at(-1)).toContain('\'User\')');
    expect(setup.output()).toContain('to your User PATH — takes effect in new terminals');
    expect(JSON.stringify(setup.commands)).not.toContain('bash');
    expect(setup.output()).not.toContain('bash');
    expect(readFileSync(join(homeDirectory, '.zshrc'), 'utf8')).toBe(EXAMPLE_RC_CONTENT);
    expect(hooksPathOfCheckout()).toBe('.githooks');
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  testWhenGitIsPresent('on Windows a declined offer runs no PowerShell and says how to run the program', () => {
    const setup = recordedSetup({ platform: 'win32', answer: false });
    expect(runSetup([], setup.host)).toBe(0);
    expect(setup.commands.some((command) => command[0] === 'powershell.exe')).toBe(false);
    expect(setup.output()).toContain('or add');
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  testWhenGitIsPresent('a program already on the search path is reported, and no search path offer is made', () => {
    const setup = recordedSetup({ answer: true, programOnPath: '/example/bin/program' });
    expect(runSetup([], setup.host)).toBe(0);
    expect(setup.output()).toContain(`${PRODUCT_NAMES.PROGRAM} is on your PATH (/example/bin/program)`);
    expect(readFileSync(join(homeDirectory, '.zshrc'), 'utf8')).toBe(EXAMPLE_RC_CONTENT);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describe('the Bun floor', () => {
  test('a Bun below .bun-version stops setup before anything is installed, and --instruct-only offers no upgrade', () => {
    const setup = recordedSetup({ bunVersions: [OLD_BUN_VERSION], answer: true });
    expect(runSetup(['--instruct-only'], setup.host)).toBe(1);
    expect(setup.bunCalls()).toEqual(['--version']);
    expect(setup.output()).toContain(`bun ${OLD_BUN_VERSION} is below ${PINNED_BUN_VERSION}, the version .bun-version pins`);
    expect(setup.output()).not.toContain('2/4');
  });

  test('a declined upgrade stops setup, and an upgrade that leaves Bun old stops it too', () => {
    const declined = recordedSetup({ bunVersions: [OLD_BUN_VERSION], answer: false });
    expect(runSetup([], declined.host)).toBe(1);
    expect(declined.bunCalls()).toEqual(['--version']);
    const stillOld = recordedSetup({ bunVersions: [OLD_BUN_VERSION], answer: true });
    expect(runSetup([], stillOld.host)).toBe(1);
    expect(stillOld.bunCalls()).toEqual(['--version', 'upgrade', '--version']);
  });

  testWhenGitIsPresent('an accepted upgrade that reaches the floor lets setup carry on', () => {
    const setup = recordedSetup({ bunVersions: [OLD_BUN_VERSION, PINNED_BUN_VERSION], answer: true });
    expect(runSetup([], setup.host), setup.output()).toBe(0);
    expect(setup.bunCalls()).toEqual(['--version', 'upgrade', '--version', 'install', 'link', 'build']);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describe('core.hooksPath', () => {
  testWhenGitIsPresent('a second run finds core.hooksPath set and leaves it', () => {
    const firstRun = recordedSetup();
    expect(runSetup([], firstRun.host)).toBe(0);
    expect(firstRun.output()).toContain('core.hooksPath set to .githooks (it was unset)');
    const secondRun = recordedSetup();
    expect(runSetup([], secondRun.host)).toBe(0);
    expect(secondRun.output()).toContain('core.hooksPath already points at .githooks');
    expect(hooksPathOfCheckout()).toBe('.githooks');
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  testWhenGitIsPresent('--instruct-only announces the change, leaves it unset, runs no install, link or build, and leaves the home as it was', () => {
    const setup = recordedSetup({ answer: true });
    expect(runSetup(['--instruct-only'], setup.host)).toBe(0);
    expect(setup.output()).toContain(`Would set core.hooksPath to .githooks in ${checkoutDirectory} (it is currently unset)`);
    expect(hooksPathOfCheckout()).toBe('');
    expect(setup.bunCalls()).toEqual(['--version']);
    expect(readdirSync(homeDirectory)).toEqual(['.zshrc']);
    expect(readFileSync(join(homeDirectory, '.zshrc'), 'utf8')).toBe(EXAMPLE_RC_CONTENT);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describe('the retired skill links', () => {
  testWhenGitIsPresent('a clean home gains nothing under ~/.claude', () => {
    const setup = recordedSetup();
    expect(runSetup([], setup.host)).toBe(0);
    expect(existsSync(join(homeDirectory, '.claude'))).toBe(false);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  testWhenGitIsPresent('a link that resolves into the checkout is removed and nothing takes its place', () => {
    for (const skillName of ['agent-progress', 'agent-progress-orchestrate']) mkdirSync(join(checkoutDirectory, 'skills', skillName), { recursive: true });
    mkdirSync(skillsFolder(), { recursive: true });
    symlinkSync(join(checkoutDirectory, 'skills', 'agent-progress'), join(skillsFolder(), 'agent-progress'));
    symlinkSync(join(checkoutDirectory, 'skills', 'agent-progress-orchestrate'), join(skillsFolder(), 'agent-progress-orchestrate'));
    const setup = recordedSetup();
    expect(runSetup([], setup.host)).toBe(0);
    expect(readdirSync(skillsFolder())).toEqual([]);
    expect(setup.output()).toContain(`Removed the retired skill link ${join(skillsFolder(), 'agent-progress')}`);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  testWhenGitIsPresent('a foreign link and a real folder at the skill paths stay, each with a warning', () => {
    const foreignSkillFolder = join(scratchDirectory, 'example-foreign-skill');
    mkdirSync(foreignSkillFolder);
    mkdirSync(join(skillsFolder(), 'agent-progress-orchestrate'), { recursive: true });
    writeFileSync(join(skillsFolder(), 'agent-progress-orchestrate', 'SKILL.md'), 'Alex Example\'s own skill\n');
    symlinkSync(foreignSkillFolder, join(skillsFolder(), 'agent-progress'));
    const setup = recordedSetup();
    expect(runSetup([], setup.host)).toBe(0);
    expect(readdirSync(skillsFolder()).sort()).toEqual(['agent-progress', 'agent-progress-orchestrate']);
    expect(readFileSync(join(skillsFolder(), 'agent-progress-orchestrate', 'SKILL.md'), 'utf8')).toBe('Alex Example\'s own skill\n');
    expect(setup.output()).toContain(`${join(skillsFolder(), 'agent-progress')} is a symlink to ${foreignSkillFolder}, not into this checkout — left untouched.`);
    expect(setup.output()).toContain(`${join(skillsFolder(), 'agent-progress-orchestrate')} is not a symlink setup made — left untouched.`);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

test('an unknown option or a flag without its value is refused with the usage line', () => {
  const unknown = recordedSetup();
  expect(runSetup(['--example'], unknown.host)).toBe(1);
  expect(unknown.output()).toContain('Unknown option: --example');
  const missingValue = recordedSetup();
  expect(runSetup(['--login-overseer'], missingValue.host)).toBe(1);
  expect(missingValue.output()).toStartWith('Usage: setup');
  expect(unknown.commands).toEqual([]);
});
