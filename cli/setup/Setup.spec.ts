/**
 * Machine setup runs in-process here under an injected host, so every platform's run is checked on one machine. Bun is a recorder: it
 * answers `--version` and writes what `build` would, and nothing else runs; git is a recorder of the one `core.hooksPath` key, which is
 * what makes the tracked pre-commit hook gate every worktree. The cases that matter: all four steps
 * run in order on macOS and on Windows; the Windows run puts Bun's bin folder on the User PATH through PowerShell and never names bash;
 * a launcher the rename cannot replace is a reported failure that leaves no partial file and stops no later step; a Bun below
 * `.bun-version` stops setup before anything is installed; --instruct-only writes nothing; and the retired skill links are removed only
 * when they resolve into the checkout.
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
import { SETUP_RECORDING }                                         from '../../src/testing/RecordedBoundaryCommands.ts';
import { recordedCommandOf }                                       from '../../src/testing/RecordedCommand.ts';
import { createCanonicalScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchWorkspace.ts';
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
let storedHooksPath: string | null = null;

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
  storedHooksPath = null;
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

/**
 * `git -C <checkout> config` for the one key setup reads and writes, answered as the real git answered under `bun run record cli/setup/`:
 * a read is answered in the situation of the key, unset until a write succeeded. An argv git was not recorded with fails the case.
 */
