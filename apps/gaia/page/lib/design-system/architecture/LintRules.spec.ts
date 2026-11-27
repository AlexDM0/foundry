/**
 * The package's rules that its `eslint.config.js` holds, each watched failing: every form a rule claims is planted at a path it governs
 * and must be reported by that rule, and each exact exception (React as the one peer, a test package in a spec, a story or a DOM spec, a
 * number in a spec or a constants folder) is planted too and must pass. `bun run lint` is what proves the package itself passes.
 */
import { describe, expect, test } from 'bun:test';
import { ESLint }                 from 'eslint';

interface PlantedViolation {
  readonly path:   string;
  readonly text:   string;
  readonly ruleId: string;
}

const MECHANISED_RULE_IDS = [
  'no-restricted-properties',
  'no-restricted-globals',
  'no-restricted-imports',
  'no-restricted-syntax',
  '@typescript-eslint/no-non-null-assertion',
  'no-warning-comments',
  'id-length',
  '@typescript-eslint/no-magic-numbers',
  'react-hooks/rules-of-hooks',
  'import/no-extraneous-dependencies',
];

const CONDITIONAL_HOOK = 'import { useState } from \'react\';\n\nexport function View({ on }: { on: boolean }) {\n  if (on) useState(0);\n  return null;\n}\n';
const TEST_PACKAGE_IMPORT = 'import { render } from \'@testing-library/react\';\n\nexport const draw = render;\n';
const MAGIC_NUMBER = 'export const scaled = (side: number): number => side * 7;\n';

const LINTER = new ESLint({ cwd: `${import.meta.dir}/..` });

async function ruleIdsReportedFor(path: string, text: string): Promise<string[]> {
  const [result] = await LINTER.lintText(text, { filePath: path });
  return (result?.messages ?? []).map((message) => message.ruleId ?? 'parse-error');
}

const PLANTED_VIOLATIONS: readonly PlantedViolation[] = [
  { path: 'atoms/Planted.tsx', text: 'export const view = <div dangerouslySetInnerHTML={{ __html: \'<b>bold</b>\' }} />;\n', ruleId: 'no-restricted-syntax' },
  { path: 'molecules/Planted.ts', text: 'export const fill = (element: Element): void => {\n  element.innerHTML = \'<b>bold</b>\';\n};\n', ruleId: 'no-restricted-syntax' },
  { path: 'organisms/Planted.ts', text: 'export const stored = localStorage.getItem(\'key\');\n', ruleId: 'no-restricted-globals' },
  { path: 'organisms/Planted.ts', text: 'export const storage = window.sessionStorage;\n', ruleId: 'no-restricted-properties' },
  { path: 'organisms/Planted.tsx', text: CONDITIONAL_HOOK, ruleId: 'react-hooks/rules-of-hooks' },
  { path: 'atoms/Planted.ts', text: TEST_PACKAGE_IMPORT, ruleId: 'import/no-extraneous-dependencies' },
  { path: 'atoms/Planted.ts', text: 'export const home = process.env[\'HOME\'];\n', ruleId: 'no-restricted-properties' },
  { path: 'atoms/Planted.ts', text: 'export const platform = process.platform;\n', ruleId: 'no-restricted-properties' },
  { path: 'atoms/Planted.ts', text: 'export const value = \'text\';\r\n', ruleId: '@stylistic/linebreak-style' },
  { path: 'atoms/Planted.ts', text: 'export const firstOf = (list: string[]): string => list[0]!;\n', ruleId: '@typescript-eslint/no-non-null-assertion' },
  { path: 'atoms/Planted.ts', text: '// TODO: name the value\nexport const value = 1;\n', ruleId: 'no-warning-comments' },
  { path: 'atoms/Planted.ts', text: 'export const x = \'value\';\n', ruleId: 'id-length' },
  { path: 'atoms/Planted.ts', text: MAGIC_NUMBER, ruleId: '@typescript-eslint/no-magic-numbers' },
];

const PLANTED_EXCEPTIONS: readonly (readonly [string, string, string])[] = [
  ['a component importing React, its one peer', 'atoms/Planted.ts', 'import { useState } from \'react\';\n\nexport const state = useState;\n'],
  [
    'a spec importing a test package of the workspace',
    'atoms/Planted.spec.ts',
    'import { GlobalRegistrator } from \'@happy-dom/global-registrator\';\n\nexport const register = GlobalRegistrator;\n',
  ],
  ['a DOM spec importing a test package of the workspace', 'atoms/Planted.dom.tsx', TEST_PACKAGE_IMPORT],
  ['a story importing Storybook', 'atoms/Planted.stories.tsx', 'import type { Meta } from \'@storybook/react-vite\';\n\nexport type Story = Meta;\n'],
  ['a spec reading the platform', 'atoms/Planted.spec.ts', 'export const platform = process.platform;\n'],
  ['a number in a spec', 'atoms/Planted.spec.ts', MAGIC_NUMBER],
  ['a number in a constants folder', 'constants/Planted.ts', MAGIC_NUMBER],
];

describe('the mechanised rules in the package\'s eslint.config.js', () => {
  test.each(PLANTED_VIOLATIONS.map((planted) => [`${planted.ruleId} in ${planted.path}: ${planted.text.trim()}`, planted] as const))(
    'reports %s',
    async (_title, planted) => {
      expect(await ruleIdsReportedFor(planted.path, planted.text)).toContain(planted.ruleId);
    },
  );

  test.each(PLANTED_EXCEPTIONS)('lets through %s', async (_title, path, text) => {
    const reported = await ruleIdsReportedFor(path, text);
    expect(reported.filter((ruleId) => MECHANISED_RULE_IDS.includes(ruleId) || ruleId === 'parse-error')).toEqual([]);
  });
});
