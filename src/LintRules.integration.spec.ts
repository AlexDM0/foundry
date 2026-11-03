/**
 * The one mechanised rule of `eslint.config.js` that `src/LintRules.spec.ts` cannot plant in process: the shared config picks its line
 * ending from `process.platform` at load, so the rule is resolved in a child whose platform reads win32, the shared config's own answer
 * there proving the condition took.
 */
import { expect, test } from 'bun:test';

import { repositoryRootOfThisCheckout } from './testing/ImportGraph.ts';

const LINEBREAK_RULE_ID = '@stylistic/linebreak-style';

const WIN32_CHILD_TIMEOUT_MILLISECONDS = 30_000;

const LINEBREAK_STYLES_UNDER_WIN32_SCRIPT = `
Object.defineProperty(process, 'platform', { value: 'win32' });
const { default: sharedConfig } = await import('@reliquary/eslint-config');
const { ESLint } = await import('eslint');
const sharedRule = sharedConfig.find((entry) => entry.rules?.['${LINEBREAK_RULE_ID}'])?.rules['${LINEBREAK_RULE_ID}'];
const resolvedConfig = await new ESLint({ cwd: process.cwd() }).calculateConfigForFile('cli/Planted.ts');
console.log(JSON.stringify({ shared: sharedRule[1], resolved: resolvedConfig.rules['${LINEBREAK_RULE_ID}'][1] }));
`;

test('the mechanised line ending resolves to unix under a win32 process.platform, where the shared config alone demands windows', () => {
  const child = Bun.spawnSync([process.execPath, '-e', LINEBREAK_STYLES_UNDER_WIN32_SCRIPT], { cwd: repositoryRootOfThisCheckout(), stdout: 'pipe', stderr: 'pipe' });
  expect(child.stderr.toString()).toBe('');
  expect(JSON.parse(child.stdout.toString())).toEqual({ shared: 'windows', resolved: 'unix' });
}, WIN32_CHILD_TIMEOUT_MILLISECONDS);
