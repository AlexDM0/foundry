/**
 * Gaia speaks to forge only: no shipping line of the server or the page, comments included, names the agent vendor, its wire fields, its
 * tool names or its marks; forge's agent port is where the vendor lives. Specs, `.dom.tsx` files, testing folders and recordings replay
 * forge's answers, so they are not scanned; the allowlist is exact both ways, each entry naming the forge package that removes it.
 */
import { readFileSync }           from 'node:fs';
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';

type VendorForm = 'vendor-name' | 'vendor-wire-key' | 'vendor-tool-name' | 'vendor-mark';

type LineKind = 'code' | 'comment';

interface FormPattern {
  readonly pattern:   RegExp;
  readonly lineKinds: readonly LineKind[];
}

interface VendorNameReport {
  /** `<path>: <form>: <trimmed line>`, one per scanned occurrence the allowlist does not hold. */
  readonly violations:       readonly string[];
  readonly unusedAllowances: readonly string[];
}

interface ScannedSource {
  readonly path: string;
  readonly text: string;
}

const SCANNED_FOLDERS = ['src', 'page', 'architecture'];
const MINIMUM_SHIPPING_FILE_COUNT = 100;
/** The repository's own development folders, taken out of a line before it is matched. */
const DEVELOPMENT_FOLDER_PATTERN = /\.claude\/(?:\.evidence|worktrees|rules)/g;
const CODE_AND_COMMENT: readonly LineKind[] = ['code', 'comment'];
const ASKING_AND_WEB_TOOL_NAMES = 'AskUserQuestion|NotebookEdit|TodoWrite|WebFetch|WebSearch';
const WIRE_KEYS_BUT_SUBTYPE = 'session_id|is_error|api_retry|api_error(?:_status)?|terminal_reason|tool_use(?:_id)?|tool_result|parent_tool_use_id'
  + '|structured_output|permission_denials|total_cost_usd|(?:cache_read_|cache_creation_)?input_tokens|output_tokens|control_request'
  + '|control_response|can_use_tool|request_id|rate_limit_event|stream_event|claude_code_version|five_hour|seven_day|updatedInput';
const PACKAGE_OF_AN_ENTRY_PATTERN = /^Removed by WP2\.(?:2[3-9]|3[0-2]): /;

