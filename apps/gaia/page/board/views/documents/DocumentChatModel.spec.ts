/**
 * A document agent's chat: each sent message before the turn it opened, the job's own user lines left out; proposals, working turns, queued
 * and untaken messages, the effect reading's card, the notice that an edit lands on User's text, and the agent's questions, answered ones
 * in place and open ones last.
 */
import { describe, expect, test } from 'bun:test';

import { MarkdownBlocks }   from '../../../../src/lib/markdown-render/MarkdownBlocks.ts';
import {
  DOCUMENT_STATES,
  DOCUMENTS_TICKET_ID,
  SAVED_CHOICE_QUESTION,
  SPEC_ASKS_DOCUMENTS,
  SPEC_TRANSCRIPT_ASKS,
  PLAN_EFFECT_READING,
  PLAN_TRANSCRIPT,
  SPEC_TRANSCRIPT_IDLE,
  SPEC_TRANSCRIPT_SPLIT,
  SPEC_TRANSCRIPT_WORKING
} from '../../testing/TicketDocumentsFixture.ts';
import { DocumentChatModel }      from './DocumentChatModel.ts';
import { DocumentQuestionsModel } from './DocumentQuestionsModel.ts';

function shapeOf(items: readonly { readonly kind: string }[]): string[] {
  return items.map((item) => item.kind);
}

describe('the chat of a working spec agent (artboard 1)', () => {
  const [spec] = DOCUMENT_STATES.specWorking.documents;
  if (spec === undefined) throw new Error('no spec');
  const chat = DocumentChatModel.documentChatOf(spec, SPEC_TRANSCRIPT_WORKING, null);

  test('places each message before the turn it opened, and each settled edit after the turn that answered it', () => {
    expect(shapeOf(chat.items)).toEqual(['message', 'agent-turn', 'proposal-note', 'message', 'agent-turn', 'proposal-note', 'message', 'agent-turn']);
    expect(chat.items.filter((item) => item.kind === 'message').map((item) => (item.kind === 'message' ? item.anchorLine : null))).toEqual([
      null,
      'C1 · § 3 Behaviour · line 15 · Preview',
      'C2 · § 4 Acceptance › A3 · line 29 · Preview',
    ]);
  });

  test('works on C2, reading package.json, and the job\'s own user lines stay out', () => {
    expect([chat.working, chat.answeringComment, chat.runningCall?.toolName]).toEqual([true, 2, 'Read']);
    expect(chat.items.some((item) => item.kind === 'agent-turn' && item.prose.includes('"comment"'))).toBe(false);
  });
});

describe('the chat of an idle spec agent (artboards 2 to 4)', () => {
  const [spec] = DOCUMENT_STATES.specIdle.documents;
  if (spec === undefined) throw new Error('no spec');
  const chat = DocumentChatModel.documentChatOf(spec, SPEC_TRANSCRIPT_IDLE, null);

  test('ends on the proposed edit\'s diff card after C2\'s turn, and the agent no longer works', () => {
    expect(shapeOf(chat.items).slice(-3)).toEqual(['message', 'agent-turn', 'proposal']);
    expect([chat.working, chat.answeringComment, chat.runningCall]).toEqual([false, null, null]);
  });
});

