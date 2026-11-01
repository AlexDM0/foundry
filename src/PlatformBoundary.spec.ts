/**
 * The core names a port, never a platform: no shipping line outside an adapter reads the platform or names a platform primitive. The scan
 * first proves it saw the tree and that adapters really hold the forms, the allowlist is exact both ways (an entry a later ticket removes
 * names that ticket's mechanism), and each form is planted once. Adapters are recognised by exact file-name shapes, never by folder, and
 * `EXACT_SITE_FORMS` take no adapter exemption at all. Comments, specs and testing folders are not scanned.
 */
import { describe, expect, test } from 'bun:test';

import { repositoryRootOfThisCheckout }                       from './testing/ImportGraph.ts';
import { repositoryTypeScriptSources, type RepositorySource } from './testing/RepositorySources.ts';

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
  | 'detached-spawn';

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
  'detached-spawn': [/\bdetached:\s*true\b/],
};

const PLATFORM_FORMS = Object.keys(PLATFORM_FORM_PATTERNS) as PlatformForm[];

/** Confined to named lines: an adapter's file name exempts it from neither. */
const EXACT_SITE_FORMS: readonly PlatformForm[] = ['process-platform', 'mode-change'];

const ADAPTER_FILE_PATTERN = /^src\/lib\/.+\/(?:(?:Darwin|Linux|Windows|Posix)[A-Z]\w*|[A-Z]\w*For)\.ts$/;

/** A selector kept beside its only consumer, outside `src/lib/`. */
const ADAPTER_FILES_OUTSIDE_LIB: readonly string[] = ['cli/OpenerFor.ts'];

