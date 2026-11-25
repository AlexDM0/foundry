/**
 * Preview in a happy-dom document. What matters: the text is drawn as elements, raw HTML staying text and a character reference the
 * character it names; a selection opens the popover with artboard 2's anchor and sends it with the comment, also one in a code block, one
 * that ends on a chip and one that ends on the next block's edge; a diagram node the frame reports under the pointer offers a comment on its own source
 * line, until a moment after the pointer left it or the diagram is drawn again; the frame is told the dark theme; a message from any
 * window but the diagram's own frame is dropped; a comment's chip stands after its text, ticked once applied;
 * the plan's reference marks follow their sentences, unresolved ones marked; the selected text stays marked while its popover is open; and
 * an agent's edit shares one frame with the line it replaces, which alone is struck.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';
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

import { useState }                                                from 'react';
import { PAGE_CONTRACT_VERSIONS }                                  from '../../../../src/shared/constants/PageContractVersions.ts';
import { DIAGRAM_FRAME_PROTOCOL }                                  from '../../../shared/@types/DiagramFrameMessages.ts';
import { BROWSER_BOARD_CLOCK, BoardClockContext, type BoardClock } from '../../shell/BoardClock.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION }        from '../../testing/FakeControls.ts';
import { onBoard }                                                 from '../../testing/OnBoard.ts';
import {
  DOCUMENT_STATES,
  PLAN_EFFECT_READING,
  PLAN_MARKDOWN,
  SPEC_MARKDOWN,
  lineOf
} from '../../testing/TicketDocumentsFixture.ts';
import type { CommentDraft }                     from './CommentPopover.tsx';
import { DiagramFrameAddressContext }            from './DiagramFrame.tsx';
import { DocumentPreview }                       from './DocumentPreview.tsx';
import { EffectTreeModel }                       from './EffectTreeModel.ts';
import { ProposalModel, type OpenProposalModel } from './ProposalModel.ts';

afterEach(() => {
  cleanup();
  window.getSelection()?.removeAllRanges();
});

const [SPEC] = DOCUMENT_STATES.specWorking.documents;

const [IDLE_SPEC] = DOCUMENT_STATES.specIdle.documents;

interface PreviewHostProps {
  readonly markdown:   string;
  readonly document:   'spec' | 'plan';
  readonly proposals?: readonly OpenProposalModel[];
}

function PreviewHost({ markdown, document, proposals = [] }: PreviewHostProps) {
  const [draft, setDraft] = useState<CommentDraft | null>(null);
  return (
    <DocumentPreview
      place={{ ticketId: '004', document }}
      markdown={markdown}
      versionNumber={4}
      messages={document === 'spec' ? SPEC?.messages ?? [] : []}
      proposals={proposals}
      referenceMarks={document === 'plan' ? EffectTreeModel.referenceMarksOf(PLAN_EFFECT_READING) : []}
      draft={draft}
      onDraft={setDraft}
      settled={false}
    />
  );
}

interface ClockWait {
  readonly milliseconds: number;
  readonly callback:     () => void;
}

/** The waits the page's clock holds, which a spec ends by hand. */
const clockWaits: ClockWait[] = [];

const MANUAL_CLOCK: BoardClock = {
  ...BROWSER_BOARD_CLOCK,
  after: (milliseconds, callback) => {
    const wait = { milliseconds, callback };
    clockWaits.push(wait);
    return () => {
      if (clockWaits.includes(wait)) clockWaits.splice(clockWaits.indexOf(wait), 1);
    };
  },
};

function endClockWaits(): void {
  act(() => clockWaits.splice(0).forEach((wait) => wait.callback()));
}

function renderPreview(markdown = SPEC_MARKDOWN, document: 'spec' | 'plan' = 'spec', proposals: readonly OpenProposalModel[] = []) {
  const controls = fakeControls();
  clockWaits.splice(0);
  controls.render(onBoard(
    <BoardClockContext value={MANUAL_CLOCK}>
      <DiagramFrameAddressContext value={null}><PreviewHost markdown={markdown} document={document} proposals={proposals} /></DiagramFrameAddressContext>
    </BoardClockContext>
  ));
  return controls;
}

