/**
 * The document agent's side of the page: its head, the chat (comments, turns, proposed edits, the effect reading and questions), opening on
 * its newest item, the notice that an edit lands on User's changes, Flint's strip and the composer. A message sent while the agent works
 * waits in the queue under the composer, where `×` withdraws it; Cmd/Ctrl+Enter sends.
 */
import { useLayoutEffect, useRef, useState } from 'react';

import { MarkdownBlocks }                                                                   from '../../../../src/lib/markdown-render/MarkdownBlocks.ts';
import type { BoardProposalMode }                                                           from '../../../@types/board/BoardVocabulary.ts';
import type { BoardLineRangeDocument }                                                      from '../../../@types/board/TicketDocumentsDocument.ts';
import { Button, SegmentedControl, type SegmentOption }                                     from '../../../lib/design-system/DesignSystemInterface.ts';
import { CountTextUtil }                                                                    from '../../../shared/utils/CountTextUtil.ts';
import { FLINT_SLOT_CUES }                                                                  from '../../flint/FlintSlotCues.ts';
import { useControlCommand }                                                                from '../../shared/commands/ControlCommandSender.ts';
import { sendKeyIsPressed }                                                                 from './CommentPopover.tsx';
import type { AnchorLineParts }                                                             from './CommentPopoverModel.ts';
import { DocumentAgentStrip }                                                               from './DocumentAgentStrip.tsx';
import { DocumentAgentStripModelUtil, type DocumentAgentStripModel, type DocumentViewMode } from './DocumentAgentStripModel.ts';
import { DocumentBlocks }                                                                   from './DocumentBlocks.tsx';
import type {
  ChatMessageItem,
  ChatProposalItem,
  DocumentChat as DocumentChatContent,
  DocumentChatItem,
  QueuedMessageItem
} from './DocumentChatModel.ts';
import { AnsweredQuestionCard, OpenQuestionCard }     from './DocumentQuestionCard.tsx';
import { ProposalDiffCard }                           from './ProposalCard.tsx';
import { TicketDocumentCommands, type DocumentPlace } from './TicketDocumentCommands.ts';

const MODE_OPTIONS: readonly SegmentOption<BoardProposalMode>[] = [
  { value: 'ask-first', label: 'Ask first' },
  { value: 'auto-apply', label: 'Auto-apply' },
];

const ASK_ABOUT = { spec: 'Ask about the whole spec', plan: 'Ask about the plan' } as const;

/** Code takes a comment on lines, Preview and Split on text. */
function placeholderOf(document: DocumentPlace['document'], view: DocumentViewMode): string {
  return `${ASK_ABOUT[document]}, or select ${view === 'code' ? 'lines' : 'text in it'} to comment on one part`;
}

/**
 * The chat opens on its newest item; where the top edge would then cut an item, the chat shows it whole when its bottom padding can give
 * the room, else, where most of it is cut off, room under the newest item, at most a quarter of the chat, lets that edge fall between two
 * items instead. Run on the chat element, at its end only, so a chat User scrolled stays put.
 */
// Its shares are defaults, not constants of the module, so a painted screen can run the function's own text.
export function letChatTopFallBetweenItems(chat: HTMLElement | null, mostOfAnItem = 0.66, mostRoomOfTheChat = 0.25): void {
  const items = chat?.querySelector<HTMLElement>('.board-document-chat-items');
  if (chat === null || chat === undefined || items === null || items === undefined) return;
  items.style.paddingBottom = '';
  if (Math.abs(chat.scrollTop) > 1) return;
  const topEdge = chat.getBoundingClientRect().top;
  const cutItem = [...items.children].find((item) => {
    const place = item.getBoundingClientRect();
    return place.top < topEdge && place.bottom > topEdge;
  });
  if (cutItem === undefined) return;
  const place = cutItem.getBoundingClientRect();
  const shownHeight = place.bottom - topEdge;
  const hiddenHeight = topEdge - place.top;
  if (hiddenHeight <= (Number.parseFloat(getComputedStyle(chat).paddingBottom) || 0)) {
    chat.scrollTop -= hiddenHeight;
    return;
  }
  const room = shownHeight + (Number.parseFloat(getComputedStyle(items).rowGap) || 0);
  if (shownHeight >= place.height * mostOfAnItem || room > chat.clientHeight * mostRoomOfTheChat) return;
  // The browser's scroll anchoring would keep the cut item in place; the room is meant to move it, so anchoring sits out this one layout.
  chat.style.overflowAnchor = 'none';
  items.style.paddingBottom = `${room}px`;
  chat.scrollTop = 0;
  chat.style.overflowAnchor = '';
}

