/**
 * The stylesheets a board in Gaia's page loads, for a DOM spec that lays the board out as the page does: every stylesheet of the package
 * `design-system`, then the board's own under `page/styles/board/`, its tokens first. A package stylesheet is named
 * `design-system/<path in the package>` and a board one `page/styles/board/<name>`. Test-only.
 */
import { readFileSync }  from 'node:fs';
import { dirname, join } from 'node:path';

export interface PageStylesheet {
  readonly path: string;
  readonly text: string;
}

const GAIA_FOLDER = join(import.meta.dir, '..', '..', '..');
const BOARD_STYLESHEET_FOLDER = 'page/styles/board';
const BOARD_TOKENS_STYLESHEET_NAME = 'tokens.css';
const DESIGN_SYSTEM_PACKAGE_NAME = 'design-system';

/** The design-system package's folder, resolved as the page imports it, through the workspace link. */
export function designSystemFolder(): string {
  return dirname(Bun.resolveSync(`${DESIGN_SYSTEM_PACKAGE_NAME}/package.json`, GAIA_FOLDER));
}

function boardStylesheetNames(): string[] {
  const names = [...new Bun.Glob('*.css').scanSync({ cwd: join(GAIA_FOLDER, BOARD_STYLESHEET_FOLDER) })].sort();
  return [BOARD_TOKENS_STYLESHEET_NAME, ...names.filter((name) => name !== BOARD_TOKENS_STYLESHEET_NAME)];
}

export function pageStylesheets(): PageStylesheet[] {
  const packageFolder = designSystemFolder();
  const designSystemStylesheets = [...new Bun.Glob('**/*.css').scanSync({ cwd: packageFolder })]
    .map((path) => path.split('\\').join('/'))
    .filter((path) => !path.split('/').includes('node_modules'))
    .sort()
    .map((path) => ({ path: `${DESIGN_SYSTEM_PACKAGE_NAME}/${path}`, text: readFileSync(join(packageFolder, path), 'utf8') }));
  const boardStylesheets = boardStylesheetNames().map((name) => {
    const path = `${BOARD_STYLESHEET_FOLDER}/${name}`;
    return { path, text: readFileSync(join(GAIA_FOLDER, path), 'utf8') };
  });
  return [...designSystemStylesheets, ...boardStylesheets];
}
