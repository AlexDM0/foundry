/**
 * Test-only: a library's linked stylesheet as a bundler links it, for a page a browser opens from a file, where no bundler runs: every
 * imported stylesheet in place of its import, in order.
 */
import { readFileSync }  from 'node:fs';
import { dirname, join } from 'node:path';

const PAGE_FOLDER = join(import.meta.dir, '..');
const STYLESHEET_IMPORT = /@import\s+"([^"]+)";/g;

function inlinedStylesheetOf(stylesheetPath: string): string {
  const stylesheetText = readFileSync(stylesheetPath, 'utf8');
  return stylesheetText.replace(STYLESHEET_IMPORT, (_importRule, importedPath: string) => inlinedStylesheetOf(join(dirname(stylesheetPath), importedPath)));
}

export const PackageStylesheet = {
  /** A library's linked stylesheet by its path under `page/`, such as `lib/brand/styles/brand.css`, with its imports inlined. */
  inlinedText(stylesheetPagePath: string): string {
    return inlinedStylesheetOf(join(PAGE_FOLDER, stylesheetPagePath));
  },
} as const;
