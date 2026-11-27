/**
 * The Handoff code writes into a ticket body. What matters: a body holding a `## Handoff` gets it replaced, never a second one, also when
 * the body is CRLF; and the written body keeps the body's own line ending on every line, so a CRLF file never ends with two.
 */
import { expect, test } from 'bun:test';

import { BuildReport } from './BuildReport.ts';

const HANDOFF_SECTION = '## Handoff\n\nExample handoff by Alex Example.\n';
const BODY_WITH_HANDOFF = '## Report\nExample report.\n\n## Handoff\nThe filing guidance.\n\n## Review 1\nExample review.\n';
const BODY_WITHOUT_HANDOFF = '## Report\nExample report.\n';

function crlfOf(text: string): string {
  return text.replaceAll('\n', '\r\n');
}

test('an LF body with a Handoff gets it replaced and keeps the sections after it', () => {
  expect(BuildReport.bodyWithHandoffOf(BODY_WITH_HANDOFF, HANDOFF_SECTION))
    .toBe('## Report\nExample report.\n\n## Handoff\n\nExample handoff by Alex Example.\n\n## Review 1\nExample review.\n');
});

test('a CRLF body with a Handoff gets one Handoff, in CRLF on every line', () => {
  const written = BuildReport.bodyWithHandoffOf(crlfOf(BODY_WITH_HANDOFF), HANDOFF_SECTION);

  expect(written).toBe(crlfOf('## Report\nExample report.\n\n## Handoff\n\nExample handoff by Alex Example.\n\n## Review 1\nExample review.\n'));
  expect(written.match(/## Handoff/g)).toHaveLength(1);
});

test('a CRLF body without a Handoff gets one appended in CRLF', () => {
  expect(BuildReport.bodyWithHandoffOf(crlfOf(BODY_WITHOUT_HANDOFF), HANDOFF_SECTION))
    .toBe(crlfOf('## Report\nExample report.\n\n## Handoff\n\nExample handoff by Alex Example.\n'));
});
