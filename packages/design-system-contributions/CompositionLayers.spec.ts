/**
 * The composition rule of the package: a component imports only the components of a lower layer. An atom imports no component, a
 * molecule imports atoms, and an organism imports atoms and molecules. Any of them may import `utils/` and `@types/`, which import no
 * component, and every component sits in one of the three layer folders. A component of the design-system package, imported by its export
 * name, sits in the layer its export names, as it will once these files move into that package. A story or a spec may import any component,
 * and nothing that ships imports a story. The scan first proves it read each layer and found its imports, and each form is planted.
 */
import { describe, expect, test } from 'bun:test';

import { DESIGN_SYSTEM_PREFIX, designSystemExports } from './testing/DesignSystemPackage.ts';
import {
  COMPONENT_LAYERS,
  isShippingComponent,
  isStory,
  isTestCode,
  layerOf,
  moduleSpecifiersOf,
  packageFilesMatching,
  targetPathOf,
  type ComponentLayer,
  type PackageFile
} from './testing/PackageFiles.ts';

/** The folders below every layer, which any component may import. */
const SHARED_FOLDERS = ['utils/', '@types/'];
const MINIMUM_COMPONENT_COUNT_PER_LAYER = 1;
const ONE_COMPONENT_OF: Readonly<Record<ComponentLayer, string>> = { atoms: 'an atom', molecules: 'a molecule', organisms: 'an organism' };

function layerRankOf(path: string): number {
  const layer = layerOf(path);
  return layer === null ? -1 : COMPONENT_LAYERS.indexOf(layer);
}

/** The package-relative path an import names: a relative one in this package, an export name in the design-system package. */
function importedPathOf(fromPath: string, specifier: string, designSystemPaths: ReadonlyMap<string, string>): string | null {
  if (specifier.startsWith('.')) return targetPathOf(fromPath, specifier);
  if (specifier.startsWith(DESIGN_SYSTEM_PREFIX)) return designSystemPaths.get(specifier.slice(DESIGN_SYSTEM_PREFIX.length)) ?? null;
  return null;
}

function compositionSentencesOf(sources: readonly PackageFile[], designSystemPaths: ReadonlyMap<string, string>): readonly string[] {
  const shipping = sources.filter((source) => !isTestCode(source.path) && !isStory(source.path));
  const outsideTheLayers = shipping
    .filter((source) => isShippingComponent(source.path) && layerOf(source.path) === null)
    .map((source) => `${source.path} is a component outside ${COMPONENT_LAYERS.join(', ')}`);
  const edges = shipping.flatMap((source) => moduleSpecifiersOf(source).flatMap((specifier) => {
    const targetPath = importedPathOf(source.path, specifier, designSystemPaths);
    return targetPath === null ? [] : [{ fromPath: source.path, targetPath }];
  }));
  const edgeSentences = edges.flatMap(({ fromPath, targetPath }): string[] => {
    const fromLayer = layerOf(fromPath);
    const targetLayer = layerOf(targetPath);
    if (isStory(targetPath)) return [`${fromPath} imports the story ${targetPath}; nothing that ships imports a story`];
    if (SHARED_FOLDERS.some((folder) => targetPath.startsWith(folder)) || targetLayer === null) return [];
    if (fromLayer === null) return [`${fromPath} imports the component ${targetPath}; only a component of a higher layer imports one`];
    if (layerRankOf(targetPath) < layerRankOf(fromPath)) return [];
    return [`${fromPath} imports ${targetPath}: ${ONE_COMPONENT_OF[fromLayer]} imports only the components of a lower layer`];
  });
  return [...outsideTheLayers, ...edgeSentences].sort();
}

const SOURCES = packageFilesMatching('**/*.{ts,tsx}');
const DESIGN_SYSTEM_PATHS = designSystemExports();

