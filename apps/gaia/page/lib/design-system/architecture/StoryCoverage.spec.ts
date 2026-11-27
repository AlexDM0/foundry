/**
 * Every component the interface file exports has a story beside it, and every story sits beside an exported component with its meta titled
 * `<Layer>/<Component>`, read from the syntax tree, so Storybook's tree mirrors the layers. The scan first proves it read the interface file and
 * the stories, and each form is planted in memory.
 */
import { describe, expect, test } from 'bun:test';
import ts                         from 'typescript';

import {
  isStory,
  layerOf,
  moduleSpecifiersOf,
  packageFilesMatching,
  targetPathOf,
  type PackageFile
} from '../testing/PackageFiles.ts';

const STORY_SUFFIX = '.stories.tsx';
const COMPONENT_SUFFIX = '.tsx';
const MINIMUM_EXPORTED_COMPONENT_COUNT = 40;

/** The library-relative paths of the components the interface file exports: a `.tsx` file in a layer folder. */
function exportedComponentPathsOf(interfaceFile: PackageFile): readonly string[] {
  const exportedPaths = moduleSpecifiersOf(interfaceFile).map((specifier) => targetPathOf(interfaceFile.path, specifier));
  return [...new Set(exportedPaths)]
    .filter((path) => path.endsWith(COMPONENT_SUFFIX) && layerOf(path) !== null)
    .sort();
}

function storyPathOf(componentPath: string): string {
  return `${componentPath.slice(0, -COMPONENT_SUFFIX.length)}${STORY_SUFFIX}`;
}

function componentPathOf(storyPath: string): string {
  return `${storyPath.slice(0, -STORY_SUFFIX.length)}${COMPONENT_SUFFIX}`;
}

/** The title the story of a component carries: its layer folder capitalised, then its file name. */
function expectedTitleOf(componentPath: string): string {
  const [layer = '', fileName = ''] = componentPath.split('/');
  return `${layer.charAt(0).toUpperCase()}${layer.slice(1)}/${fileName.slice(0, -COMPONENT_SUFFIX.length)}`;
}

/** The `title` of the object literal that names a `component`, or `null` when there is none or it is not a string literal. */
function storyTitleOf(story: PackageFile): string | null {
  const sourceFile = ts.createSourceFile(story.path, story.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let title: string | null = null;
  const propertyNamed = (literal: ts.ObjectLiteralExpression, name: string): ts.PropertyAssignment | undefined => literal.properties
    .find((property): property is ts.PropertyAssignment => ts.isPropertyAssignment(property) && property.name.getText(sourceFile) === name);
  const visit = (node: ts.Node): void => {
    if (title === null && ts.isObjectLiteralExpression(node) && propertyNamed(node, 'component') !== undefined) {
      const initializer = propertyNamed(node, 'title')?.initializer;
      if (initializer !== undefined && ts.isStringLiteralLike(initializer)) title = initializer.text;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return title;
}

function coverageSentencesOf(componentPaths: readonly string[], stories: readonly PackageFile[]): readonly string[] {
  const storyPaths = stories.map((story) => story.path);
  const missingStories = componentPaths
    .filter((componentPath) => !storyPaths.includes(storyPathOf(componentPath)))
    .map((componentPath) => `${componentPath} has no story beside it: add ${storyPathOf(componentPath)}`);
  const storySentences = stories.flatMap((story): string[] => {
    const componentPath = componentPathOf(story.path);
    if (!componentPaths.includes(componentPath)) return [`${story.path} sits beside no component that the interface file exports`];
    const title = storyTitleOf(story);
    const expectedTitle = expectedTitleOf(componentPath);
    if (title === null) return [`${story.path} has no meta with a component and a literal title; title it ${expectedTitle}`];
    return title === expectedTitle ? [] : [`${story.path} is titled ${title}; title it ${expectedTitle}`];
  });
  return [...missingStories, ...storySentences].sort();
}

const INTERFACE_FILE_PATH = 'DesignSystemInterface.ts';
const INTERFACE_FILE = packageFilesMatching(INTERFACE_FILE_PATH)[0] ?? { path: INTERFACE_FILE_PATH, text: '' };
const EXPORTED_COMPONENT_PATHS = exportedComponentPathsOf(INTERFACE_FILE);
const STORIES = packageFilesMatching(`**/*${STORY_SUFFIX}`).filter((source) => isStory(source.path));

describe('the scan itself', () => {
  test('it reads the exported components and the stories, and finds a title in a story', () => {
    expect(EXPORTED_COMPONENT_PATHS.length).toBeGreaterThanOrEqual(MINIMUM_EXPORTED_COMPONENT_COUNT);
    expect(EXPORTED_COMPONENT_PATHS).toContain('atoms/Button.tsx');
    expect(EXPORTED_COMPONENT_PATHS).toContain('organisms/Dialog.tsx');
    expect(EXPORTED_COMPONENT_PATHS).not.toContain('utils/Dismissal.ts');
    expect(STORIES.length).toBeGreaterThanOrEqual(MINIMUM_EXPORTED_COMPONENT_COUNT);
    expect(storyTitleOf(STORIES.find((story) => story.path === 'atoms/Button.stories.tsx') ?? { path: '', text: '' })).toBe('Atoms/Button');
  });
});

test('every exported component has a story beside it, and every story shows an exported component under its layer', () => {
  expect(coverageSentencesOf(EXPORTED_COMPONENT_PATHS, STORIES)).toEqual([]);
});

describe('the test still names each form, planted in memory', () => {
  const story = (path: string, title: string): PackageFile => ({
    path,
    text: `const meta = { title: '${title}', component: Planted };\nexport default meta;\n`,
  });

  test('a component with no story, a story beside no exported component, a wrong title and a story with no titled meta', () => {
    expect(coverageSentencesOf(['atoms/Planted.tsx', 'molecules/PlantedCard.tsx', 'organisms/PlantedPanel.tsx'], [
      story('atoms/Orphan.stories.tsx', 'Atoms/Orphan'),
      story('molecules/PlantedCard.stories.tsx', 'Atoms/PlantedCard'),
      { path: 'organisms/PlantedPanel.stories.tsx', text: 'export default { component: PlantedPanel };\n' },
    ])).toEqual([
      'atoms/Orphan.stories.tsx sits beside no component that the interface file exports',
      'atoms/Planted.tsx has no story beside it: add atoms/Planted.stories.tsx',
      'molecules/PlantedCard.stories.tsx is titled Atoms/PlantedCard; title it Molecules/PlantedCard',
      'organisms/PlantedPanel.stories.tsx has no meta with a component and a literal title; title it Organisms/PlantedPanel',
    ]);
  });

  test('a component with its story under the right title passes, and a title outside the meta is not read', () => {
    expect(coverageSentencesOf(['atoms/Planted.tsx'], [{
      path: 'atoms/Planted.stories.tsx',
      text: 'const words = { title: \'Elsewhere/Planted\' };\nconst meta = { title: \'Atoms/Planted\', component: Planted };\n',
    }])).toEqual([]);
  });

  test('only a component in a layer folder is an exported component', () => {
    expect(exportedComponentPathsOf({
      path: 'DesignSystemInterface.ts',
      text: [
        'export { Planted } from \'./atoms/Planted.tsx\';',
        'export type { PlantedProps } from \'./atoms/Planted.tsx\';',
        'export { PlantedUtil } from \'./utils/PlantedUtil.ts\';',
        'export { PlantedProbe } from \'./testing/PlantedProbe.tsx\';',
      ].join('\n'),
    })).toEqual(['atoms/Planted.tsx']);
  });
});
