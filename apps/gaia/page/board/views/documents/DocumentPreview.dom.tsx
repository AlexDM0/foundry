/**
 * Preview in a happy-dom document. What matters: the text is drawn as elements, raw HTML staying text; a selection opens the popover with
 * artboard 2's anchor and sends it with the comment; a diagram node the frame reports under the pointer offers a comment on its own source
 * line, and a message from any window but the diagram's own frame is dropped; a comment's chip stands after its text, ticked once applied;
 * and the plan's reference marks follow their sentences, unresolved ones marked.
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

import { useState }                                         from 'react';
import { PAGE_CONTRACT_VERSIONS }                           from '../../../../src/shared/constants/PageContractVersions.ts';
import { DIAGRAM_FRAME_PROTOCOL }                           from '../../../shared/@types/DiagramFrameMessages.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION } from '../../testing/FakeControls.ts';
import { onBoard }                                          from '../../testing/OnBoard.ts';
import {
  DOCUMENT_STATES,
  PLAN_EFFECT_READING,
  PLAN_MARKDOWN,
  SPEC_MARKDOWN,
  lineOf
} from '../../testing/TicketDocumentsFixture.ts';
import type { CommentDraft }          from './CommentPopover.tsx';
import { DiagramFrameAddressContext } from './DiagramFrame.tsx';
import { DocumentPreview }            from './DocumentPreview.tsx';
import { EffectTreeModel }            from './EffectTreeModel.ts';

afterEach(() => {
  cleanup();
  window.getSelection()?.removeAllRanges();
});

const [SPEC] = DOCUMENT_STATES.specWorking.documents;

function PreviewHost({ markdown, document }: { readonly markdown: string; readonly document: 'spec' | 'plan' }) {
  const [draft, setDraft] = useState<CommentDraft | null>(null);
  return (
    <DocumentPreview
      place={{ ticketId: '004', document }}
      markdown={markdown}
      versionNumber={4}
      messages={document === 'spec' ? SPEC?.messages ?? [] : []}
      proposals={[]}
      referenceMarks={document === 'plan' ? EffectTreeModel.referenceMarksOf(PLAN_EFFECT_READING) : []}
      draft={draft}
      onDraft={setDraft}
      settled={false}
    />
  );
}

function renderPreview(markdown = SPEC_MARKDOWN, document: 'spec' | 'plan' = 'spec') {
  const controls = fakeControls();
  controls.render(onBoard(<DiagramFrameAddressContext value={null}><PreviewHost markdown={markdown} document={document} /></DiagramFrameAddressContext>));
  return controls;
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

function frameMessage(data: unknown, source: Window | null): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, source }));
  });
}

const FRAME_HEAD = { protocol: DIAGRAM_FRAME_PROTOCOL, protocolVersion: PAGE_CONTRACT_VERSIONS.gaiaDiagramFrame } as const;

describe('Preview', () => {
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