describe('the chat while User edits in Split (artboard 5)', () => {
  const [spec] = DOCUMENT_STATES.specSplit.documents;
  if (spec === undefined) throw new Error('no spec');
  const chat = DocumentChatModel.documentChatOf(spec, SPEC_TRANSCRIPT_SPLIT, null);

  test('answers C3, made on v5, and keeps C4 queued under the composer', () => {
    expect([chat.working, chat.answeringComment, chat.answeringOnVersion]).toEqual([true, 3, 5]);
    expect(chat.queued.map((item) => [item.messageId, item.anchorLine])).toEqual([['M5', 'C4 · § 6 Open questions · line 39 · Preview']]);
    expect(chat.items.some((item) => item.kind === 'message' && item.messageId === 'M5')).toBe(false);
  });

  test('says User\'s edit on the caret\'s line lands under the agent\'s edit to C3\'s lines, proposed against the head', () => {
    expect(chat.answeringLines).toEqual({ from: 17, to: 23 });
    expect(DocumentChatModel.userEditNoticeOf({
      document: spec, chat, editing: true, caretLine: 34
    })).toBe('You changed line 34 while the agent works. It proposes against v6, so its edit to lines 17–23 lands on your text, not over it.');
    expect(DocumentChatModel.userEditNoticeOf({
      document: spec, chat, editing: false, caretLine: null
    })).toBe('You changed the spec while the agent works. It proposes against v6, so its edit to lines 17–23 lands on your text, not over it.');
  });

  test('says nothing while the agent answers on the head, User saved nothing since and types nothing', () => {
    const onHead = { ...spec, head: spec.head === null ? null : { ...spec.head, author: 'agent' as const }, versions: [] };
    expect(DocumentChatModel.userEditNoticeOf({
      document: onHead, chat, editing: false, caretLine: null
    })).toBeNull();
    expect(DocumentChatModel.userEditNoticeOf({
      document: onHead, chat, editing: true, caretLine: 34
    })).not.toBeNull();
    const idle = DocumentChatModel.documentChatOf(spec, SPEC_TRANSCRIPT_IDLE, null);
    expect(DocumentChatModel.userEditNoticeOf({
      document: spec, chat: idle, editing: true, caretLine: 34
    })).toBeNull();
  });
});

describe('a message the agent has not taken yet', () => {
  test('follows the turns', () => {
    const [spec] = DOCUMENT_STATES.specIdle.documents;
    if (spec === undefined) throw new Error('no spec');
    const sent = {
      ...spec,
      messages: [...spec.messages, {
        ...spec.messages[0], messageId: 'M9', agentTurn: null, text: 'One more thing.'
      }]
    } as typeof spec;
    const chat = DocumentChatModel.documentChatOf(sent, SPEC_TRANSCRIPT_IDLE, null);
    expect(chat.items.at(-1)).toMatchObject({ kind: 'message', messageId: 'M9' });
  });
});

describe('the plan agent\'s chat (artboard 7)', () => {
  test('puts the effect reading\'s card under User\'s newest ask, before the agent\'s reply, with its places and unresolved count', () => {
    const [, plan] = DOCUMENT_STATES.plan.documents;
    if (plan === undefined) throw new Error('no plan');
    const chat = DocumentChatModel.documentChatOf(plan, PLAN_TRANSCRIPT, PLAN_EFFECT_READING);
    expect(chat.items.at(-2)).toEqual({
      kind: 'effect-card', key: 'effect.2', placeCount: 6, unresolvedCount: 2
    });
    expect(shapeOf(chat.items)).toEqual(['agent-turn', 'message', 'effect-card', 'agent-turn']);
  });
});

describe('the chat of a spec agent that asks User (artboard 11)', () => {
  const [spec] = SPEC_ASKS_DOCUMENTS.documents;
  if (spec === undefined) throw new Error('no spec');
  const questionsOf = (messages = spec.messages) => DocumentQuestionsModel.documentQuestionsOf({
    decisions: [SAVED_CHOICE_QUESTION], messages, ticketId: DOCUMENTS_TICKET_ID, document: 'spec', blocks: MarkdownBlocks.blocksOf(spec.markdown),
  });

  test('the answered question stands as its card before the turn its answer opened, and the open question last', () => {
    const chat = DocumentChatModel.documentChatOf(spec, SPEC_TRANSCRIPT_ASKS, null, questionsOf());
    expect(shapeOf(chat.items)).toEqual(['message', 'agent-turn', 'proposal-note', 'answered-question', 'agent-turn', 'open-question']);
    expect(chat.items.at(-1)).toMatchObject({ kind: 'open-question', question: { decisionId: 'E7' } });
  });

  test('an answer waiting for the agent\'s turn stands as its card after the turns, and never in the queue under the composer', () => {
    const messages = spec.messages.map((message) => (message.decisionId === null ? message : { ...message, state: 'queued' as const, agentTurn: null }));
    const chat = DocumentChatModel.documentChatOf({ ...spec, messages }, SPEC_TRANSCRIPT_ASKS.slice(0, 3), null, questionsOf(messages));
    expect(shapeOf(chat.items)).toEqual(['message', 'agent-turn', 'proposal-note', 'answered-question', 'open-question']);
    expect(chat.items.find((item) => item.kind === 'answered-question')).toMatchObject({ answered: { decisionId: 'E8', waitsForAgent: true } });
    expect(chat.queued).toEqual([]);
  });
});