/** The question waiting on User shows from its top: where the chat's top edge cuts its card, the chat scrolls the card's top to its own. */
export function bringOpenQuestionToChatTop(chat: HTMLElement | null): void {
  const card = chat?.querySelector<HTMLElement>('.board-document-question[data-state="open"]');
  if (chat === null || chat === undefined || card === null || card === undefined) return;
  const cutBy = chat.getBoundingClientRect().top + (Number.parseFloat(getComputedStyle(chat).paddingTop) || 0) - card.getBoundingClientRect().top;
  if (cutBy > 0) chat.scrollTop -= cutBy;
}

export interface DocumentChatProps {
  readonly place:               DocumentPlace;
  readonly chat:                DocumentChatContent;
  readonly strip:               DocumentAgentStripModel;
  readonly view:                DocumentViewMode;
  /** A comment is being written in the popover: the composer says where it lands. */
  readonly draftIsOpen?:        boolean;
  readonly proposalMode:        BoardProposalMode;
  readonly headNumber:          number | null;
  /** The document can no longer change: the chat is shown, the composer and the edits offer nothing. */
  readonly settled:             boolean;
  readonly onJumpToAnchor:      (lines: BoardLineRangeDocument) => void;
  /** Opens the effect pane; `null` where the page offers no effect reading. */
  readonly onOpenEffect:        (() => void) | null;
  /** That the agent's edit lands on what User changed while it works; `null` while there is nothing to say. */
  readonly userEditNotice?:     string | null;
  /** The one open question whose card is unfolded; the others fold to a line. */
  readonly expandedQuestionId?: string | null;
  readonly onExpandQuestion?:   (decisionId: string) => void;
}

function ModeSwitch({ place, mode }: { readonly place: DocumentPlace; readonly mode: BoardProposalMode }) {
  const askFirst = useControlCommand(mode === 'ask-first' ? null : TicketDocumentCommands.modeOf(place, 'ask-first'));
  const autoApply = useControlCommand(mode === 'auto-apply' ? null : TicketDocumentCommands.modeOf(place, 'auto-apply'));
  return (
    <SegmentedControl
      accessibleName="Agent edits"
      options={MODE_OPTIONS}
      selected={mode}
      size="compact"
      onSelect={(chosen) => void (chosen === 'ask-first' ? askFirst.send() : autoApply.send())}
    />
  );
}

function StopButton({ place }: { readonly place: DocumentPlace }) {
  const stop = useControlCommand(TicketDocumentCommands.turnStopOf(place));
  return <Button label="Stop" dense disabled={!stop.enabled} onPress={() => void stop.send()} />;
}

/** `C2 · § 4 Acceptance › A3 · line 29 · Preview`, the comment's name and its lines in the mono face; the view word where it is asked for. */
function AnchorLabel({ parts, namesView }: { readonly parts: AnchorLineParts; readonly namesView: boolean }) {
  return (
    <span>
      <span className="board-document-mono board-document-anchor-name">{parts.commentName}</span>
      {parts.section === null ? null : ` · ${parts.section}`}
      {' · '}
      <span className="board-document-mono">{parts.linesText}</span>
      {namesView ? ` · ${parts.viewWord}` : null}
    </span>
  );
}

/**
 * While User writes a comment the chat quiets: a card names its view only where it differs from the view shown, and an edit waiting for
 * review folds to one line, so its comment offers no `↦ show`.
 */
interface ChatQuieting {
  readonly draftIsOpen: boolean;
  readonly view:        DocumentViewMode;
}

