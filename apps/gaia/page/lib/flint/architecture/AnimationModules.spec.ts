/**
 * The architecture test of the animation modules, the behaviours included. First: a core file names no gesture,
 * intent, emote, prop, mark, attendant or behaviour (as a string, a property, or a piece of a string built from parts), and imports from
 * an animation root only a catalog or a contract: it reads the catalogs. The core is the files `CORE_FILES` lists, the mind and sleep;
 * the core's own sleep layer is the one word a behaviour shares with it. Second:
 * each gesture, emote, mark, attendant and behaviour is one folder, named as it is, with its module and its spec; a gesture, an emote, a
 * mark and an attendant keep their values in `constants/<Name>Values.ts`, and a behaviour that has values keeps them there too; every
 * such folder is registered in its catalog, and every catalog entry has its folder; every prop module is registered in the prop catalog.
 * So one more behaviour is one more folder and one catalog line. And each catalog the frame capture joins keeps that form. It reads the
 * package itself and lexes each core file, so a name in a comment is not a use; the scan first proves it found what it holds, and each form
 * is planted in memory to watch the test fail.
 */
import { describe, expect, test } from 'bun:test';

import { ATTENDANT_CATALOG } from '../attendants/AttendantCatalog.ts';
import { BEHAVIOUR_CATALOG } from '../behaviours/BehaviourCatalog.ts';
import { EMOTE_CATALOG }     from '../emotes/EmoteCatalog.ts';
import { GESTURE_CATALOG }   from '../gestures/GestureCatalog.ts';
import { MARK_CATALOG }      from '../marks/MarkCatalog.ts';
import { PROP_CATALOG }      from '../props/PropCatalog.ts';

const PACKAGE_FOLDER = `${import.meta.dir}/..`;

/** The core files outside the mind and sleep. */
const CORE_FILES = [
  'SpritePose.ts',
  'PoseEasing.ts',
  'PoseComposition.ts',
  'SpriteRenderer.ts',
  'SpriteMind.ts',
  'CreateFlint.ts',
  'IntentMeaning.ts',
  'SpriteHabitat.ts',
  'MotionPose.ts',
  'drawing/Shape.ts',
  'drawing/ShapeWriter.ts',
  'drawing/SvgTextUtil.ts',
  'attendants/AttendantRoster.ts',
];

/** The mind and sleep are core as well, every module in them. */
const CORE_FOLDER_PATTERN = /^(?:mind|sleep)\/(?:.+\/)?[A-Za-z]+\.ts$/;

/**
 * The core's own words that are also a behaviour's name: the pose's sleep layer and the sleep sequence are core, read as `pose.sleep` and
 * `state.sleep`, while the sleep behaviour that sends Flint home is a module. As a property the word is the core's; as a string it is still
 * the behaviour's, and a core file may not write it. Exact both ways.
 */
const CORE_PROPERTY_WORDS_A_BEHAVIOUR_SHARES = ['sleep'];

/** A core file may import from these folders only a catalog, a contract, the default prop easing, or another core file. */
const ANIMATION_ROOTS = ['gestures/', 'emotes/', 'props/', 'attendants/', 'marks/', 'behaviours/'];
const CATALOG_OR_CONTRACT_PATTERN = /^[a-z]+\/[A-Za-z]+(?:Catalog|Definition)\.ts$/;
const DEFAULT_PROP_EASING_PATH = 'props/PropEasingUtil.ts';

/**
 * Each animation kind that is one folder for each animation: its root, its catalog, the suffix of its module, and whether every folder
 * has its values file; a behaviour that keeps no value of its own (sleep, stranded) has none.
 */
const FOLDER_KINDS = [
  {
    root: 'gestures/', catalogPath: 'gestures/GestureCatalog.ts', moduleSuffix: 'Gesture', valuesAreRequired: true,
  },
  {
    root: 'emotes/', catalogPath: 'emotes/EmoteCatalog.ts', moduleSuffix: 'Emote', valuesAreRequired: true,
  },
  {
    root: 'attendants/', catalogPath: 'attendants/AttendantCatalog.ts', moduleSuffix: 'Attendant', valuesAreRequired: true,
  },
  {
    root: 'marks/', catalogPath: 'marks/MarkCatalog.ts', moduleSuffix: 'Mark', valuesAreRequired: true,
  },
  {
    root: 'behaviours/', catalogPath: 'behaviours/BehaviourCatalog.ts', moduleSuffix: 'Behaviour', valuesAreRequired: false,
  },
] as const;

