/**
 * Code in a happy-dom document. What matters: the gutter numbers each line and carries each comment's chip; a pause in typing and a blur
 * each save the whole text with the version User saw, and a document with no version yet saves with no base; a refused save keeps User's
 * text and its refusal verbatim, a blur then saves nothing and Discard my edit keeps the focus; a save asked for while one is on its way
 * goes after it; a save the forge merged onto a newer head keeps User's text until its version is read, and text typed meanwhile saves on
 * the version it was made on; selected lines and Cmd/Ctrl+Shift+M open artboard 3's popover and send its anchor, only while the text is
 * the head's, an unsaved edit being saved first; the commented lines stay selected while the popover is open; quote and fence lines are
 * muted; a gutter `+` comments on its own line; and a long line ends in an ellipsis until User scrolls sideways.
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

interface DocumentHead {
  readonly markdown:      string;
  readonly versionNumber: number | null;
}

interface CodeHostProps extends DocumentHead {
  readonly messages:   readonly BoardDocumentMessageDocument[];
  /** Hands the spec the way to show a new head, as the page does when the forge's documents are read again. */
  readonly onHeadRead: (readHead: (head: DocumentHead) => void) => void;
}

function CodeHost({
  markdown, versionNumber, messages, onHeadRead
}: CodeHostProps) {
  const [draft, setDraft] = useState<CommentDraft | null>(null);
  const [head, setHead] = useState<DocumentHead>({ markdown, versionNumber });
  onHeadRead(setHead);
  return (
    <DocumentCodeEditor
      place={{ ticketId: '004', document: 'spec' }}
      markdown={head.markdown}
      versionNumber={head.versionNumber}
      messages={messages}
      readOnly={false}
      draft={draft}
      onDraft={setDraft}
    />
  );
}

function renderCode(markdown = SPEC_MARKDOWN, versionNumber: number | null = 4) {
  const controls = fakeControls();
  let showHead: (head: DocumentHead) => void = () => undefined;
  const waits: { readonly milliseconds: number; readonly callback: () => void }[] = [];
  const clock = {
    ...BROWSER_BOARD_CLOCK,
    after: (milliseconds: number, callback: () => void) => {
      const wait = { milliseconds, callback };
      waits.push(wait);
      return () => waits.splice(waits.indexOf(wait), 1);
    },
  };
  controls.render(onBoard(
    <BoardClockContext value={clock}>
      <CodeHost
        markdown={markdown}
        versionNumber={versionNumber}
        messages={SPEC?.messages ?? []}
        onHeadRead={(readHead) => {
          showHead = readHead;
        }}
      />
    </BoardClockContext>
  ));
  const editor = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Spec markdown' });
  /** A new head read from the forge, as the page hands it on. */
  const readHead = (headMarkdown: string, headNumber: number): void => {
    act(() => showHead({ markdown: headMarkdown, versionNumber: headNumber }));
  };
  const pause = async (): Promise<void> => {
    const idle = waits.find((wait) => wait.milliseconds === DOCUMENT_SAVE_IDLE_MILLISECONDS);
    await act(async () => {
      idle?.callback();
      await Promise.resolve();
    });
  };
  return {
    controls, waits, editor, readHead, pause
  };
}

