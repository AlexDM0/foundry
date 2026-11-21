/**
 * The fixed markup around agent-written HTML in a sandboxed frame: its title, theme and the page's stylesheet addresses, its body marked
 * for the frame's typography, and every link opening outside the frame. The document is built through the DOM and read back as markup, so
 * every value the page sets reaches the frame as text or as an attribute, never as markup. The document has no browsing context: nothing
 * in the HTML loads or runs while it is built.
 */

/** What the frame takes from the page around it, so the HTML reads in the page's type and colours. */
export interface SandboxedHtmlSurroundings {
  readonly stylesheetHrefs: readonly string[];
  readonly theme:           string | null;
}

const DOCUMENT_TYPE = '<!doctype html>';

export function sandboxedHtmlDocumentOf(title: string, html: string, surroundings: SandboxedHtmlSurroundings): string {
  const frameDocument = document.implementation.createHTMLDocument();
  const { documentElement, head, body } = frameDocument;
  if (surroundings.theme !== null) documentElement.setAttribute('data-theme', surroundings.theme);
  const characterSet = frameDocument.createElement('meta');
  characterSet.setAttribute('charset', 'utf-8');
  const titleElement = frameDocument.createElement('title');
  titleElement.textContent = title;
  head.append(characterSet, titleElement);
  for (const href of surroundings.stylesheetHrefs) {
    const stylesheet = frameDocument.createElement('link');
    stylesheet.setAttribute('rel', 'stylesheet');
    stylesheet.setAttribute('href', href);
    head.append(stylesheet);
  }
  const linkTarget = frameDocument.createElement('base');
  linkTarget.setAttribute('target', '_blank');
  head.append(linkTarget);
  body.setAttribute('data-sandboxed-body', '');
  const bodyContents = frameDocument.createRange();
  bodyContents.selectNodeContents(body);
  body.append(bodyContents.createContextualFragment(html));
  return `${DOCUMENT_TYPE}${documentElement.outerHTML}`;
}