/** The catalogs the frame capture's preview joins, by the form it joins. */
const CATALOG_FILES = [
  { path: 'gestures/GestureCatalog.ts', name: 'GESTURE_CATALOG' },
  { path: 'emotes/EmoteCatalog.ts', name: 'EMOTE_CATALOG' },
  { path: 'attendants/AttendantCatalog.ts', name: 'ATTENDANT_CATALOG' },
  { path: 'props/PropCatalog.ts', name: 'PROP_CATALOG' },
  { path: 'behaviours/BehaviourCatalog.ts', name: 'BEHAVIOUR_CATALOG' },
];
const CATALOG_LIST_END = '] as const);';

const PROP_CATALOG_PATH = 'props/PropCatalog.ts';
const PROP_MODULE_PATTERN = /^(?:gestures|props|behaviours)\/.+\/([A-Za-z]+)Prop\.ts$/;
const SHARED_SUBFOLDERS = ['constants', 'shapes'];
const MINIMUM_PACKAGE_FILE_COUNT = 100;
const MINIMUM_CORE_FOLDER_FILE_COUNT = 15;

interface PackageSource {
  readonly path: string;
  readonly text: string;
}

/** What the catalogs register, by kind; the names a core file must not write. */
interface RegisteredNames {
  readonly gestures:     readonly string[];
  readonly emotes:       readonly string[];
  readonly attendants:   readonly string[];
  readonly marks:        readonly string[];
  readonly behaviours:   readonly string[];
  readonly literalNames: readonly string[];
  /** Props are keyed by these names in the pose, so a core file must not write one as a word either. */
  readonly propNames:    readonly string[];
}

interface LexedFile {
  /** Every string literal, and each fixed part of a template literal. */
  readonly strings:       readonly string[];
  readonly words:         readonly string[];
  /** The words used as a property: after a `.`, or as an object key before a `:`. */
  readonly propertyWords: readonly string[];
}

function quotedEnd(text: string, start: number): number {
  const quote = text[start];
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === quote) return i;
  }
  return text.length;
}

/** The end of a `${…}` substitution that starts at `start`, past its own braces. */
function substitutionEnd(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  return text.length;
}

/** The fixed parts of a template literal and the source of each substitution in it. */
function templatePartsOf(body: string): { readonly fixedParts: readonly string[]; readonly substitutions: readonly string[] } {
  const fixedParts: string[] = [];
  const substitutions: string[] = [];
  let partStart = 0;
  let i = 0;
  while (i < body.length) {
    if (body[i] === '\\') {
      i += 2;
    } else if (body.startsWith('${', i)) {
      fixedParts.push(body.slice(partStart, i));
      const end = substitutionEnd(body, i + 1);
      substitutions.push(body.slice(i + 2, end));
      i = end + 1;
      partStart = i;
    } else {
      i++;
    }
  }
  fixedParts.push(body.slice(partStart));
  return { fixedParts, substitutions };
}

function isPropertyPosition(text: string, wordStart: number, wordEnd: number): boolean {
  const before = text.slice(0, wordStart).trimEnd();
  const after = text.slice(wordEnd).trimStart();
  const isMember = before.endsWith('.') && !before.endsWith('...');
  return isMember || (after.startsWith(':') && !after.startsWith('::'));
}

