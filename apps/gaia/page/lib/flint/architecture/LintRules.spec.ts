/**
 * Each rule of the package's `eslint.config.js` watched failing: every form a rule forbids is planted at a path it governs and must be
 * reported, and each exact exception is planted and must pass. `bun run lint` proves the package itself passes.
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
  'react-hooks/rules-of-hooks',
  'import/no-extraneous-dependencies',
];

const CONDITIONAL_HOOK = 'import { useState } from \'react\';\n\nexport function View({ on }: { on: boolean }) {\n  if (on) useState(0);\n  return null;\n}\n';
const TEST_PACKAGE_IMPORT = 'import { render } from \'@testing-library/react\';\n\nexport const draw = render;\n';

const LINTER = new ESLint({ cwd: `${import.meta.dir}/..` });

async function ruleIdsReportedFor(path: string, text: string): Promise<string[]> {
  const [result] = await LINTER.lintText(text, { filePath: path });
  return (result?.messages ?? []).map((message) => message.ruleId ?? 'parse-error');
}

const PLANTED_VIOLATIONS: readonly PlantedViolation[] = [
  ...[
    'export const now = Date.now();\n',
    'export const now = performance.now();\n',
    'export const now = new Date();\n',
    'export const fill = (element: Element): void => {\n  element.innerHTML = \'<b>bold</b>\';\n};\n',
    'export const swap = (element: Element): void => {\n  element.outerHTML = \'<b>bold</b>\';\n};\n',
    'export const add = (element: Element): void => {\n  element.insertAdjacentHTML(\'beforeend\', \'<b>bold</b>\');\n};\n',
    'export const answer = fetch(\'/api\');\n',
    'export const request = new XMLHttpRequest();\n',
    'export const socket = new WebSocket(\'ws://example.test\');\n',
    'export const stream = new EventSource(\'/events\');\n',
    'export const database = indexedDB;\n',
  ].map((text) => ({ path: 'Planted.ts', text, ruleId: 'no-restricted-syntax' })),
  { path: 'react/Planted.tsx', text: 'export const view = <div dangerouslySetInnerHTML={{ __html: \'<b>bold</b>\' }} />;\n', ruleId: 'no-restricted-syntax' },
  { path: 'Planted.ts', text: 'export const stored = localStorage.getItem(\'key\');\n', ruleId: 'no-restricted-globals' },
  { path: 'Planted.ts', text: 'export const home = process.env[\'HOME\'];\n', ruleId: 'no-restricted-properties' },
  { path: 'react/Planted.tsx', text: CONDITIONAL_HOOK, ruleId: 'react-hooks/rules-of-hooks' },
  { path: 'Planted.ts', text: TEST_PACKAGE_IMPORT, ruleId: 'import/no-extraneous-dependencies' },
];

const PLANTED_EXCEPTIONS: readonly (readonly [string, string, string])[] = [
  [
    'a spec importing a test package of the workspace',
    'Planted.spec.ts',
    'import { GlobalRegistrator } from \'@happy-dom/global-registrator\';\n\nexport const register = GlobalRegistrator;\n',
  ],
  ['a DOM spec importing a test package of the workspace', 'Planted.dom.tsx', TEST_PACKAGE_IMPORT],
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
