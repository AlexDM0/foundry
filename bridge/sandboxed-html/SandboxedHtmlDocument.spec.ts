/**
 * The fixed markup of a sandboxed frame. What matters: the agent-written HTML is carried as rendered, the title is the one value escaped
 * by hand, since the frame's markup is a string React never escapes, and links open outside the frame.
 */
import { describe, expect, test } from 'bun:test';

import { sandboxedHtmlDocumentOf } from './SandboxedHtmlDocument.ts';

describe('the sandboxed document', () => {
  test('carries the HTML as rendered and the title escaped, links opening outside the frame', () => {
    const sourceDocument = sandboxedHtmlDocumentOf('<script>x</script> & co', '<p>Body &amp; <em>text</em></p>');
    expect(sourceDocument).toContain('<title>&lt;script&gt;x&lt;/script&gt; &amp; co</title>');
    expect(sourceDocument).toContain('<base target="_blank">');
    expect(sourceDocument).toContain('<body><p>Body &amp; <em>text</em></p></body>');
  });
});