function namesViewOf(parts: AnchorLineParts, { draftIsOpen, view }: ChatQuieting): boolean {
  return !draftIsOpen || parts.viewWord.toLowerCase() !== view;
}

function MessageCard({ item, quieting, onJumpToAnchor }: {
  readonly item:           ChatMessageItem;
  readonly quieting:       ChatQuieting;
  readonly onJumpToAnchor: (lines: BoardLineRangeDocument) => void;
}) {
  const { placement, anchorParts } = item;
  const marked = item.answering || item.hasOpenEdit;
  const anchor = anchorParts === null
    ? null
    : (
      <>
        <span>
          <AnchorLabel parts={anchorParts} namesView={namesViewOf(anchorParts, quieting)} />
          {item.orphaned ? <span className="board-document-note">{' · orphaned'}</span> : null}
          {placement !== null && item.hasOpenEdit && !quieting.draftIsOpen
            ? <span className="board-document-anchor-show" aria-hidden="true">{' ↦ show'}</span>
            : null}
        </span>
        {item.quote === null ? null : <span className="board-document-anchor-quote">{`“${item.quote}”`}</span>}
      </>
    );
  return (
    <div className="board-document-message">
      {anchor === null
        ? null
        : placement === null
          ? <div className="board-document-anchor" data-answering={marked ? '' : undefined}>{anchor}</div>
          : (
            <button
              type="button"
              className="board-document-anchor"
              data-answering={marked ? '' : undefined}
              aria-label={`Show ${item.anchorLine ?? ''}`}
              onClick={() => onJumpToAnchor(placement)}
            >
              {anchor}
            </button>
          )}
      <div className="board-document-bubble">{item.text}</div>
    </div>
  );
}

/** An edit waiting for review, folded to one line while User writes a comment: `Show` unfolds it. */
function ChatProposal({ item, props }: { readonly item: ChatProposalItem; readonly props: DocumentChatProps }) {
  const [unfolded, setUnfolded] = useState(false);
  if (props.draftIsOpen === true && !unfolded && !props.settled) {
    return (
      <div className="board-document-folded-proposal">
        <span className="board-document-folded-proposal-title">{`Edit proposed for ${item.proposal.linesText}`}</span>
        <button type="button" className="board-document-link-button" onClick={() => setUnfolded(true)}>Show</button>
      </div>
    );
  }
  return (
    <div className="board-document-chat-proposal">
      <ProposalDiffCard place={props.place} proposal={item.proposal} settled={props.settled} />
      {props.settled || item.closesComment === null
        ? null
        : <p className="board-document-chat-note">{`Applying closes C${item.closesComment}; its mark turns to ✓ C${item.closesComment}.`}</p>}
    </div>
  );
}

/** "Edited lines 20, 37–39 · applied · v4", its line numbers in the mono face. */
function ProposalNote({ text, editedNumbers }: { readonly text: string; readonly editedNumbers: string }) {
  const at = text.indexOf(editedNumbers);
  if (at < 0) return <p className="board-document-chat-note">{text}</p>;
  return (
    <p className="board-document-chat-note">
      {text.slice(0, at)}
      <span className="board-document-mono">{editedNumbers}</span>
      {text.slice(at + editedNumbers.length)}
    </p>
  );
}

