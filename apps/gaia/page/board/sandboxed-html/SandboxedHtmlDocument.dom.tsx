/**
 * The fixed markup of a sandboxed frame, built in a happy-dom document. What matters: the agent-written HTML is carried as rendered under
 * the body mark; the title, the theme and the stylesheet addresses reach the frame as text and attributes, never as markup, a title with
 * `<`, `&` and `"` among them; and links open outside the frame.
 */
import { describe, expect, test } from 'bun:test';

import { sandboxedHtmlDocumentOf } from './SandboxedHtmlDocument.ts';

describe('the sandboxed document', () => {
  const sourceDocument = sandboxedHtmlDocumentOf('<script>x</script> & co', '<p>Body &amp; <em>text</em></p>', {
    stylesheetHrefs: ['http://127.0.0.1:4100/chunk-example.css?a="b"'],
    theme:           'dark',
  });

  test('carries the HTML as rendered under the body mark and the title escaped, links opening outside the frame', () => {
    expect(sourceDocument).toContain('<title>&lt;script&gt;x&lt;/script&gt; &amp; co</title>');
    expect(sourceDocument).toContain('<base target="_blank">');
    expect(sourceDocument).toContain('<body data-sandboxed-body=""><p>Body &amp; <em>text</em></p></body>');
  });

  test('links the page\'s stylesheets, their addresses escaped, and takes the page\'s theme', () => {
    expect(sourceDocument).toContain('<link rel="stylesheet" href="http://127.0.0.1:4100/chunk-example.css?a=&quot;b&quot;">');
    expect(sourceDocument).toStartWith('<!doctype html><html data-theme="dark">');
  });

  test('leaves the theme out when the page names none', () => {
    expect(sandboxedHtmlDocumentOf('Title', '', { stylesheetHrefs: [], theme: null })).toStartWith('<!doctype html><html><head>');
  });

  test('a title with <, & and " reaches the frame as text: read back, the frame\'s title is the title given, and no element was made of it', () => {
    const title = 'Example <b>bold</b> & "quoted" title';
    const frameDocument = new DOMParser().parseFromString(sandboxedHtmlDocumentOf(title, '', { stylesheetHrefs: [], theme: null }), 'text/html');
    expect(frameDocument.title).toBe(title);
    expect(frameDocument.querySelector('b')).toBeNull();
    expect(frameDocument.head.children.length).toBe(3);
  });
});