function recordedGit(command: readonly string[]): FinishedCommand {
  const recorded = recordedCommandOf(SETUP_RECORDING.BOUNDARY, { [SETUP_RECORDING.CHECKOUT_PLACEHOLDER]: checkoutDirectory });
  const readsTheKey = command.includes('--get');
  const keySituation = storedHooksPath === null ? SETUP_RECORDING.KEY_UNSET_SITUATION : SETUP_RECORDING.KEY_SET_SITUATION;
  const answer = recorded.answerTo(readsTheKey ? { argv: command, situation: keySituation } : { argv: command });
  if (answer.kind === 'spawn-failed') throw new Error(`git could not start: ${answer.code}`);
  if (!readsTheKey && answer.exitCode === 0) storedHooksPath = command.at(-1) ?? null;
  return { exitCode: answer.exitCode, output: `${answer.stdout}${answer.stderr}` };
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
    systemFolder:        () => undefined,
    run:                 (command, workingDirectory) => {
      commands.push([...command]);
      expect(workingDirectory).toBe(command[0] === 'powershell.exe' ? homeDirectory : checkoutDirectory);
      if (command[0] === 'git') return recordedGit(command);
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
  return storedHooksPath ?? '';
}

function skillsFolder(): string {
  return join(homeDirectory, '.claude', 'skills');
}

describe('the four steps on each platform', () => {
  test('on macOS setup checks Bun, installs, links and compiles the launcher, offers the shell startup file, and sets core.hooksPath', () => {
    const setup = recordedSetup({ answer: true });
    expect(runSetup([], setup.host), setup.output()).toBe(0);
    expect(setup.bunCalls()).toEqual(['--version', 'install', 'link', 'build']);
    expect(readFileSync(join(scratchDirectory, 'bun-install', 'bin', PRODUCT_NAMES.PROGRAM), 'utf8')).toBe('compiled launcher');
    expect(readFileSync(join(homeDirectory, '.zshrc'), 'utf8')).toBe(`${EXAMPLE_RC_CONTENT}\nexport PATH="${join(scratchDirectory, 'bun-install', 'bin')}:$PATH"\n`);
    expect(hooksPathOfCheckout()).toBe('.githooks');
    const headings = ['1/4 Bun', '2/4 Dependencies', '3/4 Retire', '4/4 The pre-commit hook'].map((heading) => setup.output().indexOf(heading));
    expect(headings.every((position, index) => position >= 0 && (index === 0 || position > (headings[index - 1] ?? 0)))).toBe(true);
  });

  test('on Windows setup compiles an .exe launcher and writes the User PATH through PowerShell, never naming bash or a startup file', () => {
    const setup = recordedSetup({ platform: 'win32', answer: true });
    expect(runSetup([], setup.host), setup.output()).toBe(0);
    expect(setup.bunCalls()).toEqual(['--version', 'install', 'link', 'build']);
    expect(readdirSync(join(scratchDirectory, 'bun-install', 'bin')).sort()).toEqual([`${PRODUCT_NAMES.PROGRAM}.exe`, 'bun'].sort());
    const userPathCommand = setup.commands.find((command) => command[0] === 'powershell.exe');
    expect(userPathCommand?.at(-1)).toContain('SetEnvironmentVariable(\'Path\'');
    expect(userPathCommand?.at(-1)).toContain(`'${join(scratchDirectory, 'bun-install', 'bin')}'`);
    expect(userPathCommand?.at(-1)).toContain('\'User\')');
    expect(setup.output()).toContain('to your User PATH — takes effect in new terminals');
    expect(JSON.stringify(setup.commands)).not.toContain('bash');
    expect(setup.output()).not.toContain('bash');
    expect(readFileSync(join(homeDirectory, '.zshrc'), 'utf8')).toBe(EXAMPLE_RC_CONTENT);
    expect(hooksPathOfCheckout()).toBe('.githooks');
  });

  test('on Windows a declined offer runs no PowerShell and says how to run the program', () => {
    const setup = recordedSetup({ platform: 'win32', answer: false });
    expect(runSetup([], setup.host)).toBe(0);
    expect(setup.commands.some((command) => command[0] === 'powershell.exe')).toBe(false);
    expect(setup.output()).toContain('or add');
  });

  test('a launcher that cannot be replaced, as a running command holds it on Windows, is reported, and setup removes the partial and goes on', () => {
    const binFolder = join(scratchDirectory, 'bun-install', 'bin');
    // A folder with content at the launcher's path refuses the rename on every OS, as a running .exe refuses it on Windows.
    mkdirSync(join(binFolder, `${PRODUCT_NAMES.PROGRAM}.exe`, 'held'), { recursive: true });
    const setup = recordedSetup({ platform: 'win32', answer: false });
    expect(runSetup([], setup.host), setup.output()).toBe(0);
    expect(setup.output()).toContain(`${join(binFolder, `${PRODUCT_NAMES.PROGRAM}.exe`)} could not be replaced`);
    expect(readdirSync(binFolder).sort()).toEqual([`${PRODUCT_NAMES.PROGRAM}.exe`, 'bun'].sort());
    expect(hooksPathOfCheckout()).toBe('.githooks');
  });

  test('a program already on the search path is reported, and no search path offer is made', () => {
    const setup = recordedSetup({ answer: true, programOnPath: '/example/bin/program' });
    expect(runSetup([], setup.host)).toBe(0);
    expect(setup.output()).toContain(`${PRODUCT_NAMES.PROGRAM} is on your PATH (/example/bin/program)`);
    expect(readFileSync(join(homeDirectory, '.zshrc'), 'utf8')).toBe(EXAMPLE_RC_CONTENT);
  });
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

  test('an accepted upgrade that reaches the floor lets setup carry on', () => {
    const setup = recordedSetup({ bunVersions: [OLD_BUN_VERSION, PINNED_BUN_VERSION], answer: true });
    expect(runSetup([], setup.host), setup.output()).toBe(0);
    expect(setup.bunCalls()).toEqual(['--version', 'upgrade', '--version', 'install', 'link', 'build']);
  });
});

describe('core.hooksPath', () => {
  test('a second run finds core.hooksPath set and leaves it', () => {
    const firstRun = recordedSetup();
    expect(runSetup([], firstRun.host)).toBe(0);
    expect(firstRun.output()).toContain('core.hooksPath set to .githooks (it was unset)');
    const secondRun = recordedSetup();
    expect(runSetup([], secondRun.host)).toBe(0);
    expect(secondRun.output()).toContain('core.hooksPath already points at .githooks');
    expect(hooksPathOfCheckout()).toBe('.githooks');
  });

  test('--instruct-only announces the change, leaves it unset, runs no install, link or build, and leaves the home as it was', () => {
    const setup = recordedSetup({ answer: true });
    expect(runSetup(['--instruct-only'], setup.host)).toBe(0);
    expect(setup.output()).toContain(`Would set core.hooksPath to .githooks in ${checkoutDirectory} (it is currently unset)`);
    expect(hooksPathOfCheckout()).toBe('');
    expect(setup.bunCalls()).toEqual(['--version']);
    expect(readdirSync(homeDirectory)).toEqual(['.zshrc']);
    expect(readFileSync(join(homeDirectory, '.zshrc'), 'utf8')).toBe(EXAMPLE_RC_CONTENT);
  });
});

describe('the retired skill links', () => {
  test('a clean home gains nothing under ~/.claude', () => {
    const setup = recordedSetup();
    expect(runSetup([], setup.host)).toBe(0);
    expect(existsSync(join(homeDirectory, '.claude'))).toBe(false);
  });

  test('a link that resolves into the checkout is removed and nothing takes its place', () => {
    for (const skillName of ['agent-progress', 'agent-progress-orchestrate']) mkdirSync(join(checkoutDirectory, 'skills', skillName), { recursive: true });
    mkdirSync(skillsFolder(), { recursive: true });
    symlinkSync(join(checkoutDirectory, 'skills', 'agent-progress'), join(skillsFolder(), 'agent-progress'));
    symlinkSync(join(checkoutDirectory, 'skills', 'agent-progress-orchestrate'), join(skillsFolder(), 'agent-progress-orchestrate'));
    const setup = recordedSetup();
    expect(runSetup([], setup.host)).toBe(0);
    expect(readdirSync(skillsFolder())).toEqual([]);
    expect(setup.output()).toContain(`Removed the retired skill link ${join(skillsFolder(), 'agent-progress')}`);
  });

  test('a foreign link and a real folder at the skill paths stay, each with a warning', () => {
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
  });
});

describe('--login-overseer where no login item would run', () => {
  const REFUSING_HOSTS: readonly { readonly name: string; readonly choices: HostChoices; readonly reason: string }[] = [
    { name: 'a platform with no Autostart adapter', choices: { platform: 'freebsd' }, reason: 'No login item is known for this operating system' },
    { name: 'Linux with no systemctl on PATH', choices: { platform: 'linux', programOnPath: null }, reason: 'no systemctl is on PATH' },
    { name: 'Windows with no SystemRoot', choices: { platform: 'win32' }, reason: 'SystemRoot is not an absolute folder' },
  ];
  for (const { name, choices, reason } of REFUSING_HOSTS) {
    test(`${name} exits 1, says why, prints no success and writes nothing`, () => {
      const repository = join(scratchDirectory, 'example-storefront');
      mkdirSync(repository);
      const homeBefore = readdirSync(homeDirectory, { recursive: true });
      const setup = recordedSetup(choices);
      expect(runSetup(['--login-overseer', repository], setup.host)).toBe(1);
      expect(setup.output()).toContain(reason);
      expect(setup.output()).not.toContain('✔');
      expect(readdirSync(homeDirectory, { recursive: true })).toEqual(homeBefore);
      expect(setup.commands).toEqual([]);
    });
  }
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