function ChatItem({ item, props }: { readonly item: DocumentChatItem; readonly props: DocumentChatProps }) {
  switch (item.kind) {
    case 'message':
      return <MessageCard item={item} quieting={{ draftIsOpen: props.draftIsOpen ?? false, view: props.view }} onJumpToAnchor={props.onJumpToAnchor} />;
    case 'board-note':
      return <p className="board-document-board-note">{item.text}</p>;
    case 'agent-turn':
      return item.prose.trim() === ''
        ? null
        : (
          <div className="board-document-agent-turn" data-working={item.working ? '' : undefined}>
            <DocumentBlocks blocks={MarkdownBlocks.blocksOf(item.prose)} />
          </div>
        );
    case 'proposal':
      return <ChatProposal item={item} props={props} />;
    case 'open-question':
      return (
        <OpenQuestionCard
          question={item.question}
          expanded={item.question.decisionId === (props.expandedQuestionId ?? null)}
          onExpand={props.onExpandQuestion ?? (() => undefined)}
          onJumpToAnchor={props.onJumpToAnchor}
          settled={props.settled}
        />
      );
    case 'answered-question':
      return <AnsweredQuestionCard answered={item.answered} onJumpToAnchor={props.onJumpToAnchor} />;
    case 'proposal-note':
      return <ProposalNote text={item.text} editedNumbers={item.editedNumbers} />;
    case 'effect-card': {
      const { onOpenEffect } = props;
      const facts = `${CountTextUtil.countedPhrase(item.placeCount, 'place', 'places')} · ${item.unresolvedCount} unresolved`;
      return onOpenEffect === null
        ? <p className="board-document-chat-note">{`What the plan names: ${facts}`}</p>
        : (
          <button type="button" className="board-document-effect-card" onClick={onOpenEffect}>
            <span className="board-document-effect-card-title">What the plan names</span>
            <span className="board-document-mono board-document-note">{facts}</span>
            <span className="board-document-effect-card-open">Open</span>
          </button>
        );
    }
  }
}

function QueuedMessage({ place, item, answeringComment }: { readonly place: DocumentPlace; readonly item: QueuedMessageItem; readonly answeringComment: number | null }) {
  const withdraw = useControlCommand(TicketDocumentCommands.withdrawOf(place, item.messageId));
  const name = item.anchorParts?.commentName ?? 'the message';
  return (
    <div className="board-document-queued">
      <div className="board-document-queued-head">
        {item.anchorParts === null ? <span>Message</span> : <AnchorLabel parts={item.anchorParts} namesView={false} />}
        <button
          type="button"
          className="board-document-queued-withdraw"
          aria-label={`Remove ${name} from the queue`}
          disabled={!withdraw.enabled}
          onClick={() => void withdraw.send()}
        >
          ×
        </button>
      </div>
      <span className="board-document-anchor-quote">{`“${item.text}”`}</span>
      <span className="board-document-note">{answeringComment === null ? 'Sends when the agent finishes its turn.' : `Sends when the agent finishes C${answeringComment}.`}</span>
      {withdraw.refusal === null ? null : <span className="board-refusal" role="status">{withdraw.refusal}</span>}
    </div>
  );
}

/** Where a comment lands while one is written; else the version the agent sees, said only while no edit of its waits for review. */
function composerNoteOf(document: DocumentPlace['document'], headNumber: number | null, draftIsOpen: boolean, editWaits: boolean): string {
  if (draftIsOpen) return 'A comment lands here as its own message';
  return headNumber === null || editWaits ? '' : `Sees the whole ${document} at v${headNumber}`;
}

/** What the working agent reads now, with the whole path the strip shortens; nothing where the strip names the path whole. */
function Activity({ chat }: { readonly chat: DocumentChatContent }) {
  const call = !chat.working ? null : chat.runningCall;
  const path = call === null ? null : DocumentAgentStripModelUtil.namedPathOf(call);
  if (call === null || path === null || path === DocumentAgentStripModelUtil.namedFileOf(call)) return null;
  return (
    <p className="board-document-activity">
      <span className="board-document-agent-dot" data-working="" aria-hidden="true" />
      <span>Reading <span className="board-document-mono">{path}</span> …</span>
    </p>
  );
}

