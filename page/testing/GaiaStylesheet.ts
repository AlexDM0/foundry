/** Test-only: reads `page/styles/gaia.css`, so a component's spec can hold that each visual variant it emits has a rule of its own. */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

const STYLESHEET_PATH = join(import.meta.dir, '..', 'styles', 'gaia.css');

export const GaiaStylesheet = {
  text(): string {
    return readFileSync(STYLESHEET_PATH, 'utf8');
  },

  /** Whether a rule's selector names this class with this attribute value, such as `.gaia-pill[data-tone="error"]`. */
  stylesVariant(stylesheetText: string, className: string, attributeName: string, value: string): boolean {
    return stylesheetText.includes(`.${className}[${attributeName}="${value}"]`);
  },
} as const;
