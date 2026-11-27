/**
 * The frame capture: it renders Flint in headless Chrome through `createFlint` and the real renderer on a manual frame source, at fixed
 * moments, facing right and left, to PNG files under `.claude/.evidence/flint-frames/<label>/`; and it compares two labels pixel by pixel.
 * A `--<kind>-module` adds a definition that no catalog lists yet to the bundle's catalog, so an author sees it before it is registered.
 * It is a command-line entry: it runs when Bun starts it. `flint/README.md`, "Look at an animation", gives the command lines.
 */
import { SPRITE_INTENTS }                                                   from '../SpriteHabitat.ts';
import type { FlintCapture, FrameRequest, PictureDifference }               from './FrameCaptureEntry.ts';
import type { HeadlessChromePage }                                          from './HeadlessChrome.ts';
import { chromeExecutablePath, openHeadlessChromePage }                     from './HeadlessChrome.ts';
import { FRAME_CAPTURE_FOLDERS, FRAME_CAPTURE_STAGE, FRAME_CAPTURE_TIMING } from './constants/FrameCapture.ts';

/** Each catalog a preview module can join: the file that declares it, its constant, and the suffix of a definition's export name. */
const PREVIEW_CATALOGS = {
  '--gesture-module':   { catalogFile: 'gestures/GestureCatalog.ts', catalogName: 'GESTURE_CATALOG', exportSuffix: '_GESTURE' },
  '--prop-module':      { catalogFile: 'props/PropCatalog.ts', catalogName: 'PROP_CATALOG', exportSuffix: '_PROP' },
  '--emote-module':     { catalogFile: 'emotes/EmoteCatalog.ts', catalogName: 'EMOTE_CATALOG', exportSuffix: '_EMOTE' },
  '--attendant-module': { catalogFile: 'attendants/AttendantCatalog.ts', catalogName: 'ATTENDANT_CATALOG', exportSuffix: '_ATTENDANT' },
  '--behaviour-module': { catalogFile: 'behaviours/BehaviourCatalog.ts', catalogName: 'BEHAVIOUR_CATALOG', exportSuffix: '_BEHAVIOUR' },
} as const;

type PreviewFlag = keyof typeof PREVIEW_CATALOGS;

/** The intents that move Flint about rather than show an animation in place. */
const INTENTS_THAT_MOVE_FLINT: readonly string[] = ['wander', 'visit', 'copy'];

function parentFolderOf(folder: string): string {
  const lastSeparatorIndex = folder.lastIndexOf('/');
  return lastSeparatorIndex <= 0 ? '/' : folder.slice(0, lastSeparatorIndex);
}

const PACKAGE_FOLDER = parentFolderOf(import.meta.dir);

/** A `.git` folder in a main checkout, a `.git` file in a linked worktree. */
function holdsAGitEntry(folder: string): boolean {
  return new Bun.Glob('.git').scanSync({ cwd: folder, dot: true, onlyFiles: false }).next().done !== true;
}

/** The checkout the package sits in, found by its `.git`, since the package's place inside the repository is not fixed. */
function repositoryFolder(): string {
  for (let folder = PACKAGE_FOLDER; ; folder = parentFolderOf(folder)) {
    if (holdsAGitEntry(folder)) return folder;
    if (parentFolderOf(folder) === folder) return parentFolderOf(PACKAGE_FOLDER);
  }
}

function evidenceFolder(): string {
  return `${repositoryFolder()}/${FRAME_CAPTURE_FOLDERS.EVIDENCE_FOLDER}`;
}

/** The last line of a catalog's list, which `flint/architecture/AnimationModules.spec.ts` holds; the preview joins the catalog right after it. */
const CATALOG_LIST_END = '] as const);';

const USAGE = [
  'usage:',
  '  bun testing/CaptureFlintFrames.ts capture <label> [--intent <intent>]... [--attendant <name>]... [--moments <ms>,<ms>...]',
  '      [--gesture-module <path>]... [--prop-module <path>]... [--emote-module <path>]... [--attendant-module <path>]...',
  '      [--behaviour-module <path>]... [--chrome <path>]',
  '  bun testing/CaptureFlintFrames.ts compare <first label> <second label> [--chrome <path>]',
].join('\n');

