/**
 * The stylesheets the Bridge's page loads, for the style guards: every stylesheet of the package `design-system`, then the Bridge's own
 * `bridge/styles/tokens.css` and `bridge/styles/board.css`. A package stylesheet is named `design-system/<path in the package>` and a
 * Bridge one by its path in the forge, wherever the workspace keeps the package. Test-only.
 */
import { readFileSync }  from 'node:fs';
import { dirname, join } from 'node:path';

export interface PageStylesheet {
  readonly path: string;
  readonly text: string;
}

const PROGRAM_ROOT = join(import.meta.dir, '..', '..');
const DESIGN_SYSTEM_PACKAGE_NAME = 'design-system';
const BRIDGE_STYLESHEET_PATHS = ['bridge/styles/tokens.css', 'bridge/styles/board.css'];

/** The design-system package's folder, resolved as the Bridge imports it, through the workspace link. */
export function designSystemFolder(): string {
  return dirname(Bun.resolveSync(`${DESIGN_SYSTEM_PACKAGE_NAME}/package.json`, PROGRAM_ROOT));
}

export function pageStylesheets(): PageStylesheet[] {
  const packageFolder = designSystemFolder();
  const designSystemStylesheets = [...new Bun.Glob('**/*.css').scanSync({ cwd: packageFolder })]
    .map((path) => path.split('\\').join('/'))
    .filter((path) => !path.split('/').includes('node_modules'))
    .sort()
    .map((path) => ({ path: `${DESIGN_SYSTEM_PACKAGE_NAME}/${path}`, text: readFileSync(join(packageFolder, path), 'utf8') }));
  const bridgeStylesheets = BRIDGE_STYLESHEET_PATHS.map((path) => ({ path, text: readFileSync(join(PROGRAM_ROOT, path), 'utf8') }));
  return [...designSystemStylesheets, ...bridgeStylesheets];
}
