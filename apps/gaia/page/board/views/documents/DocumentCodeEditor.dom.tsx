/**
 * Code in a happy-dom document. What matters: the gutter numbers each line and carries each comment's chip; a pause in typing and a blur
 * each save the whole text with the version User saw, and a document with no version yet saves with no base; a refused save keeps User's
 * text and its refusal verbatim; selected lines and Cmd/Ctrl+Shift+M open artboard 3's popover and send its anchor; and a gutter `+`
 * comments on its own line.
 */
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import { useState } from 'react';

import type { BoardDocumentMessageDocument }                   from '../../../@types/board/TicketDocumentsDocument.ts';
import { BROWSER_BOARD_CLOCK, BoardClockContext }              from '../../shell/BoardClock.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION }    from '../../testing/FakeControls.ts';
import { onBoard }                                             from '../../testing/OnBoard.ts';
import { DOCUMENT_STATES, SPEC_MARKDOWN }                      from '../../testing/TicketDocumentsFixture.ts';
import type { CommentDraft }                                   from './CommentPopover.tsx';
import { DOCUMENT_SAVE_IDLE_MILLISECONDS, DocumentCodeEditor } from './DocumentCodeEditor.tsx';

afterEach(cleanup);

const [SPEC] = DOCUMENT_STATES.specWorking.documents;

interface CodeHostProps {
  readonly markdown:      string;
  readonly versionNumber: number | null;
  readonly messages:      readonly BoardDocumentMessageDocument[];
}

function CodeHost({ markdown, versionNumber, messages }: CodeHostProps) {
  const [draft, setDraft] = useState<CommentDraft | null>(null);
  return (
    <DocumentCodeEditor
      place={{ ticketId: '004', document: 'spec' }}
      markdown={markdown}
      versionNumber={versionNumber}
      messages={messages}
      readOnly={false}
      draft={draft}
      onDraft={setDraft}
    />
  );
}

function renderCode(markdown = SPEC_MARKDOWN, versionNumber: number | null = 4) {
  const controls = fakeControls();
  const waits: { readonly milliseconds: number; readonly callback: () => void }[] = [];
  const clock = {
    ...BROWSER_BOARD_CLOCK,
    after: (milliseconds: number, callback: () => void) => {
      const wait = { milliseconds, callback };
      waits.push(wait);
      return () => waits.splice(waits.indexOf(wait), 1);
    },
  };
  controls.render(onBoard(<BoardClockContext value={clock}><CodeHost markdown={markdown} versionNumber={versionNumber} messages={SPEC?.messages ?? []} /></BoardClockContext>));
  const editor = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Spec markdown' });
  return { controls, waits, editor };
}

function selectLines(editor: HTMLTextAreaElement, from: number, to: number): void {
  const lines = editor.value.split('\n');
  const start = lines.slice(0, from - 1).join('\n').length + (from > 1 ? 1 : 0);
  const end = lines.slice(0, to).join('\n').length;
  editor.setSelectionRange(start, end);
  fireEvent.select(editor);
}

describe('Code', () => {
  test('numbers each line in the gutter and carries each comment\'s chip there', () => {
    renderCode();
    expect(document.querySelectorAll('.board-markdown-editor-line-number')).toHaveLength(SPEC_MARKDOWN.split('\n').length);
    const chips = [...document.querySelectorAll('.board-markdown-editor-gutter-line')].flatMap((line) => {
      const chip = line.querySelector('.board-markdown-editor-marker');
      return chip === null ? [] : [[line.querySelector('.board-markdown-editor-line-number')?.textContent, chip.textContent]];
    });
    expect(chips).toEqual([['15', '✓ C1'], ['29', 'C2']]);
  });

  test('a pause in typing saves the whole text with the version User saw', async () => {
    const { controls, waits, editor } = renderCode();
    fireEvent.change(editor, { target: { value: `${SPEC_MARKDOWN}\n- More.` } });
    expect(controls.sent).toEqual([]);
    const pause = waits.find((wait) => wait.milliseconds === DOCUMENT_SAVE_IDLE_MILLISECONDS);
    await act(async () => {
      pause?.callback();
      await Promise.resolve();
    });
    expect<unknown[]>(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'ticket-document-save', ticketId: '004', document: 'spec', baseVersion: 4, markdown: `${SPEC_MARKDOWN}\n- More.`,
    }]);
  });

  test('a blur saves too, and a document with no version yet saves with no base', async () => {
    const { controls, editor } = renderCode('', null);
    fireEvent.change(editor, { target: { value: '# First words' } });
    await act(async () => {
      fireEvent.blur(editor);
      await Promise.resolve();
    });
    expect<unknown[]>(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'ticket-document-save', ticketId: '004', document: 'spec', baseVersion: null, markdown: '# First words'
    }]);
  });

  test('a refused save keeps User\'s text and shows the refusal verbatim', async () => {
    const { controls, editor } = renderCode();
    controls.answerNextWith({ verdict: 'refused', refusal: 'Another person saved over the same lines.' });
    fireEvent.change(editor, { target: { value: `${SPEC_MARKDOWN}\n- Mine.` } });
    await act(async () => {
      fireEvent.blur(editor);
      await Promise.resolve();
    });
    expect(screen.getByRole('status').textContent).toBe('Another person saved over the same lines.');
    expect(editor.value).toBe(`${SPEC_MARKDOWN}\n- Mine.`);
    expect(screen.getByRole('button', { name: 'Discard my edit' })).toBeTruthy();
  });

  test('selected lines and Cmd+Shift+M open artboard 3\'s popover, and Send gives the agent the lines', async () => {
    const { controls, editor } = renderCode();
    selectLines(editor, 17, 23);
    fireEvent.keyDown(editor, { key: 'M', metaKey: true, shiftKey: true });
    const popover = screen.getByRole('dialog', { name: 'Comment for the spec agent' });
    expect(within(popover).getByText('C3 · lines 17–23 · Code')).toBeTruthy();
    expect(within(popover).getByText('§ 3 Behaviour › mermaid block Theme flow')).toBeTruthy();
    fireEvent.change(within(popover).getByRole('textbox', { name: 'Your comment' }), { target: { value: 'Put the server path in the flow.' } });
    await clickSettled(within(popover).getByRole('button', { name: 'Send to agent ⌘↵' }));
    expect(controls.sent.at(-1)).toMatchObject({
      kind:   'ticket-document-comment',
      anchor: {
        view:             'code',
        versionNumber:    4,
        lines:            { from: 17, to: 23 },
        columns:          null,
        sectionPath:      ['3 Behaviour'],
        quote:            null,
        surroundingLines: { from: 15, to: 25 },
        diagram:          null,
      },
    });
  });

  test('a gutter + comments on its own line', () => {
    renderCode();
    fireEvent.click(screen.getByRole('button', { name: 'Comment on line 29' }));
    expect(within(screen.getByRole('dialog', { name: 'Comment for the spec agent' })).getByText('C3 · line 29 · Code')).toBeTruthy();
  });
});