interface CaptureOptions {
  readonly label:          string;
  readonly intents:        readonly string[];
  readonly attendants:     readonly string[];
  readonly moments:        readonly number[];
  readonly previewModules: readonly (readonly [PreviewFlag, string])[];
  readonly chromePath:     string | null;
}

/** One picture to take: what Flint shows, and the file it goes to. */
interface Subject {
  readonly name:      string;
  readonly intent:    string | null;
  readonly attendant: string | null;
}

function isPreviewFlag(flag: string): flag is PreviewFlag {
  return Object.hasOwn(PREVIEW_CATALOGS, flag);
}

function absolutePathOf(path: string): string {
  return path.startsWith('/') ? path : `${repositoryFolder()}/${path}`;
}

function captureOptionsOf(words: readonly string[]): CaptureOptions | null {
  const [label, ...flags] = words;
  if (label === undefined || label.startsWith('--')) return null;
  const intents: string[] = [];
  const attendants: string[] = [];
  const previewModules: (readonly [PreviewFlag, string])[] = [];
  let moments: readonly number[] = FRAME_CAPTURE_TIMING.DEFAULT_MOMENTS_MILLISECONDS;
  let chromePath: string | null = null;
  for (let i = 0; i < flags.length; i += 2) {
    const flag = flags[i] ?? '';
    const value = flags[i + 1];
    if (value === undefined) return null;
    if (flag === '--intent') intents.push(value);
    else if (flag === '--attendant') attendants.push(value);
    else if (flag === '--moments') moments = value.split(',').map(Number);
    else if (flag === '--chrome') chromePath = value;
    else if (isPreviewFlag(flag)) previewModules.push([flag, absolutePathOf(value)]);
    else return null;
  }
  if (moments.some((moment) => !Number.isFinite(moment) || moment < 0)) return null;
  return {
    label, intents, attendants, moments, previewModules, chromePath,
  };
}

/** The catalog file with the preview modules' definitions added, replacing a registered one of the same name. */
function catalogWithPreviews(catalogSource: string, flag: PreviewFlag, modulePaths: readonly string[]): string {
  const { catalogName, exportSuffix } = PREVIEW_CATALOGS[flag];
  const declaration = `export const ${catalogName} = `;
  const declarationStart = catalogSource.indexOf(declaration);
  if (declarationStart === -1) throw new Error(`the catalog no longer declares \`${declaration}\`: the preview cannot join it`);
  const listEnd = catalogSource.indexOf(CATALOG_LIST_END, declarationStart);
  if (listEnd === -1) throw new Error(`the catalog's list no longer ends with \`${CATALOG_LIST_END}\`: the preview cannot join it`);
  const afterList = listEnd + CATALOG_LIST_END.length;
  const registeredName = `REGISTERED_${catalogName}`;
  const imports = modulePaths.map((path, i) => `import * as PREVIEW_MODULE_${i} from ${JSON.stringify(path)};`);
  const previewList = modulePaths.map((_path, i) => `...Object.entries(PREVIEW_MODULE_${i})`
    + `.filter(([name]) => name.endsWith('${exportSuffix}')).map(([, value]) => value)`);
  // The preview joins right after the list, so what the catalog file derives from the list below it sees the preview too.
  return [
    ...imports,
    `${catalogSource.slice(0, declarationStart)}const ${registeredName} = ${catalogSource.slice(declarationStart + declaration.length, afterList)}`,
    `const PREVIEW_DEFINITIONS = [${previewList.join(', ')}];`,
    `export const ${catalogName} = Object.freeze([`
      + `...${registeredName}.filter((registered) => !PREVIEW_DEFINITIONS.some((preview) => preview.name === registered.name)), ...PREVIEW_DEFINITIONS]);`,
    catalogSource.slice(afterList),
  ].join('\n');
}

