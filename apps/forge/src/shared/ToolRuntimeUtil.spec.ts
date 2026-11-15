/**
 * The Bun arguments that start the tool apart from its working directory. What matters: no `.env` file is loaded, the configuration is
 * the tool's own `bunfig.toml` in the `=` form (with a space, Bun still loads the working directory's), and this checkout's arguments
 * name the checkout root that holds the bin shim and that `bunfig.toml`.
 */
import { existsSync }   from 'node:fs';
import { join }         from 'node:path';
import { expect, test } from 'bun:test';

import { ToolRuntimeUtil } from './ToolRuntimeUtil.ts';

test('the arguments load no env file and take the tool folder\'s bunfig through the equals form', () => {
  expect(ToolRuntimeUtil.isolatingArgumentsFor(join('/example-agency', 'tool'))).toEqual([
    '--no-env-file',
    `--config=${join('/example-agency', 'tool', 'bunfig.toml')}`,
  ]);
});

test('this checkout\'s arguments name the checkout root, which holds the bin shim and the bunfig they configure', () => {
  const checkoutRoot = join(import.meta.dir, '..', '..');
  const configurationArgument = ToolRuntimeUtil.isolatingArgumentsOfThisCheckout().find((argument) => argument.startsWith('--config='));

  expect(ToolRuntimeUtil.isolatingArgumentsOfThisCheckout()).toEqual(ToolRuntimeUtil.isolatingArgumentsFor(checkoutRoot));
  expect(existsSync(join(checkoutRoot, 'agent-progress.ts'))).toBe(true);
  expect(existsSync(configurationArgument?.slice('--config='.length) ?? '')).toBe(true);
});
