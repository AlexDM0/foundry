/**
 * The fixed markup around agent-written HTML in a sandboxed frame: its title, theme and the page's stylesheet addresses escaped, its
 * body marked for the frame's typography, and every link opening outside the frame.
 */
import { HtmlEscapeUtil } from '../../src/lib/html-escape/HtmlEscapeUtil.ts';

/** What the frame takes from the page around it, so the HTML reads in the page's type and colours. */
export interface SandboxedHtmlSurroundings {
  readonly stylesheetHrefs: readonly string[];
  readonly theme:           string | null;
}

export function sandboxedHtmlDocumentOf(title: string, html: string, surroundings: SandboxedHtmlSurroundings): string {
  const theme = surroundings.theme === null ? '' : ` data-theme="${HtmlEscapeUtil.escapeHtml(surroundings.theme)}"`;
  return [
    `<!doctype html><html${theme}><head><meta charset="utf-8">`,
    `<title>${HtmlEscapeUtil.escapeHtml(title)}</title>`,
    ...surroundings.stylesheetHrefs.map((href) => `<link rel="stylesheet" href="${HtmlEscapeUtil.escapeHtml(href)}">`),
    '<base target="_blank">',
    `</head><body data-sandboxed-body="">${html}</body></html>`,
  ].join('');
}