const saveOf = (baseVersion: number | null, markdown: string) => ({
  ...SENT_COMMAND_VERSION, kind: 'ticket-document-save', ticketId: '004', document: 'spec', baseVersion, markdown,
});

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

  test('a blur after a refused save saves nothing, and pressing Discard my edit keeps the focus and puts the head back', async () => {
    const { controls, editor, pause } = renderCode();
    controls.answerNextWith({ verdict: 'refused', refusal: 'Another person saved over the same lines.' });
    fireEvent.change(editor, { target: { value: `${SPEC_MARKDOWN}\n- Mine.` } });
    await pause();
    expect(controls.sent).toHaveLength(1);
    const discard = screen.getByRole('button', { name: 'Discard my edit' });
    expect(fireEvent.mouseDown(discard)).toBe(false);
    await act(async () => {
      fireEvent.blur(editor);
      await Promise.resolve();
    });
    expect(controls.sent).toHaveLength(1);
    fireEvent.mouseUp(discard);
    fireEvent.click(discard);
    expect(editor.value).toBe(SPEC_MARKDOWN);
  });

  test('a save asked for while the idle save is on its way goes once that one is applied', async () => {
    const { controls, editor, pause } = renderCode();
    controls.holdCommands();
    fireEvent.change(editor, { target: { value: `${SPEC_MARKDOWN}\n- One.` } });
    await pause();
    fireEvent.change(editor, { target: { value: `${SPEC_MARKDOWN}\n- One.\n- Two.` } });
    fireEvent.blur(editor);
    expect(controls.sent).toHaveLength(1);
    await controls.releaseCommands();
    await controls.releaseCommands();
    expect<unknown[]>(controls.sent).toEqual([saveOf(4, `${SPEC_MARKDOWN}\n- One.`), saveOf(5, `${SPEC_MARKDOWN}\n- One.\n- Two.`)]);
  });

  test('a save the forge merged onto a newer head keeps User\'s text until the version it wrote is read', async () => {
    const { controls, editor, readHead } = renderCode();
    const mine = `${SPEC_MARKDOWN}\n- Mine.`;
    const agents = SPEC_MARKDOWN.replace('# ', '# Agent: ');
    controls.holdCommands();
    controls.answerNextWith({ verdict: 'applied', outcome: 'done', result: { startedJobId: null, writtenVersionNumber: 6 } });
    fireEvent.change(editor, { target: { value: mine } });
    fireEvent.blur(editor);
    readHead(agents, 5);
    await controls.releaseCommands();
    expect(editor.value).toBe(mine);
    readHead(`${agents}\n- Mine.`, 6);
    expect(editor.value).toBe(`${agents}\n- Mine.`);
  });

  test('text typed while a save was on its way, which the forge merged, saves again on the version it was made on', async () => {
    const { controls, editor, readHead } = renderCode();
    const agents = SPEC_MARKDOWN.replace('# ', '# Agent: ');
    controls.holdCommands();
    controls.answerNextWith({ verdict: 'applied', outcome: 'done', result: { startedJobId: null, writtenVersionNumber: 6 } });
    fireEvent.change(editor, { target: { value: `${SPEC_MARKDOWN}\n- Mine.` } });
    fireEvent.blur(editor);
    readHead(agents, 5);
    fireEvent.change(editor, { target: { value: `${SPEC_MARKDOWN}\n- Mine.\n- More.` } });
    await controls.releaseCommands();
    readHead(`${agents}\n- Mine.`, 6);
    await act(async () => {
      fireEvent.blur(editor);
      await Promise.resolve();
    });
    expect<unknown>(controls.sent.at(-1)).toEqual(saveOf(4, `${SPEC_MARKDOWN}\n- Mine.\n- More.`));
  });

  test('Cmd+Shift+M on an edit not yet saved saves it and opens no comment on lines the head numbers otherwise', async () => {
    const { controls, editor } = renderCode();
    fireEvent.change(editor, { target: { value: `Intro\n\n${SPEC_MARKDOWN}` } });
    selectLines(editor, 19, 25);
    await act(async () => {
      fireEvent.keyDown(editor, { key: 'M', metaKey: true, shiftKey: true });
      await Promise.resolve();
    });
    expect(screen.queryByRole('dialog', { name: 'Comment for the spec agent' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Comment once your edit is saved: its lines are numbered as saved.');
    expect<unknown[]>(controls.sent).toEqual([saveOf(4, `Intro\n\n${SPEC_MARKDOWN}`)]);
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

  test('the commented lines stay selected while the popover is open, wherever the caret goes, and quote and fence lines are muted', () => {
    const { editor } = renderCode();
    const markedLineNumbers = (attribute: string): number[] => [...document.querySelectorAll('.board-markdown-editor-mirror-line')]
      .flatMap((line, i) => (line.hasAttribute(attribute) ? [i + 1] : []));
    selectLines(editor, 17, 23);
    fireEvent.keyDown(editor, { key: 'M', metaKey: true, shiftKey: true });
    editor.setSelectionRange(0, 0);
    fireEvent.select(editor);
    expect(markedLineNumbers('data-selected')).toEqual([17, 18, 19, 20, 21, 22, 23]);
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Comment for the spec agent' })).getByRole('button', { name: 'Cancel' }));
    expect(markedLineNumbers('data-selected')).toEqual([]);
    expect(markedLineNumbers('data-muted')).toEqual([3, 17, 23]);
  });

  test('a long line ends in an ellipsis at rest and is drawn whole once User scrolls sideways', () => {
    const { editor } = renderCode();
    const mirror = document.querySelector('.board-markdown-editor-mirror');
    const scrollSideways = (scrollLeft: number): void => {
      Object.defineProperty(editor, 'scrollLeft', { configurable: true, value: scrollLeft });
      fireEvent.scroll(editor);
    };
    expect(mirror?.hasAttribute('data-scrolled-sideways')).toBe(false);
    scrollSideways(120);
    expect(mirror?.hasAttribute('data-scrolled-sideways')).toBe(true);
    scrollSideways(0);
    expect(mirror?.hasAttribute('data-scrolled-sideways')).toBe(false);
  });

  test('a gutter + comments on its own line', () => {
    renderCode();
    fireEvent.click(screen.getByRole('button', { name: 'Comment on line 29' }));
    expect(within(screen.getByRole('dialog', { name: 'Comment for the spec agent' })).getByText('C3 · line 29 · Code')).toBeTruthy();
  });
});