/** The string literals, the words and the property words of a file, without its comments. */
function lexed(text: string): LexedFile {
  const strings: string[] = [];
  const words: string[] = [];
  const propertyWords: string[] = [];
  let i = 0;
  while (i < text.length) {
    const character = text[i] ?? '';
    if (text.startsWith('//', i)) {
      const lineEnd = text.indexOf('\n', i);
      i = lineEnd === -1 ? text.length : lineEnd;
    } else if (text.startsWith('/*', i)) {
      const commentEnd = text.indexOf('*/', i + 2);
      i = commentEnd === -1 ? text.length : commentEnd + 2;
    } else if (character === '`') {
      const end = quotedEnd(text, i);
      const parts = templatePartsOf(text.slice(i + 1, end));
      strings.push(...parts.fixedParts);
      for (const substitution of parts.substitutions) {
        const inner = lexed(substitution);
        strings.push(...inner.strings);
        words.push(...inner.words);
        propertyWords.push(...inner.propertyWords);
      }
      i = end + 1;
    } else if (character === '\'' || character === '"') {
      const end = quotedEnd(text, i);
      strings.push(text.slice(i + 1, end));
      i = end + 1;
    } else if (/[A-Za-z_$]/.test(character)) {
      const word = /^[A-Za-z0-9_$]+/.exec(text.slice(i))?.[0] ?? character;
      words.push(word);
      if (isPropertyPosition(text, i, i + word.length)) propertyWords.push(word);
      i += word.length;
    } else {
      i++;
    }
  }
  return { strings, words, propertyWords };
}

/** A string that is a name, or a hyphenated piece of one a name could be built from: `type-` of `type-busy`, `-fuel` of `out-of-fuel`. */
function namesAStringWrites(text: string, names: readonly string[]): readonly string[] {
  if (names.includes(text)) return [text];
  if (text.length > 1 && text.endsWith('-')) return names.filter((name) => name.startsWith(text));
  if (text.length > 1 && text.startsWith('-')) return names.filter((name) => name.endsWith(text));
  return [];
}

function importTargetsOf(source: PackageSource): readonly string[] {
  const folder = source.path.includes('/') ? source.path.slice(0, source.path.lastIndexOf('/') + 1) : '';
  return [...source.text.matchAll(/(?:from|import)\s*\(?\s*'(\.{1,2}\/[^']+)'/g)].map((match) => {
    const segments: string[] = [];
    for (const segment of `${folder}${match[1] ?? ''}`.split('/')) {
      if (segment === '..') segments.pop();
      else if (segment !== '.' && segment !== '') segments.push(segment);
    }
    return segments.join('/');
  });
}

function isCoreFile(path: string): boolean {
  return CORE_FILES.includes(path) || CORE_FOLDER_PATTERN.test(path);
}

/** Into an animation root, anything but a catalog, a contract, the default prop easing or another core file is an animation's own. */
function reachesIntoAnAnimation(target: string): boolean {
  if (!ANIMATION_ROOTS.some((root) => target.startsWith(root))) return false;
  return !CATALOG_OR_CONTRACT_PATTERN.test(target) && target !== DEFAULT_PROP_EASING_PATH && !isCoreFile(target);
}

function coreFindingsOf(sources: readonly PackageSource[], names: RegisteredNames): readonly string[] {
  const unique = (found: readonly string[]): readonly string[] => [...new Set(found)];
  return sources.filter((source) => isCoreFile(source.path)).flatMap((source) => {
    const { strings, words, propertyWords } = lexed(source.text);
    const writtenNames = unique([
      ...strings.flatMap((text) => namesAStringWrites(text, names.literalNames)),
      ...propertyWords.filter((word) => names.literalNames.includes(word) && !CORE_PROPERTY_WORDS_A_BEHAVIOUR_SHARES.includes(word)),
    ]);
    const namedLiterals = writtenNames.map((name) => `${source.path} names '${name}'`);
    const namedProps = unique(words.filter((word) => names.propNames.includes(word))).map((name) => `${source.path} names the prop ${name}`);
    const imports = importTargetsOf(source)
      .filter((target) => reachesIntoAnAnimation(target))
      .map((target) => `${source.path} imports ${target}, inside an animation`);
    return [...namedLiterals, ...namedProps, ...imports];
  });
}

function subfoldersOf(paths: readonly string[], root: string): readonly string[] {
  const folders = paths
    .filter((path) => path.startsWith(root))
    .map((path) => path.slice(root.length).split('/'))
    .filter((segments) => segments.length > 1)
    .map((segments) => segments[0] ?? '');
  return [...new Set(folders)].filter((folder) => !SHARED_SUBFOLDERS.includes(folder));
}

function pascalCaseOf(folder: string): string {
  return folder.split('-').map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join('');
}