describe('the scan itself', () => {
  test('it finds the components of each layer', () => {
    for (const layer of COMPONENT_LAYERS) {
      const components = SOURCES.filter((source) => layerOf(source.path) === layer && isShippingComponent(source.path));
      expect(components.length, `components in ${layer}/`).toBeGreaterThanOrEqual(MINIMUM_COMPONENT_COUNT_PER_LAYER);
    }
  });

  test('it finds the compositions a molecule makes, and the layer of a design-system component by its export name', () => {
    const importsOf = (path: string): readonly string[] => moduleSpecifiersOf(SOURCES.find((source) => source.path === path) ?? { path, text: '' });
    expect(importsOf('molecules/PageHead.tsx')).toEqual(expect.arrayContaining(['../atoms/Figure.tsx', 'design-system/Text']));
    expect(importsOf('molecules/FailedAction.tsx')).toContain('design-system/Button');
    expect(DESIGN_SYSTEM_PATHS.get('Button')).toBe('atoms/Button.tsx');
    expect(DESIGN_SYSTEM_PATHS.get('StateTone')).toBe('@types/StateTone.ts');
  });
});

test('every component sits in a layer and imports only the components of a lower layer, the design-system package\'s among them', () => {
  expect(compositionSentencesOf(SOURCES, DESIGN_SYSTEM_PATHS)).toEqual([]);
});

describe('the guard still names each form, planted in memory', () => {
  const importing = (path: string, specifier: string): PackageFile => ({ path, text: `import { Planted } from '${specifier}';\n` });
  const plantedExports = new Map([['Button', 'atoms/Button.tsx'], ['Card', 'molecules/Card.tsx'], ['Dialog', 'organisms/Dialog.tsx'], ['StateTone', '@types/StateTone.ts']]);

  test('an atom importing an atom, a molecule importing a molecule or an organism, and an organism importing an organism', () => {
    expect(compositionSentencesOf([
      importing('atoms/Planted.tsx', './TextField.tsx'),
      importing('atoms/PlantedField.tsx', 'design-system/Button'),
      importing('molecules/Planted.tsx', './PageHead.tsx'),
      importing('molecules/PlantedCard.tsx', 'design-system/Dialog'),
      importing('organisms/Planted.tsx', './DataTable.tsx'),
    ], plantedExports)).toEqual([
      'atoms/Planted.tsx imports atoms/TextField.tsx: an atom imports only the components of a lower layer',
      'atoms/PlantedField.tsx imports atoms/Button.tsx: an atom imports only the components of a lower layer',
      'molecules/Planted.tsx imports molecules/PageHead.tsx: a molecule imports only the components of a lower layer',
      'molecules/PlantedCard.tsx imports organisms/Dialog.tsx: a molecule imports only the components of a lower layer',
      'organisms/Planted.tsx imports organisms/DataTable.tsx: an organism imports only the components of a lower layer',
    ]);
  });

  test('a helper importing a component, a component outside the three layers, and a component importing a story', () => {
    expect(compositionSentencesOf([
      importing('utils/PlantedUtil.ts', 'design-system/Button'),
      { path: 'PlantedPart.tsx', text: 'export const part = 1;\n' },
      importing('organisms/Planted.tsx', '../atoms/TextField.stories.tsx'),
    ], plantedExports)).toEqual([
      'PlantedPart.tsx is a component outside atoms, molecules, organisms',
      'organisms/Planted.tsx imports the story atoms/TextField.stories.tsx; nothing that ships imports a story',
      'utils/PlantedUtil.ts imports the component atoms/Button.tsx; only a component of a higher layer imports one',
    ]);
  });

  test('an organism importing a molecule of either package, an atom, a helper and a type, and a spec or a story importing anything, pass', () => {
    expect(compositionSentencesOf([
      importing('organisms/Planted.tsx', '../molecules/PageHead.tsx'),
      importing('organisms/PlantedCard.tsx', 'design-system/Card'),
      importing('organisms/PlantedPanel.tsx', 'design-system/Button'),
      importing('molecules/Planted.tsx', '../utils/ThemeCycleUtil.ts'),
      importing('atoms/Planted.tsx', 'design-system/StateTone'),
      importing('atoms/Planted.dom.tsx', '../organisms/DataTable.tsx'),
      importing('atoms/Planted.stories.tsx', 'design-system/Dialog'),
    ], plantedExports)).toEqual([]);
  });
});
