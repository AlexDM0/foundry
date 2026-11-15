/**
 * The design-system package as this package's guards read it: its folder, found through its entry stylesheet's export since it exports no
 * path to its manifest, the entries of its `exports` map, and a stylesheet of its `styles/` folder. Test-only.
 */
import { readFileSync }  from 'node:fs';
import { dirname, join } from 'node:path';

import { PACKAGE_FOLDER } from './PackageFiles.ts';

/** The prefix by which this package imports the design-system package: its name and a slash, then an export's name. */
export const DESIGN_SYSTEM_PREFIX = 'design-system/';

function designSystemFolder(): string {
  return join(dirname(Bun.resolveSync(`${DESIGN_SYSTEM_PREFIX}design-system.css`, PACKAGE_FOLDER)), '..');
}

/** Each export name of the design-system package with the package-relative path it names, such as `Button` to `atoms/Button.tsx`. */
export function designSystemExports(): ReadonlyMap<string, string> {
  const { exports: exportsMap } = JSON.parse(readFileSync(join(designSystemFolder(), 'package.json'), 'utf8')) as { exports?: Record<string, string> };
  return new Map(Object.entries(exportsMap ?? {}).map(([exportPath, target]) => [exportPath.replace(/^\.\//, ''), target.replace(/^\.\//, '')]));
}

/** The text of one stylesheet of the design-system package's `styles/` folder, such as `tokens.css`. */
export function designSystemStylesheetText(fileName: string): string {
  return readFileSync(join(designSystemFolder(), 'styles', fileName), 'utf8');
}