async function bundledCaptureScript(previewModules: CaptureOptions['previewModules']): Promise<string> {
  const flags = [...new Set(previewModules.map(([flag]) => flag))];
  const built = await Bun.build({
    entrypoints: [`${import.meta.dir}/FrameCaptureEntry.ts`],
    target:      'browser',
    format:      'iife',
    plugins:     [{
      name:  'flint-preview-catalogs',
      setup: (build) => {
        for (const flag of flags) {
          const { catalogFile } = PREVIEW_CATALOGS[flag];
          const modulePaths = previewModules.filter(([moduleFlag]) => moduleFlag === flag).map(([, path]) => path);
          const catalogFilePattern = new RegExp(`${catalogFile.replaceAll('/', '\\/').replace('.', '\\.')}$`);
          build.onLoad({ filter: catalogFilePattern }, async (loaded) => ({
            contents: catalogWithPreviews(await Bun.file(loaded.path).text(), flag, modulePaths),
            loader:   'ts',
          }));
        }
      },
    }],
  });
  if (!built.success) throw new AggregateError(built.logs, 'the capture bundle did not build');
  const [output] = built.outputs;
  if (output === undefined) throw new Error('the capture bundle has no output');
  return output.text();
}

async function openCapturePage(chromePath: string | null, script: string): Promise<HeadlessChromePage> {
  const executable = chromePath ?? chromeExecutablePath();
  if (executable === null) throw new Error('no Chrome or Chromium found: give one with --chrome <path>');
  const page = await openHeadlessChromePage(executable, `${evidenceFolder()}/.chrome-profile`, {
    widthPixels:       FRAME_CAPTURE_STAGE.VIEWPORT_WIDTH_PIXELS,
    heightPixels:      FRAME_CAPTURE_STAGE.VIEWPORT_HEIGHT_PIXELS,
    deviceScaleFactor: FRAME_CAPTURE_STAGE.DEVICE_SCALE_FACTOR,
  });
  await page.runScript(script);
  return page;
}

function callOf(method: keyof FlintCapture, ...values: readonly unknown[]): string {
  return `globalThis.flintCapture.${method}(${values.map((value) => JSON.stringify(value)).join(', ')})`;
}

async function stringListOf(page: HeadlessChromePage, expression: string): Promise<readonly string[]> {
  const value = await page.valueOf(expression);
  return Array.isArray(value) ? value.map(String) : [];
}

async function subjectsOf(page: HeadlessChromePage, options: CaptureOptions): Promise<readonly Subject[]> {
  const asked = [
    ...options.intents.map((intent) => ({ name: intent, intent, attendant: null })),
    ...options.attendants.map((attendant) => ({ name: `attendant-${attendant}`, intent: null, attendant })),
  ];
  if (asked.length > 0) return asked;
  const intents = await stringListOf(page, callOf('intents'));
  const attendants = await stringListOf(page, callOf('attendants'));
  const registeredIntents: readonly string[] = SPRITE_INTENTS;
  const previewIntents = intents.filter((intent) => !registeredIntents.includes(intent));
  if (options.previewModules.length > 0) {
    return [
      ...previewIntents.map((intent) => ({ name: intent, intent, attendant: null })),
      ...(options.previewModules.some(([flag]) => flag === '--attendant-module') ? attendants : [])
        .map((attendant) => ({ name: `attendant-${attendant}`, intent: null, attendant })),
    ];
  }
  return [
    { name: 'idle', intent: null, attendant: null },
    ...intents.filter((intent) => !INTENTS_THAT_MOVE_FLINT.includes(intent)).map((intent) => ({ name: intent, intent, attendant: null })),
    ...attendants.map((attendant) => ({ name: `attendant-${attendant}`, intent: null, attendant })),
  ];
}