function registeredOf(kind: typeof FOLDER_KINDS[number], names: RegisteredNames): readonly string[] {
  if (kind.root === 'gestures/') return names.gestures;
  if (kind.root === 'emotes/') return names.emotes;
  if (kind.root === 'behaviours/') return names.behaviours;
  return kind.root === 'marks/' ? names.marks : names.attendants;
}

function folderFindingsOf(sources: readonly PackageSource[], names: RegisteredNames): readonly string[] {
  const paths = sources.map((source) => source.path);
  const textOf = (path: string): string => sources.find((source) => source.path === path)?.text ?? '';
  return FOLDER_KINDS.flatMap((kind) => {
    const registered = registeredOf(kind, names);
    const folders = subfoldersOf(paths, kind.root);
    const catalogText = textOf(kind.catalogPath);
    const ofFolders = folders.flatMap((folder) => {
      const inFolder = paths.filter((path) => path.startsWith(`${kind.root}${folder}/`));
      const modules = inFolder.filter((path) => path.split('/').length === 3 && path.endsWith(`${kind.moduleSuffix}.ts`));
      const module = modules[0];
      const findings: string[] = [];
      if (modules.length !== 1 || module === undefined) return [`${kind.root}${folder}/ holds ${modules.length} ${kind.moduleSuffix.toLowerCase()} modules, not one`];
      const moduleName = module.split('/').pop() ?? module;
      const valuesPath = `${kind.root}${folder}/constants/${pascalCaseOf(folder)}Values.ts`;
      const constantsFiles = inFolder.filter((path) => path.startsWith(`${kind.root}${folder}/constants/`) && !path.endsWith('.spec.ts'));
      const valuesAreRequired = kind.valuesAreRequired || constantsFiles.length > 0;
      if (!inFolder.includes(module.replace(/\.ts$/, '.spec.ts'))) findings.push(`${module} has no spec beside it`);
      if (valuesAreRequired && !inFolder.includes(valuesPath)) findings.push(`${kind.root}${folder}/ has no ${valuesPath.slice(kind.root.length + folder.length + 1)}`);
      const kindName = kind.moduleSuffix.toLowerCase();
      if (!registered.includes(folder)) findings.push(`${kind.root}${folder}/ is no ${kindName} of ${kind.catalogPath}, which registers each by its folder's name`);
      if (!catalogText.includes(`from './${folder}/${moduleName}'`)) findings.push(`${kind.catalogPath} does not import ${module}`);
      return findings;
    });
    const withoutFolder = registered.filter((name) => !folders.includes(name)).map((name) => `${kind.catalogPath} registers ${name}, which has no folder ${kind.root}${name}/`);
    return [...ofFolders, ...withoutFolder];
  });
}

/** Each prop module is imported by the prop catalog and listed before its last line. */
function propFindingsOf(sources: readonly PackageSource[]): readonly string[] {
  const catalogText = sources.find((source) => source.path === PROP_CATALOG_PATH)?.text ?? '';
  const listEnd = catalogText.indexOf(CATALOG_LIST_END);
  const list = catalogText.slice(0, listEnd === -1 ? catalogText.length : listEnd);
  return sources.flatMap((source) => {
    const match = PROP_MODULE_PATTERN.exec(source.path);
    if (match === null) return [];
    const exportName = `${(match[1] ?? '').replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}_PROP`;
    const isImported = catalogText.includes(`from '../${source.path}'`) || catalogText.includes(`from './${source.path.slice('props/'.length)}'`);
    const isListed = new RegExp(`\\n\\s+${exportName},`).test(list);
    return isImported && isListed ? [] : [`${source.path} is not registered in ${PROP_CATALOG_PATH}`];
  });
}

function catalogFormFindingsOf(sources: readonly PackageSource[]): readonly string[] {
  return CATALOG_FILES.flatMap((catalog) => {
    const text = sources.find((source) => source.path === catalog.path)?.text ?? '';
    const declarationStart = text.indexOf(`export const ${catalog.name} = Object.freeze([`);
    const isOfItsForm = declarationStart !== -1 && text.indexOf(CATALOG_LIST_END, declarationStart) !== -1;
    return isOfItsForm ? [] : [`${catalog.path} does not declare \`export const ${catalog.name} = Object.freeze([\` … \`${CATALOG_LIST_END}\``];
  });
}

