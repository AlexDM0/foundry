/**
 * The stylesheets the Bridge's page loads, for the style guards: every stylesheet of the package `design-system/`, then the Bridge's own
 * `bridge/styles/tokens.css` and `bridge/styles/board.css`, each named by its repository path. Test-only.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

export interface PageStylesheet {
  readonly path: string;
  readonly text: string;
}

const REPOSITORY_ROOT = join(import.meta.dir, '..', '..');
const BRIDGE_STYLESHEET_PATHS = ['bridge/styles/tokens.css', 'bridge/styles/board.css'];

export function pageStylesheets(): PageStylesheet[] {
  const designSystemPaths = [...new Bun.Glob('design-system/**/*.css').scanSync({ cwd: REPOSITORY_ROOT })]
    .map((path) => path.split('\\').join('/'))
    .filter((path) => !path.split('/').includes('node_modules'))
    .sort();
  return [...designSystemPaths, ...BRIDGE_STYLESHEET_PATHS].map((path) => ({ path, text: readFileSync(join(REPOSITORY_ROOT, path), 'utf8') }));
}
