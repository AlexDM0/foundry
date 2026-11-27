/**
 * The document agent's side in a happy-dom document: Stop and the queueing composer while a turn works, withdrawing a queued comment,
 * Cmd/Ctrl+Enter for the whole document, Ask first or Auto-apply, an edit's Apply, Discard and Edit first, and how the chat's cards,
 * notes and composer read.
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

import { MarkdownBlocks }                                   from '../../../../src/lib/markdown-render/MarkdownBlocks.ts';
import type { BoardTranscriptEntryDocument }                from '../../../@types/board/ConversationDocument.ts';
import type { GaiaTicketDocumentsDocument }                 from '../../../@types/board/TicketDocumentsDocument.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION } from '../../testing/FakeControls.ts';
import { onBoard }                                          from '../../testing/OnBoard.ts';
import {
  DOCUMENT_STATES,
  DOCUMENTS_TICKET_ID,
  PLAN_OUT_OF_DATE_TRANSCRIPT,
  SAVED_CHOICE_QUESTION,
  SPEC_ASKS_DOCUMENTS,
  SPEC_TRANSCRIPT_ASKS,
  SPEC_TRANSCRIPT_IDLE,
  SPEC_TRANSCRIPT_SPLIT,
  SPEC_TRANSCRIPT_WORKING
} from '../../testing/TicketDocumentsFixture.ts';
import { DocumentAgentStripModelUtil, type DocumentViewMode }          from './DocumentAgentStripModel.ts';
import { DocumentChat }                                                from './DocumentChat.tsx';
import { DocumentChatModel, type DocumentChat as DocumentChatContent } from './DocumentChatModel.ts';
import { DocumentQuestionsModel }                                      from './DocumentQuestionsModel.ts';
import { InlineProposal }                                              from './ProposalCard.tsx';
import { ProposalModel }                                               from './ProposalModel.ts';

afterEach(cleanup);

const PLACE = { ticketId: '004', document: 'spec' } as const;

interface ChatSurroundings {
  readonly view?:        DocumentViewMode;
  readonly draftIsOpen?: boolean;
  readonly shown?:       'spec' | 'plan';
}

function renderChat(
  documents: GaiaTicketDocumentsDocument,
  transcript: readonly BoardTranscriptEntryDocument[],
  { view = 'preview', draftIsOpen = false, shown = 'spec' }: ChatSurroundings = {},
) {
  const document = documents.documents.find((candidate) => candidate.document === shown);
  if (document === undefined) throw new Error(`no ${shown}`);
  const chat = DocumentChatModel.documentChatOf(document, transcript, null);
  const strip = DocumentAgentStripModelUtil.stripOf({
    document, spec: null, chat, effectReading: null, view
  });
  const controls = fakeControls();
  controls.render(onBoard(
    <DocumentChat
      place={{ ticketId: '004', document: shown }}
      chat={chat}
      strip={strip}
      view={view}
      draftIsOpen={draftIsOpen}
      proposalMode="ask-first"
      headNumber={document.head?.number ?? null}
      settled={false}
      onJumpToAnchor={() => undefined}
      onOpenEffect={null}
    />,
  ));
  return controls;
}

describe('while the agent works (artboard 5)', () => {
  test('Stop ends the turn', async () => {
    const controls = renderChat(DOCUMENT_STATES.specSplit, SPEC_TRANSCRIPT_SPLIT);
    expect(screen.queryByRole('group', { name: 'Agent edits' })).toBeNull();
    await clickSettled(screen.getByRole('button', { name: 'Stop' }));
    expect<unknown[]>(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'ticket-document-turn-stop', ticketId: '004', document: 'spec'
    }]);
  });

  test('a queued comment waits under the composer, and × withdraws it', async () => {
    const controls = renderChat(DOCUMENT_STATES.specSplit, SPEC_TRANSCRIPT_SPLIT);
    expect(screen.getByText('Queued for the agent')).toBeTruthy();
    expect(screen.getByText('Sends when the agent finishes C3.')).toBeTruthy();
    await clickSettled(screen.getByRole('button', { name: 'Remove C4 from the queue' }));
    expect<unknown[]>(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'ticket-document-comment-withdraw', ticketId: '004', document: 'spec', messageId: 'M5'
    }]);
  });

  test('the composer queues with Queue ⌘↵, and Cmd+Enter sends a message about the whole document', async () => {
    const controls = renderChat(DOCUMENT_STATES.specSplit, SPEC_TRANSCRIPT_SPLIT);
    const composer = screen.getByRole('textbox', { name: 'Message the spec agent' });
    expect(screen.getByRole('button', { name: 'Queue ⌘↵' })).toBeTruthy();
    fireEvent.change(composer, { target: { value: 'Keep the open question short.' } });
    await act(async () => {
      fireEvent.keyDown(composer, { key: 'Enter', metaKey: true });
      await Promise.resolve();
    });
    expect<unknown[]>(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'ticket-document-comment', ticketId: '004', document: 'spec', anchor: null, text: 'Keep the open question short.',
    }]);
  });
});

describe('while the agent idles with an edit proposed (artboard 4)', () => {
  test('offers Ask first or Auto-apply, and Auto-apply sends the mode', async () => {
    const controls = renderChat(DOCUMENT_STATES.specIdle, SPEC_TRANSCRIPT_IDLE);
    expect(screen.getByRole('button', { name: 'Send ⌘↵' })).toBeTruthy();
    await clickSettled(within(screen.getByRole('group', { name: 'Agent edits' })).getByRole('button', { name: 'Auto-apply' }));
    expect<unknown[]>(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'ticket-document-mode-set', ticketId: '004', document: 'spec', mode: 'auto-apply'
    }]);
  });

  test('the diff card numbers its lines and Apply and Discard send the proposal', async () => {
    const controls = renderChat(DOCUMENT_STATES.specIdle, SPEC_TRANSCRIPT_IDLE);
    const card = screen.getByRole('group', { name: 'Proposed edit, line 29' });
    expect([...card.querySelectorAll('.board-document-diff-number')].map((cell) => cell.textContent)).toEqual(['29', '29']);
    await clickSettled(within(card).getByRole('button', { name: 'Apply' }));
    await clickSettled(within(card).getByRole('button', { name: 'Discard' }));
    expect<unknown[]>(controls.sent.map((command) => command.kind)).toEqual(['ticket-document-proposal-apply', 'ticket-document-proposal-discard']);
  });
});

describe('what the chat draws', () => {
  test('the agent\'s turns are Markdown: bold and code keep their emphasis', () => {
    renderChat(DOCUMENT_STATES.specIdle, SPEC_TRANSCRIPT_IDLE);
    const log = screen.getByRole('log', { name: 'Chat with the spec agent' });
    expect([...log.querySelectorAll('strong')].map((bold) => bold.textContent)).toContain('Saved choice');
    expect([...log.querySelectorAll('code')].map((code) => code.textContent)).toEqual(['check:contrast', 'package.json']);
  });

  test('a comment card sets only its name and lines in mono, and one whose edit waits is marked and offers ↦ show', () => {
    renderChat(DOCUMENT_STATES.specIdle, SPEC_TRANSCRIPT_IDLE);
    const waiting = screen.getByRole('button', { name: 'Show C2 · § 4 Acceptance › A3 · line 29 · Preview' });
    const settled = screen.getByRole('button', { name: 'Show C1 · § 3 Behaviour · line 15 · Preview' });
    expect([...waiting.querySelectorAll('.board-document-mono')].map((mono) => mono.textContent)).toEqual(['C2', 'line 29']);
    expect([waiting.hasAttribute('data-answering'), waiting.textContent.includes('↦ show')]).toEqual([true, true]);
    expect([settled.hasAttribute('data-answering'), settled.textContent.includes('↦ show')]).toEqual([false, false]);
  });

  test('an edit\'s card says what Apply closes', () => {
    renderChat(DOCUMENT_STATES.specIdle, SPEC_TRANSCRIPT_IDLE);
    expect(screen.getByText('Applying closes C2; its mark turns to ✓ C2.')).toBeTruthy();
  });

  test('while the agent reads, the chat names the whole path it reads', () => {
    renderChat(DOCUMENT_STATES.specSplit, SPEC_TRANSCRIPT_SPLIT);
    expect(screen.getByText('apps/storefront/server/render.ts').closest('.board-document-activity')).toBeTruthy();
    cleanup();
    renderChat(DOCUMENT_STATES.specIdle, SPEC_TRANSCRIPT_IDLE);
    expect(document.querySelector('.board-document-activity')).toBeNull();
  });

  test('a note of the board\'s stands as a dashed note before the agent\'s turn', () => {
    renderChat(DOCUMENT_STATES.planOutOfDate, PLAN_OUT_OF_DATE_TRANSCRIPT, { shown: 'plan' });
    const note = screen.getByText('Spec went from v5 to v6 at 15:12. Plan v3 is marked out of date; your approval of it stays on record.');
    expect(note.className).toBe('board-document-board-note');
    expect(note.nextElementSibling?.className).toBe('board-document-agent-turn');
  });

  test('the composer asks for lines in Code and text elsewhere, says where a comment being written lands, and names the version only while no edit waits', () => {
    renderChat(DOCUMENT_STATES.specIdle, SPEC_TRANSCRIPT_IDLE, { view: 'code', draftIsOpen: true });
    const composer = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Message the spec agent' });
    expect(composer.placeholder).toBe('Ask about the whole spec, or select lines to comment on one part');
    expect(screen.getByText('A comment lands here as its own message')).toBeTruthy();
    cleanup();
    renderChat(DOCUMENT_STATES.specIdle, SPEC_TRANSCRIPT_IDLE);
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Message the spec agent' }).placeholder)
      .toBe('Ask about the whole spec, or select text in it to comment on one part');
    expect(screen.queryByText('Sees the whole spec at v4')).toBeNull();
    cleanup();
    renderChat(DOCUMENT_STATES.specWorking, SPEC_TRANSCRIPT_WORKING);
    expect(screen.getByText('Sees the whole spec at v4')).toBeTruthy();
  });

  test('while a comment is written, the waiting edit folds to one line that Show unfolds, and the cards drop the view shown', () => {
    renderChat(DOCUMENT_STATES.specIdle, SPEC_TRANSCRIPT_IDLE, { draftIsOpen: true });
    expect(screen.queryByText('Applying closes C2; its mark turns to ✓ C2.')).toBeNull();
    const waiting = screen.getByRole('button', { name: 'Show C2 · § 4 Acceptance › A3 · line 29 · Preview' });
    expect([waiting.textContent.includes('· Preview'), waiting.textContent.includes('↦ show')]).toEqual([false, false]);
    expect(screen.getByText('Edit proposed for line 29')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByText('Applying closes C2; its mark turns to ✓ C2.')).toBeTruthy();
  });

  test('the working agent\'s whole path shows only where the strip shortens it', () => {
    renderChat(DOCUMENT_STATES.specWorking, SPEC_TRANSCRIPT_WORKING);
    expect(document.querySelector('.board-document-activity')).toBeNull();
  });
});

describe('an edit inline', () => {
  test('Edit first opens the agent\'s lines in a field, and Apply sends User\'s own', async () => {
    const [spec] = DOCUMENT_STATES.specIdle.documents;
    const [proposal] = ProposalModel.openProposalsOf('spec', spec?.proposals ?? []);
    if (proposal === undefined) throw new Error('no proposal');
    const controls = fakeControls();
    controls.render(onBoard(<InlineProposal place={PLACE} proposal={proposal} />));
    expect(screen.getByRole('group', { name: 'Spec agent proposes · line 29 only' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit first' }));
    const field = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Your text for edit 1' });
    expect(field.value).toContain('bun run check:contrast');
    fireEvent.change(field, { target: { value: '- [ ] **A3** `bun run check:contrast` passes.' } });
    await clickSettled(screen.getByRole('button', { name: 'Apply' }));
    expect<unknown[]>(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION,
      kind:             'ticket-document-proposal-apply',
      ticketId:         '004',
      document:         'spec',
      proposalId:       'P3',
      replacementLines: [['- [ ] **A3** `bun run check:contrast` passes.']],
    }]);
  });
});

describe('the open question (artboard 11)', () => {
  test('comes to the chat\'s top as it unfolds, and not again when the agent\'s turn changes while User reads down its card', () => {
    const spec = SPEC_ASKS_DOCUMENTS.documents[0];
    if (spec === undefined) throw new Error('no spec');
    const shownSpec = spec;
    const questions = DocumentQuestionsModel.documentQuestionsOf({
      decisions: [SAVED_CHOICE_QUESTION], messages: spec.messages, ticketId: DOCUMENTS_TICKET_ID, document: 'spec', blocks: MarkdownBlocks.blocksOf(spec.markdown),
    });
    const idle = DocumentChatModel.documentChatOf(spec, SPEC_TRANSCRIPT_ASKS, null, questions);
    const strip = DocumentAgentStripModelUtil.stripOf({
      document: spec, spec: null, chat: idle, effectReading: null, view: 'preview'
    });
    let showChat: (chat: DocumentChatContent) => void = () => undefined;

    function ChatOverTurns() {
      const [chat, setChat] = useState(idle);
      showChat = setChat;
      return (
        <DocumentChat
          place={PLACE}
          chat={chat}
          strip={strip}
          view="preview"
          draftIsOpen={false}
          proposalMode="ask-first"
          headNumber={shownSpec.head?.number ?? null}
          settled={false}
          expandedQuestionId="E7"
          onJumpToAnchor={() => undefined}
          onOpenEffect={null}
        />
      );
    }
    fakeControls().render(onBoard(<ChatOverTurns />));
    const chatElement = document.querySelector<HTMLElement>('.board-document-chat');
    const card = document.querySelector<HTMLElement>('.board-document-question[data-state="open"]');
    if (chatElement === null || card === null) throw new Error('no chat or no open question');
    card.getBoundingClientRect = () => ({ top: -100 }) as DOMRect;
    chatElement.scrollTop = 500;
    act(() => {
      showChat({ ...idle, working: true });
    });
    expect(chatElement.scrollTop).toBe(500);
  });
});