function findingsOf(sources: readonly PackageSource[], names: RegisteredNames): readonly string[] {
  return [...coreFindingsOf(sources, names), ...folderFindingsOf(sources, names), ...propFindingsOf(sources), ...catalogFormFindingsOf(sources)].sort();
}

const SOURCES: readonly PackageSource[] = await Promise.all([...new Bun.Glob('**/*.{ts,tsx}').scanSync({ cwd: PACKAGE_FOLDER })]
  .filter((path) => !path.split('/').includes('node_modules') && !path.endsWith('.spec.ts') && !path.endsWith('.dom.tsx'))
  .sort()
  .map(async (path) => ({ path, text: await Bun.file(`${PACKAGE_FOLDER}/${path}`).text() })));

const SPEC_PATHS: readonly string[] = [...new Bun.Glob('**/*.spec.ts').scanSync({ cwd: PACKAGE_FOLDER })];

const NAMES: RegisteredNames = {
  gestures:     GESTURE_CATALOG.map((definition) => definition.name),
  emotes:       EMOTE_CATALOG.map((definition) => definition.name),
  attendants:   ATTENDANT_CATALOG.map((definition) => definition.name),
  marks:        MARK_CATALOG.map((definition) => definition.name),
  behaviours:   BEHAVIOUR_CATALOG.map((definition) => definition.name),
  literalNames: [
    ...BEHAVIOUR_CATALOG.flatMap((definition): readonly string[] => [definition.name, ...definition.intents]),
    ...GESTURE_CATALOG.flatMap((definition) => [definition.name, ...Object.keys(definition.intents)]),
    ...EMOTE_CATALOG.map((definition) => definition.name),
    ...PROP_CATALOG.map((definition) => definition.name),
    ...MARK_CATALOG.map((definition) => definition.name),
    ...ATTENDANT_CATALOG.map((definition) => definition.name),
  ],
  propNames: PROP_CATALOG.map((definition) => definition.name),
};

/** The sources with the specs beside them, as the folder rules see the package. */
const SOURCES_WITH_SPECS: readonly PackageSource[] = [...SOURCES, ...SPEC_PATHS.map((path) => ({ path, text: '' }))];

function withPlanted(path: string, text: string): readonly PackageSource[] {
  return [...SOURCES_WITH_SPECS.filter((source) => source.path !== path), { path, text }];
}

function textOf(path: string): string {
  return SOURCES.find((source) => source.path === path)?.text ?? '';
}

describe('the scan itself', () => {
  test('it reads the package, every core file, the mind and sleep, every catalog and the animation folders', () => {
    const paths = SOURCES.map((source) => source.path);
    expect(paths.length).toBeGreaterThanOrEqual(MINIMUM_PACKAGE_FILE_COUNT);
    expect(CORE_FILES.filter((path) => textOf(path) === '')).toEqual([]);
    expect(paths.filter((path) => CORE_FOLDER_PATTERN.test(path)).length).toBeGreaterThanOrEqual(MINIMUM_CORE_FOLDER_FILE_COUNT);
    expect(CATALOG_FILES.filter((catalog) => textOf(catalog.path) === '')).toEqual([]);
    expect(subfoldersOf(paths, 'gestures/').length).toBeGreaterThanOrEqual(GESTURE_CATALOG.length);
    expect(subfoldersOf(paths, 'emotes/').length).toBeGreaterThanOrEqual(EMOTE_CATALOG.length);
    expect(subfoldersOf(paths, 'marks/').length).toBeGreaterThanOrEqual(MARK_CATALOG.length);
    expect(subfoldersOf(paths, 'behaviours/').length).toBeGreaterThanOrEqual(BEHAVIOUR_CATALOG.length);
    expect(paths.filter((path) => PROP_MODULE_PATTERN.test(path)).length).toBeGreaterThanOrEqual(PROP_CATALOG.length);
  });

  test('each core property word a behaviour shares is still a property of a core file, and still a behaviour\'s name', () => {
    const coreSources = SOURCES.filter((source) => isCoreFile(source.path));
    for (const word of CORE_PROPERTY_WORDS_A_BEHAVIOUR_SHARES) {
      expect(coreSources.some((source) => lexed(source.text).propertyWords.includes(word))).toBe(true);
      expect(NAMES.behaviours).toContain(word);
    }
  });

  test('it finds the names, the words, the property words, the parts of a template and the imports of a core file', () => {
    const renderer = lexed(textOf('SpriteRenderer.ts'));
    expect(renderer.strings).toContain('behind-body');
    expect(renderer.words).toContain('createShapeWriter');
    expect(renderer.propertyWords).toContain('nearHand');
    expect(lexed('const x = `a-${\'b\'}-c`;').strings).toEqual(['a-', '-c', 'b']);
    expect(importTargetsOf({ path: 'SpriteRenderer.ts', text: textOf('SpriteRenderer.ts') })).toContain('props/PropCatalog.ts');
    expect(importTargetsOf({ path: 'mind/IntentApplication.ts', text: textOf('mind/IntentApplication.ts') })).toContain('behaviours/BehaviourCatalog.ts');
  });
});

