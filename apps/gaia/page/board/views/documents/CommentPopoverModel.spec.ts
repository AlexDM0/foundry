/**
 * The comment popover and a comment's anchor line. What matters: the next comment number follows the highest; Preview's heading names the
 * section, line and view (artboard 2), Code's names its lines and then the section with the mermaid block it falls in (artboard 3); the
 * note says what the agent gets; the chat's line names where the comment stands now; and an empty comment sends nothing.
 */
import { describe, expect, test } from 'bun:test';

import { MarkdownBlocks }       from '../../../../src/lib/markdown-render/MarkdownBlocks.ts';
import { SENT_COMMAND_VERSION } from '../../testing/FakeControls.ts';
import {
  DOCUMENT_STATES,
  SPEC_ANCHOR_OF_C2,
  SPEC_MARKDOWN,
  lineOf
} from '../../testing/TicketDocumentsFixture.ts';
import { CommentPopoverModel }    from './CommentPopoverModel.ts';
import { DocumentSelectionModel } from './DocumentSelectionModel.ts';

const BLOCKS = MarkdownBlocks.blocksOf(SPEC_MARKDOWN);

const LINE_COUNT = SPEC_MARKDOWN.split('\n').length;

const PLACE = { ticketId: '004', document: 'spec' } as const;

describe('the comment popover', () => {
  test('numbers the next comment after the highest the document holds', () => {
    const [spec] = DOCUMENT_STATES.specWorking.documents;
    expect(CommentPopoverModel.nextCommentNumberOf(spec?.messages ?? [])).toBe(3);
    expect(CommentPopoverModel.nextCommentNumberOf([])).toBe(1);
  });

  test('heads a Preview selection with its section, line and view, as artboard 2, and says what the agent gets', () => {
    const line = lineOf(SPEC_MARKDOWN, 'with no white flash on load.');
    const selection = { start: { line, column: 72 }, end: { line, column: 101 }, quote: 'with no white flash on load.' };
    const anchor = DocumentSelectionModel.anchorOfPreviewSelection(BLOCKS, LINE_COUNT, 4, selection);
    expect(CommentPopoverModel.popoverContentOf(3, anchor, BLOCKS)).toEqual({
      heading: 'C3 · § 2 Outcome · line 11 · Preview',
      section: null,
      quote:   'with no white flash on load.',
      note:    'The agent gets the quote, its section and lines 9–13.',
    });
  });

  test('heads Code lines with the lines alone and names the mermaid block they fall in under it, as artboard 3', () => {
    const anchor = DocumentSelectionModel.anchorOfLines(BLOCKS, LINE_COUNT, 4, { from: 17, to: 23 });
    expect(CommentPopoverModel.popoverContentOf(3, anchor, BLOCKS)).toEqual({
      heading: 'C3 · lines 17–23 · Code',
      section: '§ 3 Behaviour › mermaid block Theme flow',
      quote:   null,
      note:    'Same comment, same anchor, in either view.',
    });
  });

  test('sends the comment with its anchor, and nothing while the text is empty', () => {
    expect(CommentPopoverModel.commandOf(PLACE, SPEC_ANCHOR_OF_C2, '  ')).toBeNull();
    expect(CommentPopoverModel.commandOf(PLACE, SPEC_ANCHOR_OF_C2, ' Name the check. ')).toEqual({
      ...SENT_COMMAND_VERSION,
      kind:     'ticket-document-comment',
      ticketId: '004',
      document: 'spec',
      anchor:   SPEC_ANCHOR_OF_C2,
      text:     'Name the check.',
    });
  });
});

describe('a comment\'s anchor line in the chat', () => {
  test('names where the comment stands now, else where it was made', () => {
    expect(CommentPopoverModel.anchorLineOf(2, SPEC_ANCHOR_OF_C2, { from: 31, to: 31 })).toBe('C2 · § 4 Acceptance › A3 · line 31 · Preview');
    expect(CommentPopoverModel.anchorLineOf(2, SPEC_ANCHOR_OF_C2, null)).toBe('C2 · § 4 Acceptance › A3 · line 29 · Preview');
  });
});