/** `<path>: <form>: <trimmed line>`, each with the reason it stays. */
const ALLOWED_PLATFORM_LINES: Readonly<Record<string, string>> = {
  'cli/CommandContext.ts: process-platform: if (!fakeAgentIsOn()) return claudeCodeAdapterFor(process.platform);':
    'The composition root hands the platform to the vendor adapter\'s selector.',
  'cli/CommandContext.ts: process-platform: const platformPorts = platformPortsFor(process.platform, PLATFORM_HOST_FACTS);':
    'The composition root builds the port record.',
  'cli/CommandContext.ts: process-platform: platform:                process.platform,':
    'The composition root carries the platform, so a spec can choose it.',
  'watcher.ts: process-platform: process.exit(await runWatcher(Bun.argv.slice(2), () => new Date().toISOString(), process.platform));':
    'The Watcher has no CommandContext; its binary is its composition root.',
  'src/lib/atomic-file/FileReplaceFor.ts: process-platform: return fileReplaceFor(process.platform);':
    'Lib writes have no context, so this selector reads the platform at call time.',
  'cli/OpenInTheDefaultBrowser.ts: platform-property: const opener = openerFor(context.platform);':
    'Hands the context\'s platform straight to the selector and decides nothing on it.',
  'src/lib/tracker-model/utils/NetworkDomainUtil.ts: search-path-separator: const [firstGroup = \'\'] = address.split(\':\');':
    'Splits an IPv6 address into its groups; no search path is involved.',
  'src/services/lifecycle/GateRun.ts: detached-spawn: detached: true,':
    'Until #526 takes the gate\'s spawn options from `spawnOptionsFor`.',
  'src/lib/owner-only-files/OwnerOnlyFilesFor.ts: mode-change: import { chmodSync, mkdirSync, statSync } from \'node:fs\';':
    'The real primitive the POSIX adapter of the OwnerOnlyFiles port runs on.',
  'src/lib/owner-only-files/OwnerOnlyFilesFor.ts: mode-change: changeMode: chmodSync,':
    'The same primitive.',
  'src/lib/watcher/LocalEndpointFor.ts: mode-change: import { chmodSync, mkdirSync, rmSync }   from \'node:fs\';':
    'Until #531 restricts the socket folder through the OwnerOnlyFiles port.',
  'src/lib/watcher/LocalEndpointFor.ts: mode-change: restrictFolder: (folder, mode) => chmodSync(folder, mode),':
    'The same site.',
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

/** Every form on every code line of the shipping files, those a file's adapter name exempts left out. */
function formLinesIn(sources: readonly RepositorySource[]): string[] {
  return sources.filter((source) => isShippingCode(source.path)).flatMap((source) => source.text.split('\n')
    .map((line) => line.trim())
    .filter((line) => !isCommentLine(line))
    .flatMap((line) => formsNamedBy(line)
      .filter((form) => EXACT_SITE_FORMS.includes(form) || !isPlatformAdapter(source.path))
      .map((form) => `${source.path}: ${form}: ${line}`)));
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

const SOURCES = repositoryTypeScriptSources(repositoryRootOfThisCheckout());

describe('the scan saw the tree', () => {
  const shippingPaths = SOURCES.map((source) => source.path).filter(isShippingCode);

  test('it reads the whole shipping tree and skips the specs', () => {
    expect(shippingPaths.length).toBeGreaterThan(400);
    expect(SOURCES.length).toBeGreaterThan(shippingPaths.length);
    expect(shippingPaths).toEqual(expect.arrayContaining([
      'agent-progress.ts', 'watcher.ts', 'cli/CommandContext.ts', 'src/services/lifecycle/GateRun.ts', 'bridge/Main.tsx',
    ]));
    expect(shippingPaths).not.toContain('src/PlatformBoundary.spec.ts');
  });

  test('it recognises the adapters, and the forms it looks for really stand in them', () => {
    const adapters = SOURCES.filter((source) => isPlatformAdapter(source.path));
    expect(adapters.map((source) => source.path)).toEqual(expect.arrayContaining([
      'cli/OpenerFor.ts', 'src/lib/gate-confinement/DarwinSeatbelt.ts', 'src/lib/shell-line/ShellLineFor.ts', 'src/lib/watcher/PosixSocketEndpoint.ts',
    ]));
    const formsInAdapters = new Set(adapters.flatMap((source) => source.text.split('\n').flatMap(formsNamedBy)));
    expect([...formsInAdapters]).toEqual(expect.arrayContaining([
      'platform-name', 'sandbox-exec', 'proc-filesystem', 'bin-folder', 'usr-bin-folder', 'usr-sbin-folder', 'temporary-folder', 'socket-file', 'bourne-shell-path',
    ]));
  });

  test('every shipping line naming a form is allowlisted, and every allowlist entry is found', () => {
    expect(boundaryReportOf(SOURCES, ALLOWED_LINES)).toEqual({ violations: [], unusedAllowances: [] });
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
    const allowedEntry = 'src/services/lifecycle/GateRun.ts: detached-spawn: detached: true,';
    const doubledSite = { path: 'src/services/lifecycle/GateRun.ts', text: 'detached: true,\ndetached: true,\n' };
    expect(boundaryReportOf([doubledSite], [allowedEntry])).toEqual({ violations: [allowedEntry], unusedAllowances: [] });
  });

  test('an allowed line in another file of its folder is a violation', () => {
    const allowedEntry = 'src/services/lifecycle/GateRun.ts: detached-spawn: detached: true,';
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
    ['an escaped pipe name', 'const endpoint = \'\\\\\\\\.\\\\pipe\\\\watcher\';', ['pipe-name']],
    ['a forward-slash pipe name', 'const endpoint = \'//./pipe/watcher\';', ['pipe-name']],
    ['\'/bin/sh\'', 'const shell = \'/bin/sh\';', ['bourne-shell-path']],
    ['chmodSync', 'chmodSync(path, mode);', ['mode-change']],
    ['a search-path separator constant', 'const SEARCH_PATH_SEPARATOR = \':\';', ['search-path-separator']],
    ['a literal split', 'const folders = searchPath.split(\':\');', ['search-path-separator']],
    ['a literal join', 'const searchPath = folders.join(\';\');', ['search-path-separator']],
    ['a folder prepended by hand', 'const searchPath = `${folder}:${environment.PATH}`;', ['search-path-separator']],
    ['a folder appended by hand', 'const searchPath = `${environment.PATH}:${folder}`;', ['search-path-separator']],
    ['a literal search path', 'const searchPath = \'/usr/sbin:/usr/bin:/bin\';', ['bin-folder', 'usr-bin-folder', 'usr-sbin-folder']],
    ['the platform destructured', 'const { platform } = process;', ['process-platform']],
    ['detached: true', 'spawn(argv, { detached: true });', ['detached-spawn']],
  ];

  test.each(plantedForms)('%s', (_formName, plantedLine, expectedForms) => {
    expect(violationsOfPlanted(plantedPath, plantedLine)).toEqual(expectedForms.map((form) => `${plantedPath}: ${form}: ${plantedLine}`));
  });

  test('every form is planted above', () => {
    expect([...new Set(plantedForms.flatMap(([, , forms]) => forms))].sort()).toEqual([...PLATFORM_FORMS].sort());
  });
});

describe('what the boundary exempts is exact', () => {
  const pipeLine = 'const endpoint = \'//./pipe/watcher\';';

  test('an adapter or a selector under src/lib may name a primitive', () => {
    for (const fileName of ['WindowsPipeEndpoint', 'LinuxEndpoint', 'DarwinEndpoint', 'PosixEndpoint', 'EndpointFor']) {
      expect(violationsOfPlanted(`src/lib/watcher/${fileName}.ts`, pipeLine)).toEqual([]);
    }
  });

  test('a core file in an adapter\'s folder, or an adapter name outside src/lib, is judged like any other', () => {
    for (const path of ['src/lib/watcher/WatcherHelper.ts', 'src/services/overseer/PosixHelper.ts', 'src/services/overseer/HelperFor.ts', 'cli/WindowsOpener.ts']) {
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