/** The selector of the documents' rule that strikes the text an agent's edit replaces. */
function struckTextSelector(): string {
  const stylesheet = readFileSync(join(import.meta.dir, '..', '..', '..', 'styles', 'board', 'documents.css'), 'utf8').replaceAll(/\/\*[\s\S]*?\*\//gu, '');
  const rules = [...stylesheet.matchAll(/([^{}]+)\{([^}]*)\}/gu)];
  const rule = rules.find(([, selector, body]) => selector?.includes('[data-replaced]') === true && body?.includes('line-through') === true);
  if (rule?.[1] === undefined) throw new Error('documents.css strikes no replaced text');
  return rule[1].trim();
}

function textNodeHolding(text: string): Text {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.textContent?.includes(text) === true) return node as Text;
  }
  throw new Error(`no text holds ${text}`);
}

function select(text: string): void {
  const node = textNodeHolding(text);
  const start = node.textContent?.indexOf(text) ?? 0;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, start + text.length);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function selectRange(start: readonly [Node, number], end: readonly [Node, number]): void {
  const range = document.createRange();
  range.setStart(...start);
  range.setEnd(...end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.mouseUp(screen.getByRole('article'));
}

/** The heading of the open comment popover, `C3 · line 6 · Preview`; `null` while none is open. */
function popoverHeadOf(): string | null {
  const popover = screen.queryByRole('dialog', { name: 'Comment for the spec agent' });
  return popover === null ? null : within(popover).getByText(/^C3 · /u).textContent;
}

function frameMessage(data: unknown, source: Window | null): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, source }));
  });
}

const FRAME_HEAD = { protocol: DIAGRAM_FRAME_PROTOCOL, protocolVersion: PAGE_CONTRACT_VERSIONS.gaiaDiagramFrame } as const;