async function capture(options: CaptureOptions): Promise<number> {
  const page = await openCapturePage(options.chromePath, await bundledCaptureScript(options.previewModules));
  try {
    const subjects = await subjectsOf(page, options);
    const shots = subjects.flatMap((subject) => (['right', 'left'] as const).flatMap((facing) => [
      {
        subject, facing, moment: 'still', request: { facing, milliseconds: FRAME_CAPTURE_TIMING.STILL_MOMENT_CAPTURE_MILLISECONDS, reducedMotion: true }
      },
      ...options.moments.map((milliseconds) => ({
        subject, facing, moment: `${milliseconds}ms`, request: { facing, milliseconds, reducedMotion: false }
      })),
    ]));
    for (const shot of shots) {
      const request: FrameRequest & { readonly attendant: string | null } = { ...shot.request, intent: shot.subject.intent, attendant: shot.subject.attendant };
      const verdict = String(await page.valueOf(callOf('showFrame', request)));
      if (verdict !== 'performed' && verdict !== 'idle' && verdict !== 'attended') throw new Error(`${shot.subject.name}: ${verdict}`);
      await Bun.write(`${evidenceFolder()}/${options.label}/${shot.subject.name}-${shot.facing}-${shot.moment}.png`, await page.pictureBytes());
    }
    console.log(`${shots.length} pictures of ${subjects.length} subjects in ${FRAME_CAPTURE_FOLDERS.EVIDENCE_FOLDER}/${options.label}/`);
    return 0;
  } finally {
    await page.close();
  }
}

function pictureAddressOf(bytes: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

async function compare(firstLabel: string, secondLabel: string, chromePath: string | null): Promise<number> {
  const firstFolder = `${evidenceFolder()}/${firstLabel}`;
  const secondFolder = `${evidenceFolder()}/${secondLabel}`;
  const firstNames = [...new Bun.Glob('*.png').scanSync({ cwd: firstFolder })].sort();
  const secondNames = new Set(new Bun.Glob('*.png').scanSync({ cwd: secondFolder }));
  const page = await openCapturePage(chromePath, await bundledCaptureScript([]));
  try {
    let regressions = 0;
    let identical = 0;
    for (const name of firstNames) {
      if (!secondNames.has(name)) {
        console.log(`${name}: missing in ${secondLabel}`);
        regressions++;
        continue;
      }
      const [firstBytes, secondBytes] = await Promise.all([Bun.file(`${firstFolder}/${name}`).bytes(), Bun.file(`${secondFolder}/${name}`).bytes()]);
      const difference = await page.valueOf(callOf('differenceOf', pictureAddressOf(firstBytes), pictureAddressOf(secondBytes))) as PictureDifference;
      if (difference.differingPixels === 0 && !difference.sizesDiffer) {
        identical++;
        continue;
      }
      const isRegression = difference.sizesDiffer || difference.pixelsBeyondNoise > 0;
      if (isRegression) regressions++;
      const counted = `${difference.differingPixels} pixels differ, ${difference.pixelsBeyondNoise} beyond noise, `
        + `largest channel difference ${difference.largestChannelDifference}`;
      console.log(`${name}: ${difference.sizesDiffer ? 'sizes differ' : counted}`);
    }
    console.log(`${firstNames.length} pictures compared: ${identical} identical, ${regressions} beyond anti-aliasing noise or missing`);
    return regressions === 0 ? 0 : 1;
  } finally {
    await page.close();
  }
}

async function exitCodeOf(words: readonly string[]): Promise<number> {
  const [command, ...rest] = words;
  if (command === 'capture') {
    const options = captureOptionsOf(rest);
    if (options !== null) return capture(options);
  }
  if (command === 'compare') {
    const [firstLabel, secondLabel, chromeFlag, chromePath] = rest;
    const chromeIsGiven = chromeFlag === '--chrome' && chromePath !== undefined;
    if (firstLabel !== undefined && secondLabel !== undefined && (chromeFlag === undefined || chromeIsGiven)) return compare(firstLabel, secondLabel, chromePath ?? null);
  }
  console.error(USAGE);
  return 1;
}

process.exitCode = await exitCodeOf(Bun.argv.slice(2));
