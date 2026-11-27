/**
 * The composition rule of the package: a component imports only the components of a lower layer. An atom imports no component, a
 * molecule imports atoms, and an organism imports atoms and molecules. Any of them may import `utils/` and `@types/`, which import no
 * component, and every component sits in one of the three layer folders. A story or a spec may import any component, and nothing that
 * ships imports a story. The interface file names every component for the code outside the library, so it alone stands outside the layers
 * and imports them all. The scan first proves it read each layer and found its imports, and each form is planted in memory.
 */
import { describe, expect, test } from 'bun:test';

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
} from '../testing/PackageFiles.ts';

/** The folders below every layer, which any component may import. */
const SHARED_FOLDERS = ['utils/', '@types/'];
const INTERFACE_FILE_PATH = 'DesignSystemInterface.ts';
const MINIMUM_COMPONENT_COUNT_PER_LAYER = 5;
const ONE_COMPONENT_OF: Readonly<Record<ComponentLayer, string>> = { atoms: 'an atom', molecules: 'a molecule', organisms: 'an organism' };

function layerRankOf(path: string): number {
  const layer = layerOf(path);
  return layer === null ? -1 : COMPONENT_LAYERS.indexOf(layer);
}

function compositionSentencesOf(sources: readonly PackageFile[]): readonly string[] {
  const shipping = sources.filter((source) => !isTestCode(source.path) && !isStory(source.path) && source.path !== INTERFACE_FILE_PATH);
  const outsideTheLayers = shipping
    .filter((source) => isShippingComponent(source.path) && layerOf(source.path) === null)
    .map((source) => `${source.path} is a component outside ${COMPONENT_LAYERS.join(', ')}`);
  const edges = shipping.flatMap((source) => moduleSpecifiersOf(source)
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => ({ fromPath: source.path, targetPath: targetPathOf(source.path, specifier) })));
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

describe('the scan itself', () => {
  test('it finds the components of each layer', () => {
    for (const layer of COMPONENT_LAYERS) {
      const components = SOURCES.filter((source) => layerOf(source.path) === layer && isShippingComponent(source.path));
      expect(components.length, `components in ${layer}/`).toBeGreaterThanOrEqual(MINIMUM_COMPONENT_COUNT_PER_LAYER);
    }
  });

  test('it finds the compositions a molecule and an organism make', () => {
    const importsOf = (path: string): readonly string[] => moduleSpecifiersOf(SOURCES.find((source) => source.path === path) ?? { path, text: '' });
    expect(importsOf('molecules/Tag.tsx')).toContain('../atoms/StateDot.tsx');
    expect(importsOf('organisms/MultipleChoiceQuestion.tsx')).toContain('../molecules/ChoiceOption.tsx');
    expect(importsOf('organisms/MultipleChoiceQuestion.tsx')).toContain('../atoms/Button.tsx');
  });
});

test('every component sits in a layer and imports only the components of a lower layer', () => {
  expect(compositionSentencesOf(SOURCES)).toEqual([]);
});

describe('the guard still names each form, planted in memory', () => {
  const importing = (path: string, specifier: string): PackageFile => ({ path, text: `import { Planted } from '${specifier}';\n` });

  test('an atom importing an atom, a molecule importing a molecule or an organism, and an organism importing an organism', () => {
    expect(compositionSentencesOf([
      importing('atoms/Planted.tsx', './Button.tsx'),
      importing('molecules/Planted.tsx', './Tag.tsx'),
      importing('molecules/PlantedCard.tsx', '../organisms/Pane.tsx'),
      importing('organisms/Planted.tsx', './Dialog.tsx'),
    ])).toEqual([
      'atoms/Planted.tsx imports atoms/Button.tsx: an atom imports only the components of a lower layer',
      'molecules/Planted.tsx imports molecules/Tag.tsx: a molecule imports only the components of a lower layer',
      'molecules/PlantedCard.tsx imports organisms/Pane.tsx: a molecule imports only the components of a lower layer',
      'organisms/Planted.tsx imports organisms/Dialog.tsx: an organism imports only the components of a lower layer',
    ]);
  });

  test('a helper importing a component, a component outside the three layers, and a component importing a story', () => {
    expect(compositionSentencesOf([
      importing('utils/PlantedUtil.ts', '../atoms/Button.tsx'),
      { path: 'PlantedPart.tsx', text: 'export const part = 1;\n' },
      importing('organisms/Planted.tsx', '../atoms/Button.stories.tsx'),
    ])).toEqual([
      'PlantedPart.tsx is a component outside atoms, molecules, organisms',
      'organisms/Planted.tsx imports the story atoms/Button.stories.tsx; nothing that ships imports a story',
      'utils/PlantedUtil.ts imports the component atoms/Button.tsx; only a component of a higher layer imports one',
    ]);
  });

  test('an organism importing a molecule, an atom, a helper and a type, and a spec or a story importing anything, pass', () => {
    expect(compositionSentencesOf([
      importing('organisms/Planted.tsx', '../molecules/Tag.tsx'),
      importing('organisms/PlantedPanel.tsx', '../atoms/Button.tsx'),
      importing('molecules/Planted.tsx', '../utils/Dismissal.ts'),
      importing('atoms/Planted.tsx', '../@types/StateTone.ts'),
      importing('atoms/Planted.dom.tsx', '../organisms/Dialog.tsx'),
      importing('atoms/Planted.stories.tsx', '../molecules/Card.tsx'),
    ])).toEqual([]);
  });
});