describe('Preview', () => {
  test('draws a character reference as the character it names', () => {
    renderPreview('R&amp;D &copy; 2026');
    expect(screen.getByRole('article', { name: 'The spec' }).textContent).toBe('R&D © 2026');
  });

  test('draws raw HTML as text, never as an element', () => {
    renderPreview('Before <b>bold</b> after\n\n<script>window.plantedRan = true</script>');
    expect(document.querySelector('b')).toBeNull();
    expect(document.querySelector('article script')).toBeNull();
    expect(screen.getByText('<script>window.plantedRan = true</script>')).toBeTruthy();
  });

  test('a selection opens the popover with artboard 2\'s anchor, and Send gives the agent the anchor with the comment', async () => {
    const controls = renderPreview();
    const quote = 'with no white flash on load.';
    select(quote);
    fireEvent.mouseUp(screen.getByRole('article', { name: 'The spec' }));
    const popover = screen.getByRole('dialog', { name: 'Comment for the spec agent' });
    expect(within(popover).getByText('C3 · § 2 Outcome · line 11 · Preview')).toBeTruthy();
    expect(within(popover).getByText('The agent gets the quote, its section and lines 9–13.')).toBeTruthy();
    fireEvent.change(within(popover).getByRole('textbox', { name: 'Your comment' }), { target: { value: 'Measurable? Say how a reviewer sees a flash.' } });
    await clickSettled(within(popover).getByRole('button', { name: 'Send to agent ⌘↵' }));
    const line = lineOf(SPEC_MARKDOWN, quote);
    const column = (SPEC_MARKDOWN.split('\n')[line - 1] ?? '').indexOf(quote) + 1;
    expect<unknown[]>(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION,
      kind:     'ticket-document-comment',
      ticketId: '004',
      document: 'spec',
      text:     'Measurable? Say how a reviewer sees a flash.',
      anchor:   {
        view:             'preview',
        versionNumber:    4,
        lines:            { from: 11, to: 11 },
        columns:          { from: column, to: column + quote.length - 1 },
        sectionPath:      ['2 Outcome'],
        quote,
        surroundingLines: { from: 9, to: 13 },
        diagram:          null,
      },
    }]);
    expect(screen.queryByRole('dialog', { name: 'Comment for the spec agent' })).toBeNull();
  });

  test('a selection inside a fenced code block opens the popover on its source line and columns', () => {
    renderPreview(['# Example', '', 'Intro.', '', '```ts', 'const theme = readTheme();', '```'].join('\n'));
    select('readTheme');
    fireEvent.mouseUp(screen.getByRole('article', { name: 'The spec' }));
    expect(popoverHeadOf()).toBe('C3 · line 6 · Preview');
  });

  test('a selection that ends on a comment\'s chip, or on the edge of the next block as a triple click leaves it, opens the popover on its text', () => {
    renderPreview();
    const text = textNodeHolding('falls back to light');
    const chip = [...document.querySelectorAll('.board-document-chip')].find((candidate) => candidate.textContent === '✓ C1');
    const chipText = chip?.firstChild;
    if (chipText === null || chipText === undefined) throw new Error('no chip');
    selectRange([text, text.data.indexOf('falls back')], [chipText, chipText.textContent?.length ?? 0]);
    const line = lineOf(SPEC_MARKDOWN, 'falls back to light');
    expect(popoverHeadOf()).toBe(`C3 · § 3 Behaviour · line ${line} · Preview`);
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Comment for the spec agent' })).getByRole('button', { name: 'Cancel' }));
    const figure = document.querySelector('figure');
    if (figure === null) throw new Error('no diagram');
    selectRange([text, 0], [figure, 0]);
    expect(popoverHeadOf()).toBe(`C3 · § 3 Behaviour · line ${line} · Preview`);
  });

  test('a node the frame reports under the pointer offers a comment on its own line, and the comment carries the node', () => {
    renderPreview();
    const frame = document.querySelector('iframe');
    frameMessage({
      ...FRAME_HEAD, kind: 'rendered', heightPixels: 120, nodes: [{ nodeId: 'Stored', label: 'Saved choice' }]
    }, frame?.contentWindow ?? null);
    frameMessage({
      ...FRAME_HEAD, kind: 'node-hovered', nodeId: 'Stored', top: 40, left: 60
    }, frame?.contentWindow ?? null);
    fireEvent.click(screen.getByRole('button', { name: '+ Comment on node · line 20' }));
    const popover = screen.getByRole('dialog', { name: 'Comment for the spec agent' });
    expect(within(popover).getByText('C3 · § 3 Behaviour · line 20 · Preview')).toBeTruthy();
    expect(within(popover).getByText('“Saved choice”')).toBeTruthy();
  });

  test('a node\'s offer goes a moment after the pointer left the node, stays while the pointer is on it, and goes once the diagram is drawn again', () => {
    renderPreview();
    const frame = document.querySelector('iframe');
    const hoverNode = (): void => {
      frameMessage({
        ...FRAME_HEAD, kind: 'node-hovered', nodeId: 'Stored', top: 40, left: 60
      }, frame?.contentWindow ?? null);
    };
    frameMessage({
      ...FRAME_HEAD, kind: 'rendered', heightPixels: 120, nodes: [{ nodeId: 'Stored', label: 'Saved choice' }]
    }, frame?.contentWindow ?? null);
    hoverNode();
    frameMessage({ ...FRAME_HEAD, kind: 'node-left' }, frame?.contentWindow ?? null);
    fireEvent.pointerEnter(screen.getByRole('button', { name: '+ Comment on node · line 20' }));
    endClockWaits();
    expect(screen.getByRole('button', { name: '+ Comment on node · line 20' })).toBeTruthy();
    fireEvent.pointerLeave(screen.getByRole('button', { name: '+ Comment on node · line 20' }));
    endClockWaits();
    expect(screen.queryByRole('button', { name: /Comment on node/u })).toBeNull();
    hoverNode();
    frameMessage({
      ...FRAME_HEAD, kind: 'rendered', heightPixels: 140, nodes: [{ nodeId: 'Other', label: 'Another node' }]
    }, frame?.contentWindow ?? null);
    expect(screen.queryByRole('button', { name: /Comment on node/u })).toBeNull();
  });

  test('hands the frame the board\'s tokens with darkMode on for the dark theme, off for the light one', () => {
    const themeBefore = document.documentElement.getAttribute('data-theme');
    try {
      for (const [theme, darkMode] of [['dark', 'true'], ['light', 'false']] as const) {
        cleanup();
        document.documentElement.setAttribute('data-theme', theme);
        renderPreview();
        const frame = document.querySelector('iframe');
        const posted: unknown[] = [];
        if (frame?.contentWindow === null || frame === null) throw new Error('no frame window');
        frame.contentWindow.postMessage = (message: unknown) => posted.push(message);
        fireEvent.load(frame);
        expect(posted).toEqual([expect.objectContaining({ kind: 'render', themeVariables: expect.objectContaining({ darkMode }) })]);
      }
    } finally {
      if (themeBefore === null) document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', themeBefore);
    }
  });

  test('drops a message from any window but its own frame\'s, and one of another protocol version', () => {
    renderPreview();
    const frame = document.querySelector('iframe');
    frameMessage({
      ...FRAME_HEAD, kind: 'rendered', heightPixels: 120, nodes: [{ nodeId: 'Stored', label: 'Saved choice' }]
    }, window);
    frameMessage({
      ...FRAME_HEAD, protocolVersion: 2, kind: 'rendered', heightPixels: 120, nodes: [{ nodeId: 'Stored', label: 'Saved choice' }]
    }, frame?.contentWindow ?? null);
    frameMessage({
      ...FRAME_HEAD, kind: 'node-hovered', nodeId: 'Stored', top: 40, left: 60
    }, frame?.contentWindow ?? null);
    expect(screen.queryByRole('button', { name: /Comment on node/u })).toBeNull();
    expect(frame?.style.height).toBe('');
  });

  test('keeps the selected text marked while its popover is open, and unmarks it once the popover closes', () => {
    renderPreview();
    const quote = 'with no white flash on load.';
    select(quote);
    fireEvent.mouseUp(screen.getByRole('article', { name: 'The spec' }));
    expect([...document.querySelectorAll('.board-document-marked')].map((marked) => marked.textContent)).toEqual([quote]);
    const paragraph = document.querySelector(`[data-from-line="${lineOf(SPEC_MARKDOWN, quote)}"]`);
    expect(paragraph?.textContent).toBe('Every page under /account follows the visitor\'s system colour scheme, with no white flash on load.');
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Comment for the spec agent' })).getByRole('button', { name: 'Cancel' }));
    expect(document.querySelectorAll('.board-document-marked')).toHaveLength(0);
  });

  test('a selection that starts in marked text still reads its source columns', () => {
    renderPreview();
    select('with no white flash on load.');
    fireEvent.mouseUp(screen.getByRole('article', { name: 'The spec' }));
    select('white flash');
    fireEvent.mouseUp(screen.getByRole('article', { name: 'The spec' }));
    expect(within(screen.getByRole('dialog', { name: 'Comment for the spec agent' })).getByText('“white flash”')).toBeTruthy();
  });

  test('frames an agent\'s edit with the line it replaces, striking the old line and not the new one', () => {
    const proposals = ProposalModel.openProposalsOf('spec', IDLE_SPEC?.proposals ?? []);
    renderPreview(SPEC_MARKDOWN, 'spec', proposals);
    const replaced = document.querySelector<HTMLElement>('li[data-replaced]');
    const frame = replaced?.querySelector(':scope > .board-document-proposal-frame');
    const proposal = screen.getByRole('group', { name: proposals[0]?.label ?? '' });
    expect([replaced?.dataset['fromLine'], frame?.contains(proposal)]).toEqual([String(lineOf(SPEC_MARKDOWN, '**A3**')), true]);
    const oldText = frame?.querySelector(':scope > .board-document-item-text');
    const newText = proposal.querySelector('.board-document-item-text');
    expect([oldText?.textContent?.includes('Every account page passes'), newText?.textContent?.includes('bun run check:contrast')]).toEqual([true, true]);
    expect([oldText?.matches(struckTextSelector()), newText?.matches(struckTextSelector())]).toEqual([true, false]);
  });

  test('puts each comment\'s chip after its text, ticked once applied', () => {
    renderPreview();
    const chips = [...document.querySelectorAll('.board-document-chip')].map((chip) => [chip.textContent, chip.closest('[data-from-line]')?.getAttribute('data-from-line')]);
    expect(chips).toEqual([['✓ C1', String(lineOf(SPEC_MARKDOWN, 'falls back to light'))], ['C2', String(lineOf(SPEC_MARKDOWN, '**A3**'))]]);
  });

  test('follows the plan\'s sentences with their reference marks, the unresolved ones marked', () => {
    renderPreview(PLAN_MARKDOWN, 'plan');
    const marks = [...document.querySelectorAll('.board-document-reference')].map((mark) => `${mark.textContent}${mark.hasAttribute('data-unresolved') ? '?' : ''}`);
    expect(marks).toEqual(['1', '2?', '3', '4', '5', '6?']);
  });
});
