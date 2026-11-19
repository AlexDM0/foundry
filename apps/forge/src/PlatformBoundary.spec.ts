/**
 * The core names a port, never a platform: no shipping line outside an adapter reads the platform or names a platform primitive. The scan
 * first proves it saw the tree and that adapters really hold the forms, the allowlist is exact both ways (an entry a later ticket removes
 * names that ticket's mechanism), and each form is planted once. Adapters are recognised by exact file-name shapes, never by folder, and
 * `EXACT_SITE_FORMS` take no adapter exemption at all. Comments, specs and testing folders are not scanned.
 */
import { describe, expect, test } from 'bun:test';

import { repositoryRootOfThisCheckout }                                       from './testing/ImportGraph.ts';
import { memoisedPerSource, programTypeScriptSources, type RepositorySource } from './testing/RepositorySources.ts';

type PlatformForm =
  | 'process-platform'
  | 'platform-property'
  | 'platform-import'
  | 'platform-name'
  | 'sandbox-exec'
  | 'process-group-kill'
  | 'proc-filesystem'
  | 'bin-folder'
  | 'usr-bin-folder'
  | 'usr-sbin-folder'
  | 'temporary-folder'
  | 'socket-file'
  | 'pipe-name'
  | 'bourne-shell-path'
  | 'mode-change'
  | 'search-path-separator'
  | 'detached-spawn'
  | 'unhidden-spawn';

interface BoundaryReport {
  /** `<path>: <form>: <trimmed line>`, one per scanned occurrence the allowlist does not hold. */
  readonly violations:       readonly string[];
  readonly unusedAllowances: readonly string[];
}