function Composer({ props }: { readonly props: DocumentChatProps }) {
  const {
    place, chat, headNumber, settled, onOpenEffect, view, draftIsOpen = false
  } = props;
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const message = settled || trimmed === '' ? null : TicketDocumentCommands.commentOf(place, null, trimmed);
  const sender = useControlCommand(message, { onApplied: () => setText((current) => (current === text ? '' : current)) });
  const effectReadCommand = onOpenEffect === null || headNumber === null ? null : TicketDocumentCommands.effectReadOf(place, headNumber);
  const effectRead = useControlCommand(effectReadCommand, { onApplied: () => onOpenEffect?.() });
  const agentName = props.strip.agentName.toLowerCase();
  const fieldId = `${place.ticketId}-${place.document}-composer`;
  const queues = chat.working;
  return (
    <form className="board-document-composer" onSubmit={(event) => event.preventDefault()}>
      {chat.queued.length === 0
        ? null
        : (
          <>
            <span className="board-document-micro">Queued for the agent</span>
            {chat.queued.map((item) => <QueuedMessage key={item.messageId} place={place} item={item} answeringComment={chat.answeringComment} />)}
          </>
        )}
      <label className="board-document-micro" htmlFor={fieldId}>{`Message the ${agentName}`}</label>
      <textarea
        id={fieldId}
        className="board-textarea board-document-composer-input"
        rows={3}
        placeholder={placeholderOf(place.document, view)}
        value={text}
        disabled={settled}
        onChange={(event) => setText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (!sendKeyIsPressed(event)) return;
          event.preventDefault();
          void sender.send();
        }}
      />
      {sender.refusal === null ? null : <span className="board-refusal" role="status">{sender.refusal}</span>}
      {effectRead.refusal === null ? null : <span className="board-refusal" role="status">{effectRead.refusal}</span>}
      <div className="board-document-composer-foot">
        {onOpenEffect === null
          ? <span className="board-document-note">{composerNoteOf(place.document, headNumber, draftIsOpen, chat.items.some((item) => item.kind === 'proposal'))}</span>
          : <Button label="Show effect in repo" dense disabled={!effectRead.enabled} onPress={() => void effectRead.send()} />}
        <Button label={queues ? 'Queue ⌘↵' : 'Send ⌘↵'} emphasis={queues ? 'quiet' : 'primary'} dense disabled={!sender.enabled} onPress={() => void sender.send()} />
      </div>
    </form>
  );
}

export function DocumentChat(props: DocumentChatProps) {
  const {
    place, chat, strip, proposalMode, settled, userEditNotice = null
  } = props;
  const chatElement = useRef<HTMLDivElement>(null);
  const questionBroughtUp = useRef<string | null>(null);
  const { expandedQuestionId = null } = props;
  useLayoutEffect(() => {
    // A question comes to the chat's top as it unfolds; a turn that changes under it later leaves where User scrolled in its card.
    const bringsQuestion = expandedQuestionId !== questionBroughtUp.current;
    questionBroughtUp.current = expandedQuestionId;
    const placeChatTop = (): void => {
      letChatTopFallBetweenItems(chatElement.current);
      if (bringsQuestion) bringOpenQuestionToChatTop(chatElement.current);
    };
    placeChatTop();
    // Items change height once the page's fonts load, so the chat's top edge is placed again then.
    if ('fonts' in globalThis.document) void globalThis.document.fonts.ready.then(placeChatTop);
  }, [chat.items.length, chat.working, userEditNotice, expandedQuestionId]);
  return (
    <aside className="board-document-agent" aria-label={strip.agentName}>
      <div className="board-document-agent-head">
        <span
          className="board-document-agent-dot"
          data-working={chat.working ? '' : undefined}
          data-waits={!chat.working && strip.cue === FLINT_SLOT_CUES.AGENT_WAITS_ON_USER ? '' : undefined}
          aria-hidden="true"
        />
        <div className="board-document-agent-title">
          <span className="board-document-agent-name">{strip.agentName}</span>
          <span className="board-document-note">{strip.headLine}</span>
        </div>
        {settled
          ? null
          : <div className="board-document-agent-head-control">{chat.working ? <StopButton place={place} /> : <ModeSwitch place={place} mode={proposalMode} />}</div>}
      </div>
      <div className="board-document-chat" ref={chatElement} role="log" aria-label={`Chat with the ${strip.agentName.toLowerCase()}`}>
        <div className="board-document-chat-items">
          {chat.items.map((item) => <ChatItem key={item.key} item={item} props={props} />)}
          <Activity chat={chat} />
          {userEditNotice === null ? null : <p className="board-document-edit-notice">{userEditNotice}</p>}
        </div>
      </div>
      <DocumentAgentStrip document={place.document} strip={strip} />
      <Composer props={props} />
    </aside>
  );
}
