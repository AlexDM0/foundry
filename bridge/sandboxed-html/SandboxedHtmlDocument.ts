/** The fixed markup around agent-written HTML in a sandboxed frame: its title escaped, and every link opening outside the frame. */
import { HtmlEscapeUtil } from '../../src/lib/html-escape/HtmlEscapeUtil.ts';

export function sandboxedHtmlDocumentOf(title: string, html: string): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<title>${HtmlEscapeUtil.escapeHtml(title)}</title>`,
    '<base target="_blank">',
    `</head><body>${html}</body></html>`,
  ].join('');
}