const PLATFORM_FORM_PATTERNS: Readonly<Record<PlatformForm, readonly RegExp[]>> = {
  'process-platform':      [/\bprocess\s*(?:\.\s*|\[\s*['"`])platform\b/, /\{[^}]*\bplatform\b[^}]*\}\s*=\s*process\b/],
  'platform-property':     [/(?<!\bprocess\s*)\.platform\b/, /\{[^}]*\bplatform\b[^}]*\}\s*=\s*(?!process\b)\w/],
  'platform-import':       [/\{[^}]*\bplatform\b[^}]*\}\s*from\s*['"](?:node:)?(?:os|process)['"]/],
  'platform-name':         [/(['"`])(?:win32|darwin|linux)\1/],
  'sandbox-exec':          [/\bsandbox-exec\b/],
  'process-group-kill':    [/\bprocess\.kill\(\s*-/],
  'proc-filesystem':       [/\/proc\//],
  'bin-folder':            [/(?<![\w.]|\/usr)\/s?bin(?:\/(?!sh\b)|['"`:])/, /\/(?:usr\/local|opt\/\w+)\/s?bin\b/],
  'usr-bin-folder':        [/\/usr\/bin\b/],
  'usr-sbin-folder':       [/\/usr\/sbin\b/],
  'temporary-folder':      [/\/tmp\b/],
  'socket-file':           [/\.sock\b/],
  'pipe-name':             [/\\\\\.\\+pipe\b/, /\/\/\.\/pipe\b/],
  'bourne-shell-path':     [/\/bin\/sh\b/],
  'mode-change':           [/\bchmodSync\b/],
  'search-path-separator': [
    /\w*PATH\w*SEPARATOR\w*\s*=\s*['"][:;]['"]/,
    /\.(?:split|join)\(\s*['"][:;]['"]\s*\)/,
    /[:;]\$\{[^}]*\bPATH\b/,
    /\$\{[^}]*\bPATH\b[^}]*\}[:;]/,
  ],
  'detached-spawn': [/\bdetached:/],
  // A whole spawn call spans lines, so `unhiddenSpawnLinesIn` finds this form.
  'unhidden-spawn': [],
};

const PLATFORM_FORMS = Object.keys(PLATFORM_FORM_PATTERNS) as PlatformForm[];

/** Confined to named lines: an adapter's file name exempts it from neither. */
const EXACT_SITE_FORMS: readonly PlatformForm[] = ['process-platform', 'mode-change'];

const ADAPTER_FILE_PATTERN = /^src\/lib\/.+\/(?:(?:Darwin|Linux|Windows|Posix)[A-Z]\w*|[A-Z]\w*For)\.ts$/;

/** A selector kept beside its only consumer, outside `src/lib/`. */
const ADAPTER_FILES_OUTSIDE_LIB: readonly string[] = [
  'cli/OpenerFor.ts',
  'cli/setup/SetupPlatformFor.ts',
  'cli/setup/PosixSetupPlatform.ts',
  'cli/setup/WindowsSetupPlatform.ts',
  'cli/setup/AutostartFor.ts',
  'src/services/overseer/HeldSlotCreateFor.ts',
];

/** `<path>: <form>: <trimmed line>`, each with the reason it stays. */
const ALLOWED_PLATFORM_LINES: Readonly<Record<string, string>> = {
  'cli/CommandContext.ts: process-platform: if (!fakeAgentIsOn()) return claudeCodeAdapterFor(process.platform, agentVariableOf);':
    'The composition root hands the platform to the vendor adapter\'s selector.',
  'cli/CommandContext.ts: process-platform: const platformPorts = platformPortsFor(process.platform, PLATFORM_HOST_FACTS);':
    'The composition root builds the port record.',
  'cli/CommandContext.ts: process-platform: platform:                process.platform,':
    'The composition root carries the platform, so a spec can choose it.',
  'talos.ts: process-platform: process.exit(await runTalos(Bun.argv.slice(2), clock, process.platform, process.env[\'SystemRoot\'], ownVariableOf));':
    'Talos has no CommandContext; its binary is its composition root.',
  'src/lib/talos/SynchronousCallsThread.ts: platform-property: supervision = processSupervisionFor(request.platform, request.systemRoot ?? undefined);':
    'A worker has no context; the start message carries the platform from Talos, and the thread hands it straight to the selector.',
  'src/lib/talos/SynchronousCallsThread.ts: platform-property: localEndpoint = localEndpointFor(request.platform, \'\');':
    'The same start message gives the endpoint selector the platform, so the endpoint is prepared and released on the thread.',
  'setup.ts: process-platform: platform: process.platform, checkoutDirectory: import.meta.dir, homeDirectory: homedir(), runningBun: process.execPath':
    'Machine setup runs before any CommandContext exists; its entry is its composition root.',
  'cli/setup/Setup.ts: platform-property: host, platform: setupPlatformFor(host.platform), report, instructOnly':
    'Hands the host\'s platform straight to the selector and decides nothing on it.',
  'cli/setup/LoginOverseer.ts: platform-property: const autostart = autostartFor(host.platform, autostartPrimitivesOf(host));':
    'Hands the host\'s platform straight to the Autostart selector and decides nothing on it.',
  'src/lib/atomic-file/FileReplaceFor.ts: process-platform: return fileReplaceFor(process.platform);':
    'Lib writes have no context, so this selector reads the platform at call time.',
  'src/services/overseer/HeldSlotCreateFor.ts: process-platform: return heldSlotCreateMeansTakenFor(process.platform);':
    'The gate slots have no context, as the FileReplace port they create through, so this selector reads the platform at call time.',
  'cli/setup/login-item/LoginItemCommand.ts: platform-property: const autostart = autostartFor(host.platform, autostartPrimitivesOf(host));':
    'Hands the host\'s platform straight to the Autostart selector and decides nothing on it.',
  'cli/setup/login-item/LoginItemCommand.ts: platform-property: platform:          context.platform as NodeJS.Platform,':
    'Hands the context\'s platform to the setup host the Autostart selector reads, and decides nothing on it.',
  'cli/OpenInTheDefaultBrowser.ts: platform-property: const opener = openerFor(context.platform, () => context.platformPorts.dataFolders.systemFolder());':
    'Hands the context\'s platform straight to the selector and decides nothing on it.',
  'cli/OpenInTheDefaultBrowser.ts: detached-spawn: detached:    opener.detach,':
    'Takes the detach answer of the Opener port and decides nothing on it.',
  'src/lib/tracker-model/utils/NetworkDomainUtil.ts: search-path-separator: const [firstGroup = \'\'] = address.split(\':\');':
    'Splits an IPv6 address into its groups; no search path is involved.',
  'src/lib/process-identity/ProcessSupervision.ts: detached-spawn: readonly detached:     boolean;':
    'The port\'s type, not a spawn.',
  'src/lib/process-identity/UnsupportedProcessSupervision.ts: detached-spawn: spawnOptionsFor:      () => ({ detached: false }),':
    'The answer for a platform with no adapter; the guard reads this name as no adapter.',
  'src/lib/owner-only-files/PosixOwnerOnlyFiles.ts: mode-change: import { chmodSync, mkdirSync, statSync } from \'node:fs\';':
    'The real primitive the POSIX adapter of the OwnerOnlyFiles port runs on.',
  'src/lib/owner-only-files/PosixOwnerOnlyFiles.ts: mode-change: changeMode: chmodSync,':
    'The same primitive.',
};

const ALLOWED_LINES = Object.keys(ALLOWED_PLATFORM_LINES);

function isShippingCode(path: string): boolean {
  return !/\.spec\.tsx?$|\.dom\.tsx$/.test(path) && !path.startsWith('testing/') && !path.includes('/testing/');
}

function isPlatformAdapter(path: string): boolean {
  return ADAPTER_FILE_PATTERN.test(path) || ADAPTER_FILES_OUTSIDE_LIB.includes(path);
}

function isCommentLine(line: string): boolean {
  return ['//', '/*', '*', '#!'].some((marker) => line.startsWith(marker));
}

function formsNamedBy(line: string): PlatformForm[] {
  return PLATFORM_FORMS.filter((form) => PLATFORM_FORM_PATTERNS[form].some((pattern) => pattern.test(line)));
}

/** A bare name or Bun's, so a regular expression's `.exec(` is no spawn. */
const SPAWN_CALL_PATTERN = /(?:\bBun\.|(?<![\w.]))(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\(/g;

const HIDES_ITS_WINDOW_PATTERN = /\bwindowsHide:\s*true\b|[sS]pawnOptions/;

/** The call's text up to its closing bracket; a bracket inside a string only ends the text early or late, never skips the call. */
function callTextFrom(text: string, openingBracketIndex: number): string {
  let depth = 0;
  for (let i = openingBracketIndex; i < text.length; i++) {
    if (text[i] === '(') depth += 1;
    if (text[i] === ')') depth -= 1;
    if (depth === 0) return text.slice(openingBracketIndex, i);
  }
  return text.slice(openingBracketIndex);
}

function spawnCallsIn(text: string): readonly { firstLine: string; callText: string }[] {
  const codeText = text.split('\n').map((line) => line.trim()).filter((line) => !isCommentLine(line)).join('\n');
  return [...codeText.matchAll(SPAWN_CALL_PATTERN)].map((match) => {
    const firstLineStart = codeText.lastIndexOf('\n', match.index) + 1;
    const firstLineEnd   = codeText.indexOf('\n', match.index);
    return {
      firstLine: codeText.slice(firstLineStart, firstLineEnd === -1 ? codeText.length : firstLineEnd),
      callText:  callTextFrom(codeText, match.index + match[0].length - 1),
    };
  });
}

/** Every shipping spawn call that neither takes the port's options nor names `windowsHide`; no adapter is exempt, a console program runs from one too. */
function unhiddenSpawnLinesIn(source: RepositorySource): string[] {
  return spawnCallsIn(source.text)
    .filter(({ callText }) => !HIDES_ITS_WINDOW_PATTERN.test(callText))
    .map(({ firstLine }) => `${source.path}: unhidden-spawn: ${firstLine}`);
}

const formLinesOfSource = memoisedPerSource((source): readonly string[] => [
  ...source.text.split('\n')
    .map((line) => line.trim())
    .filter((line) => !isCommentLine(line))
    .flatMap((line) => formsNamedBy(line)
      .filter((form) => EXACT_SITE_FORMS.includes(form) || !isPlatformAdapter(source.path))
      .map((form) => `${source.path}: ${form}: ${line}`)),
  ...unhiddenSpawnLinesIn(source),
]);

/** Every form on every code line of the shipping files, those a file's adapter name exempts left out. */
function formLinesIn(sources: readonly RepositorySource[]): string[] {
  return sources.filter((source) => isShippingCode(source.path)).flatMap(formLinesOfSource);
}

function boundaryReportOf(sources: readonly RepositorySource[], allowedLines: readonly string[]): BoundaryReport {
  const found = formLinesIn(sources);
  return {
    violations:       found.filter((line, index) => !allowedLines.includes(line) || found.indexOf(line) !== index),
    unusedAllowances: allowedLines.filter((line) => !found.includes(line)),
  };
}

function violationsOfPlanted(path: string, plantedLine: string): readonly string[] {
  return boundaryReportOf([{ path, text: `${plantedLine}\n` }], []).violations;
}

const SOURCES = programTypeScriptSources(repositoryRootOfThisCheckout());

describe('the scan saw the tree', () => {
  const shippingPaths = SOURCES.map((source) => source.path).filter(isShippingCode);

  test('it reads the whole shipping tree and skips the specs', () => {
    expect(shippingPaths.length).toBeGreaterThan(400);
    expect(SOURCES.length).toBeGreaterThan(shippingPaths.length);
    expect(shippingPaths).toEqual(expect.arrayContaining([
      'agent-progress.ts', 'talos.ts', 'cli/CommandContext.ts', 'src/services/lifecycle/GateRun.ts', 'bridge/Main.tsx',
    ]));
    expect(shippingPaths).not.toContain('src/PlatformBoundary.spec.ts');
  });

  test('it recognises the adapters, and the forms it looks for really stand in them', () => {
    const adapters = SOURCES.filter((source) => isPlatformAdapter(source.path));
    expect(adapters.map((source) => source.path)).toEqual(expect.arrayContaining([
      'cli/OpenerFor.ts', 'src/lib/gate-confinement/DarwinSeatbelt.ts', 'src/lib/shell-line/ShellLineFor.ts', 'src/lib/talos/PosixSocketEndpoint.ts',
    ]));
    const formsInAdapters = new Set(adapters.flatMap((source) => source.text.split('\n').flatMap(formsNamedBy)));
    expect([...formsInAdapters]).toEqual(expect.arrayContaining([
      'platform-name', 'sandbox-exec', 'proc-filesystem', 'bin-folder', 'usr-bin-folder', 'usr-sbin-folder', 'temporary-folder', 'socket-file', 'bourne-shell-path',
    ]));
  });

  test('every shipping line naming a form is allowlisted, and every allowlist entry is found', () => {
    expect(boundaryReportOf(SOURCES, ALLOWED_LINES)).toEqual({ violations: [], unusedAllowances: [] });
  });

  test('the spawn scan finds every production spawn site, the port\'s and the plain windowsHide ones', () => {
    const spawnSites = SOURCES.filter((source) => isShippingCode(source.path) && spawnCallsIn(source.text).length > 0).map((source) => source.path);
    expect([...spawnSites].sort()).toEqual([
      'cli/OpenInTheDefaultBrowser.ts',
      'cli/overseer/OverseerForeground.ts',
      'cli/overseer/OverseerRemote.ts',
      'cli/setup/ProcessSetupHost.ts',
      'launcher.ts',
      'src/lib/gate-confinement/GateConfinementFor.ts',
      'src/lib/git/GitProcess.ts',
      'src/lib/owner-only-files/WindowsOwnerOnlyFiles.ts',
      'src/lib/process-identity/ProcessSupervisionFor.ts',
      'src/lib/talos/Talos.ts',
      'src/services/overseer/GpgDirectories.ts',
      'src/services/overseer/InstallChangeWatch.ts',
      'src/services/overseer/TalosStart.ts',
    ]);
  });
});

describe('the allowlist is exact both ways', () => {
  const removedEntry = ALLOWED_LINES[0] ?? '';

  test('removing an entry leaves its line a violation', () => {
    expect(boundaryReportOf(SOURCES, ALLOWED_LINES.slice(1))).toEqual({ violations: [removedEntry], unusedAllowances: [] });
  });

  test('an entry nothing uses is named', () => {
    const unusedEntry = 'src/Planted.ts: platform-name: const name = \'linux\';';
    expect(boundaryReportOf(SOURCES, [...ALLOWED_LINES, unusedEntry])).toEqual({ violations: [], unusedAllowances: [unusedEntry] });
  });

  test('a second copy of an allowed line in its own file is a violation', () => {
    const allowedEntry = 'src/lib/process-identity/ProcessSupervision.ts: detached-spawn: detached: true,';
    const doubledSite = { path: 'src/lib/process-identity/ProcessSupervision.ts', text: 'detached: true,\ndetached: true,\n' };
    expect(boundaryReportOf([doubledSite], [allowedEntry])).toEqual({ violations: [allowedEntry], unusedAllowances: [] });
  });

  test('an allowed line in another file of its folder is a violation', () => {
    const allowedEntry = 'src/lib/process-identity/ProcessSupervision.ts: detached-spawn: detached: true,';
    const plantedCopy = { path: 'src/services/lifecycle/PlantedRun.ts', text: 'detached: true,\n' };
    expect(boundaryReportOf([plantedCopy], [allowedEntry])).toEqual({
      violations:       ['src/services/lifecycle/PlantedRun.ts: detached-spawn: detached: true,'],
      unusedAllowances: [allowedEntry],
    });
  });
});

describe('the guard names each form, planted in memory', () => {
  const plantedPath = 'src/services/overseer/Planted.ts';

  const plantedForms: readonly (readonly [string, string, readonly PlatformForm[]])[] = [
    ['process.platform', 'const platform = process.platform;', ['process-platform']],
    ['process.platform by key', 'const platform = process[\'platform\'];', ['process-platform']],
    ['a .platform read outside a selector', 'const platform = context.platform;', ['platform-property']],
    ['a .platform read destructured', 'const { platform } = context;', ['platform-property']],
    ['the platform imported', 'import { platform } from \'node:os\';', ['platform-import']],
    ['\'win32\'', 'if (name === \'win32\') stop();', ['platform-name']],
    ['\'darwin\'', 'if (name === \'darwin\') stop();', ['platform-name']],
    ['\'linux\'', 'if (name === \'linux\') stop();', ['platform-name']],
    ['sandbox-exec', 'const program = \'sandbox-exec\';', ['sandbox-exec']],
    ['process.kill(-', 'process.kill(-groupId, \'SIGTERM\');', ['process-group-kill']],
    ['/proc/', 'const status = readFileSync(\'/proc/self/status\');', ['proc-filesystem']],
    ['/bin/', 'const program = \'/bin/ps\';', ['bin-folder']],
    ['/sbin/', 'const program = \'/sbin/ping\';', ['bin-folder']],
    ['/usr/local/bin/', 'const program = \'/usr/local/bin/brew\';', ['bin-folder']],
    ['/opt/homebrew/bin/', 'const program = \'/opt/homebrew/bin/brew\';', ['bin-folder']],
    ['/usr/bin/', 'const program = \'/usr/bin/true\';', ['usr-bin-folder']],
    ['/usr/sbin/', 'const program = \'/usr/sbin/sysctl\';', ['usr-sbin-folder']],
    ['/tmp', 'const scratch = \'/tmp\';', ['temporary-folder']],
    ['a .sock path', 'const endpoint = `${folder}/${name}.sock`;', ['socket-file']],
    ['an escaped pipe name', 'const endpoint = \'\\\\\\\\.\\\\pipe\\\\talos\';', ['pipe-name']],
    ['a forward-slash pipe name', 'const endpoint = \'//./pipe/talos\';', ['pipe-name']],
    ['\'/bin/sh\'', 'const shell = \'/bin/sh\';', ['bourne-shell-path']],
    ['chmodSync', 'chmodSync(path, mode);', ['mode-change']],
    ['a search-path separator constant', 'const SEARCH_PATH_SEPARATOR = \':\';', ['search-path-separator']],
    ['a literal split', 'const folders = searchPath.split(\':\');', ['search-path-separator']],
    ['a literal join', 'const searchPath = folders.join(\';\');', ['search-path-separator']],
    ['a folder prepended by hand', 'const searchPath = `${folder}:${environment.PATH}`;', ['search-path-separator']],
    ['a folder appended by hand', 'const searchPath = `${environment.PATH}:${folder}`;', ['search-path-separator']],
    ['a literal search path', 'const searchPath = \'/usr/sbin:/usr/bin:/bin\';', ['bin-folder', 'usr-bin-folder', 'usr-sbin-folder']],
    ['the platform destructured', 'const { platform } = process;', ['process-platform']],
    ['detached: true', 'const options = { detached: true };', ['detached-spawn']],
    ['detached: false', 'spawn(argv, { detached: false, windowsHide: true });', ['detached-spawn']],
    ['Bun.spawn with no hide option', 'const child = Bun.spawn([\'git\'], { stdin: \'ignore\' });', ['unhidden-spawn']],
    ['Bun.spawnSync with no options', 'const child = Bun.spawnSync([\'git\']);', ['unhidden-spawn']],
    ['node spawn with no hide option', 'const child = spawn(\'git\', []);', ['unhidden-spawn']],
    ['execFileSync with no hide option', 'execFileSync(\'git\', []);', ['unhidden-spawn']],
  ];

  test.each(plantedForms)('%s', (_formName, plantedLine, expectedForms) => {
    expect(violationsOfPlanted(plantedPath, plantedLine)).toEqual(expectedForms.map((form) => `${plantedPath}: ${form}: ${plantedLine}`));
  });

  test('every form is planted above', () => {
    expect([...new Set(plantedForms.flatMap(([, , forms]) => forms))].sort()).toEqual([...PLATFORM_FORMS].sort());
  });
});

describe('the spawn scan reads a whole call', () => {
  const plantedPath = 'src/services/overseer/Planted.ts';

  test('a call over several lines counts, named by its first line', () => {
    const plantedCall = 'const child = Bun.spawn({\n  cmd: [\'git\'],\n  stdout: \'pipe\',\n});';
    expect(violationsOfPlanted(plantedPath, plantedCall)).toEqual([`${plantedPath}: unhidden-spawn: const child = Bun.spawn({`]);
  });

  test('the plain option or the port\'s options pass, anywhere in the call', () => {
    expect(violationsOfPlanted(plantedPath, 'Bun.spawn({\n  cmd: [\'git\'],\n  windowsHide: true,\n});')).toEqual([]);
    expect(violationsOfPlanted(plantedPath, 'Bun.spawn({ cmd, ...supervision.spawnOptionsFor(\'supervised-child\') });')).toEqual([]);
    expect(violationsOfPlanted(plantedPath, 'Bun.spawn({ cmd, ...spawnOptions });')).toEqual([]);
  });

  test('a hide option turned off does not count', () => {
    expect(violationsOfPlanted(plantedPath, 'Bun.spawn({ cmd, windowsHide: false });')).toEqual([`${plantedPath}: unhidden-spawn: Bun.spawn({ cmd, windowsHide: false });`]);
  });

  test('a hide option past the end of the call does not count', () => {
    expect(violationsOfPlanted(plantedPath, 'Bun.spawn([\'git\']);\nconst windowsHide = true;')).toEqual([`${plantedPath}: unhidden-spawn: Bun.spawn(['git']);`]);
  });

  test('an adapter is judged too, and a spawn in a comment or a word ending in spawn is not', () => {
    const adapterPath = 'src/lib/data-folders/WindowsDataFolders.ts';
    expect(violationsOfPlanted(adapterPath, 'Bun.spawn([\'git\']);')).toEqual([`${adapterPath}: unhidden-spawn: Bun.spawn(['git']);`]);
    expect(violationsOfPlanted(plantedPath, '// Bun.spawn([\'git\']);')).toEqual([]);
    expect(violationsOfPlanted(plantedPath, 'function respawn() {}\nconst value = request.respawn();')).toEqual([]);
  });
});

/** A Linux or Windows adapter; a POSIX one runs on Linux too. A selector is not one: the composition root's spec proves each reachable. */
const CONTRACTED_ADAPTER_PATTERN = /^(?:src|cli)\/.*\/(?:Linux|Windows|Posix)[A-Z]\w*\.ts$/;

const CONTRACT_SPEC_PATTERN = /\.contract(?:\.[\w-]+)?\.spec\.ts$/;

/** An adapter no contract can run on fakes, each with the reason. */
const UNCONTRACTED_ADAPTERS: Readonly<Record<string, string>> = {
  'src/lib/process-identity/WindowsKernelProcessApi.ts':
    'The kernel32 binding itself: the fake kernel of `src/testing/FakeWindowsKernel.ts` stands in for it in the contract, and only a Windows run reaches it.',
};

interface ContractReport {
  readonly unnamedAdapters:  readonly string[];
  readonly unusedAllowances: readonly string[];
}

function baseNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.ts$/, '');
}

/** An import of the file or a subject's quoted name, on a code line; a comment names nothing. */
function contractNames(contractText: string, adapterName: string): boolean {
  const namingPattern = new RegExp(`['"\`][^'"\`\\n]*\\b${adapterName}\\b`);
  return contractText.split('\n').some((line) => !isCommentLine(line.trim()) && namingPattern.test(line));
}

function contractReportOf(sources: readonly RepositorySource[], allowedAdapters: readonly string[]): ContractReport {
  const contracts = sources.filter((source) => CONTRACT_SPEC_PATTERN.test(source.path));
  const adapters = sources.map((source) => source.path).filter((path) => isShippingCode(path) && CONTRACTED_ADAPTER_PATTERN.test(path));
  const unnamed = adapters.filter((adapter) => !contracts.some((contract) => contractNames(contract.text, baseNameOf(adapter))));
  return {
    unnamedAdapters:  unnamed.filter((adapter) => !allowedAdapters.includes(adapter)),
    unusedAllowances: allowedAdapters.filter((adapter) => !unnamed.includes(adapter)),
  };
}

describe('every Linux and Windows adapter is named by a contract spec', () => {
  const allowedAdapters = Object.keys(UNCONTRACTED_ADAPTERS);

  test('the scan sees the contracts and the adapters of both platforms', () => {
    expect(SOURCES.filter((source) => CONTRACT_SPEC_PATTERN.test(source.path)).length).toBeGreaterThan(10);
    expect(SOURCES.map((source) => source.path).filter((path) => isShippingCode(path) && CONTRACTED_ADAPTER_PATTERN.test(path))).toEqual(expect.arrayContaining([
      'cli/setup/LinuxAutostart.ts', 'cli/setup/WindowsSetupPlatform.ts', 'src/lib/gate-confinement/LinuxBubblewrap.ts', 'src/lib/shell-line/WindowsCommandLine.ts',
    ]));
  });

  test('every adapter is named, and every allowance is still needed', () => {
    expect(contractReportOf(SOURCES, allowedAdapters)).toEqual({ unnamedAdapters: [], unusedAllowances: [] });
  });

  test('an adapter file no contract names fails, and so does one only a comment or a plain spec names', () => {
    const plantedAdapter = { path: 'src/lib/talos/LinuxPlantedEndpoint.ts', text: 'export const planted = 1;\n' };
    const commentOnly = { path: 'src/lib/talos/Planted.contract.spec.ts', text: '// LinuxPlantedEndpoint\n' };
    const plainSpec = { path: 'src/lib/talos/LinuxPlantedEndpoint.spec.ts', text: 'import { planted } from \'./LinuxPlantedEndpoint.ts\';\n' };
    expect(contractReportOf([...SOURCES, plantedAdapter, commentOnly, plainSpec], allowedAdapters).unnamedAdapters).toEqual([plantedAdapter.path]);
  });

  test('an import or a subject name in a contract names it', () => {
    const plantedAdapter = { path: 'src/lib/talos/WindowsPlantedEndpoint.ts', text: 'export const planted = 1;\n' };
    const importingContract = { path: 'src/lib/talos/Planted.contract.spec.ts', text: 'import { planted } from \'./WindowsPlantedEndpoint.ts\';\n' };
    const namingContract = { path: 'src/lib/talos/Planted.contract.spec.ts', text: '{ name: \'WindowsPlantedEndpoint over a fake pipe\', build },\n' };
    expect(contractReportOf([...SOURCES, plantedAdapter, importingContract], allowedAdapters).unnamedAdapters).toEqual([]);
    expect(contractReportOf([...SOURCES, plantedAdapter, namingContract], allowedAdapters).unnamedAdapters).toEqual([]);
  });

  test('an allowance for an adapter a contract names is reported unused', () => {
    const namedAdapter = 'src/lib/shell-line/WindowsCommandLine.ts';
    expect(contractReportOf(SOURCES, [...allowedAdapters, namedAdapter]).unusedAllowances).toEqual([namedAdapter]);
  });
});

describe('what the boundary exempts is exact', () => {
  const pipeLine = 'const endpoint = \'//./pipe/talos\';';

  test('an adapter or a selector under src/lib may name a primitive', () => {
    for (const fileName of ['WindowsPipeEndpoint', 'LinuxEndpoint', 'DarwinEndpoint', 'PosixEndpoint', 'EndpointFor']) {
      expect(violationsOfPlanted(`src/lib/talos/${fileName}.ts`, pipeLine)).toEqual([]);
    }
  });

  test('a core file in an adapter\'s folder, or an adapter name outside src/lib, is judged like any other', () => {
    for (const path of ['src/lib/talos/TalosHelper.ts', 'src/services/overseer/PosixHelper.ts', 'src/services/overseer/HelperFor.ts', 'cli/WindowsOpener.ts']) {
      expect(violationsOfPlanted(path, pipeLine)).toEqual([`${path}: pipe-name: ${pipeLine}`]);
    }
  });

  test('an adapter\'s name exempts it from neither exact-site form', () => {
    expect(violationsOfPlanted('src/lib/data-folders/DataFoldersFor.ts', 'const platform = process.platform;')).toEqual([
      'src/lib/data-folders/DataFoldersFor.ts: process-platform: const platform = process.platform;',
    ]);
    expect(violationsOfPlanted('src/lib/data-folders/PosixDataFolders.ts', 'chmodSync(path, mode);')).toEqual([
      'src/lib/data-folders/PosixDataFolders.ts: mode-change: chmodSync(path, mode);',
    ]);
  });

  test('a comment, a shebang, a spec and a testing folder are not scanned', () => {
    const shellLine = 'const shell = \'/bin/sh\';';
    expect(violationsOfPlanted('src/Planted.ts', `// ${shellLine}`)).toEqual([]);
    expect(violationsOfPlanted('src/Planted.ts', ` * ${shellLine}`)).toEqual([]);
    expect(violationsOfPlanted('Planted.ts', '#!/usr/bin/env bun')).toEqual([]);
    expect(violationsOfPlanted('cli/Planted.spec.ts', shellLine)).toEqual([]);
    expect(violationsOfPlanted('bridge/Planted.dom.tsx', shellLine)).toEqual([]);
    expect(violationsOfPlanted('cli/testing/Planted.ts', shellLine)).toEqual([]);
  });

  test('a separator that is no search path, and fchmodSync, pass', () => {
    expect(violationsOfPlanted('src/Planted.ts', 'const HOLDER_SEPARATOR = \':\';')).toEqual([]);
    expect(violationsOfPlanted('src/Planted.ts', 'fchmodSync(descriptor, mode);')).toEqual([]);
    expect(violationsOfPlanted('src/Planted.ts', 'import { thing } from \'./bin/Planted.ts\';')).toEqual([]);
  });
});