const VENDOR_FORM_PATTERNS: Readonly<Record<VendorForm, readonly FormPattern[]>> = {
  'vendor-name':     [{ pattern: /claude|anthropic/i, lineKinds: CODE_AND_COMMENT }],
  'vendor-wire-key': [
    { pattern: new RegExp(`\\b(?:subtype|${WIRE_KEYS_BUT_SUBTYPE})\\b|stream-json`), lineKinds: ['code'] },
    // A comment says `subtype` of a media type.
    { pattern: new RegExp(`\\b(?:${WIRE_KEYS_BUT_SUBTYPE})\\b|stream-json`), lineKinds: ['comment'] },
  ],
  'vendor-tool-name': [
    { pattern: new RegExp(`['"\`](?:${ASKING_AND_WEB_TOOL_NAMES})['"\`]`), lineKinds: ['code'] },
    { pattern: new RegExp(`\\b(?:${ASKING_AND_WEB_TOOL_NAMES})\\b`), lineKinds: ['comment'] },
  ],
  'vendor-mark': [
    // The source of a regular expression spells the mark with backslashes.
    { pattern: /\\?\(Recommended\\?\)/, lineKinds: CODE_AND_COMMENT },
    { pattern: /`\/\$\{[A-Z_.]*SKILL/, lineKinds: CODE_AND_COMMENT },
  ],
};

const VENDOR_FORMS = Object.keys(VENDOR_FORM_PATTERNS) as VendorForm[];

/** `<path>: <form>: <trimmed line>`, each with the forge package that removes it. */
const ALLOWED_VENDOR_LINES: Readonly<Record<string, string>> = {};

const ALLOWED_LINES = Object.keys(ALLOWED_VENDOR_LINES);

function isShippingCode(path: string): boolean {
  return /\.tsx?$/.test(path) && !/\.spec\.tsx?$|\.dom\.tsx$/.test(path) && !path.split('/').includes('testing') && !path.split('/').includes('recordings');
}

function isCommentLine(line: string): boolean {
  return ['//', '/*', '*', '#!'].some((marker) => line.startsWith(marker));
}

function formsNamedBy(line: string): VendorForm[] {
  const lineKind: LineKind = isCommentLine(line) ? 'comment' : 'code';
  const matchedText = line.replace(DEVELOPMENT_FOLDER_PATTERN, '');
  return VENDOR_FORMS.filter((form) => VENDOR_FORM_PATTERNS[form].some(({ pattern, lineKinds }) => lineKinds.includes(lineKind) && pattern.test(matchedText)));
}

function formLinesOf(source: ScannedSource): readonly string[] {
  return source.text.split('\n').map((line) => line.trim()).filter((line) => line !== '')
    .flatMap((line) => formsNamedBy(line).map((form) => `${source.path}: ${form}: ${line}`));
}

function vendorNameReportOf(sources: readonly ScannedSource[], allowedLines: readonly string[]): VendorNameReport {
  const found = sources.filter((source) => isShippingCode(source.path)).flatMap(formLinesOf);
  return {
    violations:       found.filter((line, index) => !allowedLines.includes(line) || found.indexOf(line) !== index),
    unusedAllowances: allowedLines.filter((line) => !found.includes(line)),
  };
}

function violationsOfPlanted(path: string, plantedLine: string): readonly string[] {
  return vendorNameReportOf([{ path, text: `${plantedLine}\n` }], []).violations;
}

function repositorySources(): ScannedSource[] {
  const repositoryRoot = join(import.meta.dir, '..');
  return SCANNED_FOLDERS
    .flatMap((folder) => [...new Bun.Glob(`${folder}/**/*.{ts,tsx}`).scanSync({ cwd: repositoryRoot })])
    .sort()
    .map((path) => ({ path, text: readFileSync(join(repositoryRoot, path), 'utf8') }));
}

const SOURCES = repositorySources();

describe('the scan saw the tree', () => {
  test('it reads the server and the page, and skips the specs', () => {
    const shippingPaths = SOURCES.map((source) => source.path).filter(isShippingCode);
    expect(shippingPaths.length).toBeGreaterThan(MINIMUM_SHIPPING_FILE_COUNT);
    expect(shippingPaths).toEqual(expect.arrayContaining(['src/Main.ts', 'page/Main.tsx', 'src/adapters/page-api/ForgeSentenceUtil.ts']));
    expect(shippingPaths).not.toContain('architecture/AgentVendorNames.spec.ts');
  });

  test('every line naming a form is allowlisted, and every allowlist entry is found', () => {
    expect(vendorNameReportOf(SOURCES, ALLOWED_LINES)).toEqual({ violations: [], unusedAllowances: [] });
  });

  test('every entry names the forge package that removes it', () => {
    expect(Object.values(ALLOWED_VENDOR_LINES).filter((reason) => !PACKAGE_OF_AN_ENTRY_PATTERN.test(reason))).toEqual([]);
  });
});

describe('the allowlist is exact both ways', () => {
  const allowedEntry = 'src/adapters/PlantedSite.ts: vendor-name: const program = \'claude\';';

  test('removing an entry leaves its line a violation', () => {
    expect(vendorNameReportOf(SOURCES, [])).toEqual({ violations: ALLOWED_LINES, unusedAllowances: [] });
  });

  test('an entry nothing uses is named', () => {
    expect(vendorNameReportOf(SOURCES, [...ALLOWED_LINES, allowedEntry])).toEqual({ violations: [], unusedAllowances: [allowedEntry] });
  });

  test('a second copy of an allowed line in its own file, or the line in another file, is a violation', () => {
    const doubledSite = { path: 'src/adapters/PlantedSite.ts', text: 'const program = \'claude\';\nconst program = \'claude\';\n' };
    expect(vendorNameReportOf([doubledSite], [allowedEntry])).toEqual({ violations: [allowedEntry], unusedAllowances: [] });
    const plantedCopy = { path: 'page/PlantedSite.ts', text: 'const program = \'claude\';\n' };
    expect(vendorNameReportOf([plantedCopy], [allowedEntry])).toEqual({
      violations:       ['page/PlantedSite.ts: vendor-name: const program = \'claude\';'],
      unusedAllowances: [allowedEntry],
    });
  });
});

describe('the test names each form, planted in memory', () => {
  const plantedPath = 'page/views/Planted.tsx';

  const plantedForms: readonly (readonly [string, readonly VendorForm[]])[] = [
    ['const program = \'claude\';', ['vendor-name']],
    ['// Billed to ANTHROPIC_API_KEY.', ['vendor-name']],
    ['const kind = line.subtype;', ['vendor-wire-key']],
    ['// Such as `five_hour`.', ['vendor-wire-key']],
    ['const tool = \'AskUserQuestion\';', ['vendor-tool-name']],
    ['// Fetched through WebFetch.', ['vendor-tool-name']],
    ['const mark = /\\(Recommended\\)/;', ['vendor-mark']],
    ['const firstLine = `/${PRODUCT_OWNER_SKILL} ${text}`;', ['vendor-mark']],
  ];

  test.each(plantedForms)('%s', (plantedLine, expectedForms) => {
    expect(violationsOfPlanted(plantedPath, plantedLine)).toEqual(expectedForms.map((form) => `${plantedPath}: ${form}: ${plantedLine}`));
  });

  test('every form and every pattern of it is planted above', () => {
    expect([...new Set(plantedForms.flatMap(([, forms]) => forms))].sort()).toEqual([...VENDOR_FORMS].sort());
    const unplantedPatterns = VENDOR_FORMS.flatMap((form) => VENDOR_FORM_PATTERNS[form]
      .filter(({ pattern, lineKinds }) => !plantedForms.some(([line]) => lineKinds.includes(isCommentLine(line) ? 'comment' : 'code') && pattern.test(line)))
      .map(({ pattern }) => `${form}: ${pattern.source}`));
    expect(unplantedPatterns).toEqual([]);
  });
});

describe('what the test exempts is exact', () => {
  const plantedLine = 'const program = \'claude\';';

  test('a spec, a .dom.tsx, a testing folder and a recording are not scanned', () => {
    for (const path of ['src/Planted.spec.ts', 'page/Planted.spec.tsx', 'page/Planted.dom.tsx', 'src/testing/Planted.ts', 'src/testing/recordings/Planted.ts']) {
      expect(violationsOfPlanted(path, plantedLine)).toEqual([]);
    }
  });

  test('a media type\'s subtype in a comment and the development folders are no finding', () => {
    expect(violationsOfPlanted('page/Planted.ts', '// A picture\'s media type and its subtype.')).toEqual([]);
    expect(violationsOfPlanted('src/Planted.ts', 'const folder = \'.claude/worktrees/x\';')).toEqual([]);
  });
});
