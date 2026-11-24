/**
 * The document agent's side in a happy-dom document. What matters: while a turn works the head offers Stop, which ends the turn, and the
 * composer queues with `Queue ⌘↵`; a queued comment waits under the composer and `×` withdraws it; Cmd/Ctrl+Enter sends a message about
 * the whole document; an idle agent offers Ask first or Auto-apply; and an edit offers Apply, Discard and, inline, Edit first, which sends
 * User's own lines.
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

import type { BoardTranscriptEntryDocument }                            from '../../../@types/board/ConversationDocument.ts';
import type { GaiaTicketDocumentsDocument }                             from '../../../@types/board/TicketDocumentsDocument.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION }             from '../../testing/FakeControls.ts';
import { onBoard }                                                      from '../../testing/OnBoard.ts';
import { DOCUMENT_STATES, SPEC_TRANSCRIPT_IDLE, SPEC_TRANSCRIPT_SPLIT } from '../../testing/TicketDocumentsFixture.ts';
import { DocumentAgentStripModelUtil }                                  from './DocumentAgentStripModel.ts';
import { DocumentChat }                                                 from './DocumentChat.tsx';
import { DocumentChatModel }                                            from './DocumentChatModel.ts';
import { InlineProposal }                                               from './ProposalCard.tsx';
import { ProposalModel }                                                from './ProposalModel.ts';

afterEach(cleanup);

const PLACE = { ticketId: '004', document: 'spec' } as const;

function renderChat(documents: GaiaTicketDocumentsDocument, transcript: readonly BoardTranscriptEntryDocument[]) {
  const [spec] = documents.documents;
  if (spec === undefined) throw new Error('no spec');
  const chat = DocumentChatModel.documentChatOf(spec, transcript, null);
  const strip = DocumentAgentStripModelUtil.stripOf({
    document: spec, spec: null, chat, effectReading: null, view: 'preview'
  });
  const controls = fakeControls();
  controls.render(onBoard(
    <DocumentChat
      place={PLACE}
      chat={chat}
      strip={strip}
      proposalMode="ask-first"
      headNumber={spec.head?.number ?? null}
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
