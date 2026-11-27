/** Test-only: the package's own files as the architecture tests read them, by their path from the package folder, `node_modules` left out. */
import { readdirSync, readFileSync } from 'node:fs';
import { join }                      from 'node:path';

export const PACKAGE_FOLDER = join(import.meta.dir, '..');

export interface PackageFile {
  readonly path: string;
  readonly text: string;
}

export const PackageFiles = {
  matching(pattern: RegExp): PackageFile[] {
    return readdirSync(PACKAGE_FOLDER, { recursive: true, encoding: 'utf8' })
      .filter((path) => !path.startsWith('node_modules') && pattern.test(path))
      .sort()
      .map((path) => ({ path, text: readFileSync(join(PACKAGE_FOLDER, path), 'utf8') }));
  },

  text(path: string): string {
    return readFileSync(join(PACKAGE_FOLDER, path), 'utf8');
  },
} as const;