test('no core file names an animation or reaches into one, every animation folder is registered and every entry has its folder', () => {
  expect(findingsOf(SOURCES_WITH_SPECS, NAMES)).toEqual([]);
});

describe('the test still names each form, planted in memory', () => {
  const INSIDE = ', inside an animation';
  const plantedIn = (path: string, line: string): readonly string[] => findingsOf(withPlanted(path, `${textOf(path)}\n${line}\n`), NAMES);
  const plantedInCore = (line: string): readonly string[] => plantedIn('PoseEasing.ts', line);

  test.each([
    ['a gesture intent in a core file', 'const planted = \'type-busy\';', 'PoseEasing.ts names \'type-busy\''],
    ['an emote in a core file', 'const planted = "happy";', 'PoseEasing.ts names \'happy\''],
    ['a mark in a core file', 'const planted = `question`;', 'PoseEasing.ts names \'question\''],
    ['an attendant in a core file', 'const planted = \'watcher-spark\';', 'PoseEasing.ts names \'watcher-spark\''],
    ['an intent written as a property', 'const planted = (intents: Readonly<Record<string, number>>) => intents.refuel;', 'PoseEasing.ts names \'refuel\''],
    ['an intent written as an object key', 'const planted = { refuel: 1 };', 'PoseEasing.ts names \'refuel\''],
    ['an intent built in a template', 'const planted = (variant: string) => `type-${variant}`;', 'PoseEasing.ts names \'type-angry\''],
    ['an intent built from a hyphenated piece', 'const planted = `${\'out-of\'}-fuel`;', 'PoseEasing.ts names \'out-of-fuel\''],
    ['a prop as a word in a core file', 'const planted = (pose: Pose) => pose.props.keyboard;', 'PoseEasing.ts names the prop keyboard'],
    ['an import of a gesture module', 'import { TYPE_GESTURE } from \'./gestures/type/TypeGesture.ts\';', `PoseEasing.ts imports gestures/type/TypeGesture.ts${INSIDE}`],
    ['an import of a helper at the top of the gestures', 'import { TypingUtil } from \'./gestures/TypingUtil.ts\';', `PoseEasing.ts imports gestures/TypingUtil.ts${INSIDE}`],
    ['an import of a shared builder of the props', 'import { snapShapesOf } from \'./props/shapes/SnapShape.ts\';', `PoseEasing.ts imports props/shapes/SnapShape.ts${INSIDE}`],
    ['an import of a prop module', 'import { KEYBOARD_PROP } from \'./props/keyboard/KeyboardProp.ts\';', `PoseEasing.ts imports props/keyboard/KeyboardProp.ts${INSIDE}`],
    ['an import of a mark module', 'import { QUESTION_MARK } from \'./marks/question/QuestionMark.ts\';', `PoseEasing.ts imports marks/question/QuestionMark.ts${INSIDE}`],
    ['a behaviour in a core file', 'const planted = \'chase-bug\';', 'PoseEasing.ts names \'chase-bug\''],
    ['a first-build behaviour in a core file', 'const planted = \'cursor-play\';', 'PoseEasing.ts names \'cursor-play\''],
    ['a behaviour\'s intent written as a property', 'const planted = (intents: Readonly<Record<string, number>>) => intents.wander;', 'PoseEasing.ts names \'wander\''],
    ['the shared word as a string', 'const planted = \'sleep\';', 'PoseEasing.ts names \'sleep\''],
    [
      'an import of a behaviour module',
      'import { WANDER_BEHAVIOUR } from \'./behaviours/wander/WanderBehaviour.ts\';',
      `PoseEasing.ts imports behaviours/wander/WanderBehaviour.ts${INSIDE}`,
    ],
    ['an import of a helper at the top of the behaviours', 'import { withArrival } from \'./behaviours/Arrival.ts\';', `PoseEasing.ts imports behaviours/Arrival.ts${INSIDE}`],
  ])('%s', (_form, line, expected) => {
    expect(plantedInCore(line)).toContain(expected);
  });

  test('the mind, sleep and the motion pose are scanned as core files', () => {
    expect(plantedIn('mind/IntentApplication.ts', 'export const plantedMind = \'refuel\';')).toEqual(['mind/IntentApplication.ts names \'refuel\'']);
    expect(plantedIn('mind/RuleDirector.ts', 'export const plantedDirector = \'visit\';')).toEqual(['mind/RuleDirector.ts names \'visit\'']);
    expect(plantedIn('MotionPose.ts', 'export const plantedMotion = \'refuel\';')).toEqual(['MotionPose.ts names \'refuel\'']);
    expect(plantedIn('sleep/Embers.ts', 'export const plantedSleep = \'happy\';')).toEqual(['sleep/Embers.ts names \'happy\'']);
  });

  test('a behaviour is a module of its own, not core: it may name the animations it starts and import their modules', () => {
    expect(plantedIn('behaviours/wander/WanderBehaviour.ts', 'export const plantedWander = \'merge\';')).toEqual([]);
    expect(plantedIn('behaviours/chase-bug/ChaseBugBehaviour.ts', 'import { TYPE_GESTURE } from \'../../gestures/type/TypeGesture.ts\';')).toEqual([]);
  });

  test('the core property word a behaviour shares passes as a property, and only that word', () => {
    expect(plantedInCore('const planted = (pose: Pose) => pose.sleep.glowOpacity;')).toEqual([]);
    expect(plantedInCore('const planted = (state: { readonly copy: number }) => state.copy;')).toEqual(['PoseEasing.ts names \'copy\'']);
  });

  test('a name in a comment of a core file, and an import of a catalog, a contract or the default prop easing, pass', () => {
    expect(plantedInCore([
      '// the type-busy intent',
      '/* \'happy\' */',
      'import { GESTURE_CATALOG } from \'./gestures/GestureCatalog.ts\';',
      'import type { GestureDefinition } from \'./gestures/GestureDefinition.ts\';',
      'import { PropEasingUtil } from \'./props/PropEasingUtil.ts\';',
    ].join('\n'))).toEqual([]);
  });

  test('a gesture folder that its catalog does not register, with no spec and no values', () => {
    const planted = [...SOURCES_WITH_SPECS, { path: 'gestures/dance/DanceGesture.ts', text: 'export const DANCE_GESTURE = {};\n' }];
    expect(findingsOf(planted, NAMES)).toEqual([
      'gestures/GestureCatalog.ts does not import gestures/dance/DanceGesture.ts',
      'gestures/dance/ has no constants/DanceValues.ts',
      'gestures/dance/ is no gesture of gestures/GestureCatalog.ts, which registers each by its folder\'s name',
      'gestures/dance/DanceGesture.ts has no spec beside it',
    ]);
  });

  test('one more behaviour is one more folder and one catalog line: a folder its catalog does not register, with no spec', () => {
    const planted = [...SOURCES_WITH_SPECS, { path: 'behaviours/dance/DanceBehaviour.ts', text: 'export const DANCE_BEHAVIOUR = {};\n' }];
    expect(findingsOf(planted, NAMES)).toEqual([
      'behaviours/BehaviourCatalog.ts does not import behaviours/dance/DanceBehaviour.ts',
      'behaviours/dance/ is no behaviour of behaviours/BehaviourCatalog.ts, which registers each by its folder\'s name',
      'behaviours/dance/DanceBehaviour.ts has no spec beside it',
    ]);
    const registered = [
      ...planted,
      { path: 'behaviours/dance/DanceBehaviour.spec.ts', text: '' },
      { path: 'behaviours/BehaviourCatalog.ts', text: `${textOf('behaviours/BehaviourCatalog.ts')}\nimport { DANCE_BEHAVIOUR } from './dance/DanceBehaviour.ts';\n` },
    ].filter((source, i, all) => all.findLastIndex((other) => other.path === source.path) === i);
    expect(findingsOf(registered, { ...NAMES, behaviours: [...NAMES.behaviours, 'dance'] })).toEqual([]);
  });

  test('a behaviour with values keeps them in its values file; one with none needs none', () => {
    const planted = withPlanted('behaviours/stranded/constants/StrandedTiming.ts', 'export const STRANDED = {} as const;\n');
    expect(findingsOf(planted, NAMES)).toEqual(['behaviours/stranded/ has no constants/StrandedValues.ts']);
    expect(findingsOf(SOURCES_WITH_SPECS, NAMES).filter((finding) => finding.startsWith('behaviours/stranded/'))).toEqual([]);
  });

  test('a behaviour of the catalog with no folder of its own', () => {
    expect(findingsOf(SOURCES_WITH_SPECS, { ...NAMES, behaviours: [...NAMES.behaviours, 'juggle'] })).toEqual([
      'behaviours/BehaviourCatalog.ts registers juggle, which has no folder behaviours/juggle/',
    ]);
  });

  test('a values file named for anything but its folder', () => {
    const planted = withPlanted('emotes/happy/constants/HappyMotion.ts', 'export const HAPPY = {} as const;\n')
      .filter((source) => source.path !== 'emotes/happy/constants/HappyValues.ts');
    expect(findingsOf(planted, NAMES)).toEqual(['emotes/happy/ has no constants/HappyValues.ts']);
  });

  test('a mark that is a flat module, not a folder of its own', () => {
    const planted = withPlanted('marks/WinkMark.ts', 'export const WINK_MARK = {};\n');
    expect(findingsOf(planted, { ...NAMES, marks: [...NAMES.marks, 'wink'] })).toEqual(['marks/MarkCatalog.ts registers wink, which has no folder marks/wink/']);
  });

  test('a catalog entry with no folder of its own, for each kind', () => {
    expect(findingsOf(SOURCES_WITH_SPECS, {
      ...NAMES, emotes: [...NAMES.emotes, 'sneeze'], attendants: [...NAMES.attendants, 'moth'], marks: [...NAMES.marks, 'heart'],
    })).toEqual([
      'attendants/AttendantCatalog.ts registers moth, which has no folder attendants/moth/',
      'emotes/EmoteCatalog.ts registers sneeze, which has no folder emotes/sneeze/',
      'marks/MarkCatalog.ts registers heart, which has no folder marks/heart/',
    ]);
  });

  test('an attendant folder with two modules', () => {
    const planted = [...SOURCES_WITH_SPECS, { path: 'attendants/watcher-spark/SecondAttendant.ts', text: 'export const SECOND_ATTENDANT = {};\n' }];
    expect(findingsOf(planted, NAMES)).toEqual(['attendants/watcher-spark/ holds 2 attendant modules, not one']);
  });

  test('a prop module that the prop catalog does not register, in a gesture\'s folder and as a shared prop', () => {
    const planted = [
      ...SOURCES_WITH_SPECS,
      { path: 'gestures/review/MagnifierProp.ts', text: 'export const MAGNIFIER_PROP = {};\n' },
      { path: 'props/stamp/StampProp.ts', text: 'export const STAMP_PROP = {};\n' },
    ];
    expect(findingsOf(planted, NAMES)).toEqual([
      `gestures/review/MagnifierProp.ts is not registered in ${PROP_CATALOG_PATH}`,
      `props/stamp/StampProp.ts is not registered in ${PROP_CATALOG_PATH}`,
    ]);
  });

  test('a catalog whose list lost the form the frame capture joins', () => {
    const planted = withPlanted('emotes/EmoteCatalog.ts', textOf('emotes/EmoteCatalog.ts').replace(CATALOG_LIST_END, ']);'));
    expect(findingsOf(planted, NAMES)).toEqual([`emotes/EmoteCatalog.ts does not declare \`export const EMOTE_CATALOG = Object.freeze([\` … \`${CATALOG_LIST_END}\``]);
  });
});
