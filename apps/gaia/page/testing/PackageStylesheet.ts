/**
 * Test-only: a package's entry stylesheet as a bundler links it, for a page a browser opens from a file, where no bundler runs: every
 * imported stylesheet in place of its import, in order.
 */
import { readFileSync }  from 'node:fs';
import { dirname, join } from 'node:path';

const STYLESHEET_IMPORT = /@import\s+"([^"]+)";/g;

function inlinedStylesheetOf(stylesheetPath: string): string {
  const stylesheetText = readFileSync(stylesheetPath, 'utf8');
  return stylesheetText.replace(STYLESHEET_IMPORT, (_importRule, importedPath: string) => inlinedStylesheetOf(join(dirname(stylesheetPath), importedPath)));
}

export const PackageStylesheet = {
  /** The stylesheet a package exports under this specifier, such as `brand/brand.css`, with its imports inlined. */
  inlinedText(stylesheetExport: string): string {
    return inlinedStylesheetOf(Bun.resolveSync(stylesheetExport, import.meta.dir));
  },
} as const;
