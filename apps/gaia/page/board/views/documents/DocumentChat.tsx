/**
 * The document agent's side of the page: its head (the agent, what it does, Ask first or Auto-apply, or Stop while a turn works), the chat
 * (comments as cards that jump to their anchor, the agent's turns, its proposed edits and the effect reading's card), Flint's strip and the
 * composer. A message sent while the agent works waits in the queue under the composer, where `×` withdraws it, and the composer's button
 * reads `Queue ⌘↵`; Cmd/Ctrl+Enter sends. On a plan the composer offers the effect reading of the head.
 */
import { useState } from 'react';

import type { BoardProposalMode }                       from '../../../@types/board/BoardVocabulary.ts';
import type { BoardLineRangeDocument }                  from '../../../@types/board/TicketDocumentsDocument.ts';
import { Button, SegmentedControl, type SegmentOption } from '../../../lib/design-system/DesignSystemInterface.ts';
import { useControlCommand }                            from '../../shell/ControlCommandSender.ts';
import { sendKeyIsPressed }                             from './CommentPopover.tsx';
import { DocumentAgentStrip }                           from './DocumentAgentStrip.tsx';
import type { DocumentAgentStripModel }                 from './DocumentAgentStripModel.ts';
import type {
  ChatMessageItem,
  DocumentChat as DocumentChatContent,
  DocumentChatItem,
  QueuedMessageItem
} from './DocumentChatModel.ts';
import { ProposalDiffCard }                           from './ProposalCard.tsx';
import { TicketDocumentCommands, type DocumentPlace } from './TicketDocumentCommands.ts';

const MODE_OPTIONS: readonly SegmentOption<BoardProposalMode>[] = [
  { value: 'ask-first', label: 'Ask first' },
  { value: 'auto-apply', label: 'Auto-apply' },
];

const PLACEHOLDERS = {
  spec: 'Ask about the whole spec, or select text in it to comment on one part',
  plan: 'Ask about the plan, or select text in it to comment on one part',
} as const;

export interface DocumentChatProps {
  readonly place:          DocumentPlace;
  readonly chat:           DocumentChatContent;
  readonly strip:          DocumentAgentStripModel;
  readonly proposalMode:   BoardProposalMode;
  readonly headNumber:     number | null;
  /** The document can no longer change: the chat is shown, the composer and the edits offer nothing. */
  readonly settled:        boolean;
  readonly onJumpToAnchor: (lines: BoardLineRangeDocument) => void;
  /** Opens the effect pane; `null` where the page offers no effect reading. */
  readonly onOpenEffect:   (() => void) | null;
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

function MessageCard({ item, onJumpToAnchor }: { readonly item: ChatMessageItem; readonly onJumpToAnchor: (lines: BoardLineRangeDocument) => void }) {
  const { placement } = item;
  const anchor = item.anchorLine === null
    ? null
    : (
      <>
        <span>
          <span className="board-document-mono">{item.anchorLine}</span>
          {item.orphaned ? <span className="board-document-note">{' · its text was deleted'}</span> : null}
        </span>
        {item.quote === null ? null : <span className="board-document-quote">{`“${item.quote}”`}</span>}
      </>
    );
  return (
    <div className="board-document-message">
      {anchor === null
        ? null
        : placement === null
          ? <div className="board-document-anchor" data-answering={item.answering ? '' : undefined}>{anchor}</div>
          : (
            <button
              type="button"
              className="board-document-anchor"
              data-answering={item.answering ? '' : undefined}
              aria-label={`Show ${item.anchorLine}`}
              onClick={() => onJumpToAnchor(placement)}
            >
              {anchor}
            </button>
          )}
      <div className="board-document-bubble">{item.text}</div>
    </div>
  );
}

function ChatItem({ item, props }: { readonly item: DocumentChatItem; readonly props: DocumentChatProps }) {
  switch (item.kind) {
    case 'message':
      return <MessageCard item={item} onJumpToAnchor={props.onJumpToAnchor} />;
    case 'board-note':
      return <p className="board-document-chat-note">{item.text}</p>;
    case 'agent-turn':
      return (
        <div className="board-document-agent-turn" data-working={item.working ? '' : undefined}>
          {item.prose.split(/\n{2,}/u).filter((paragraph) => paragraph.trim() !== '').map((paragraph, position) => <p key={position}>{paragraph}</p>)}
        </div>
      );
    case 'proposal':
      return <ProposalDiffCard place={props.place} proposal={item.proposal} settled={props.settled} />;
    case 'proposal-note':
      return <p className="board-document-chat-note">{item.text}</p>;
    case 'effect-card': {
      const { onOpenEffect } = props;
      const facts = `${item.placeCount} ${item.placeCount === 1 ? 'place' : 'places'} · ${item.unresolvedCount} unresolved`;
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
  const name = item.anchorLine?.split(' · ')[0] ?? 'the message';
  return (
    <div className="board-document-queued">
      <div className="board-document-queued-head">
        <span className="board-document-mono">{item.anchorLine ?? 'Message'}</span>
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
      <span className="board-document-quote">{`“${item.text}”`}</span>
      <span className="board-document-note">{answeringComment === null ? 'Sends when the agent finishes its turn.' : `Sends when the agent finishes C${answeringComment}.`}</span>
      {withdraw.refusal === null ? null : <span className="board-refusal" role="status">{withdraw.refusal}</span>}
    </div>
  );
}

function Composer({ props }: { readonly props: DocumentChatProps }) {
  const {
    place, chat, headNumber, settled, onOpenEffect
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
        placeholder={PLACEHOLDERS[place.document]}
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
          ? <span className="board-document-note">{headNumber === null ? '' : `Sees the whole ${place.document} at v${headNumber}`}</span>
          : <Button label="Show effect in repo" dense disabled={!effectRead.enabled} onPress={() => void effectRead.send()} />}
        <Button label={queues ? 'Queue ⌘↵' : 'Send ⌘↵'} emphasis={queues ? 'quiet' : 'primary'} dense disabled={!sender.enabled} onPress={() => void sender.send()} />
      </div>
    </form>
  );
}

export function DocumentChat(props: DocumentChatProps) {
  const {
    place, chat, strip, proposalMode, settled
  } = props;
  return (
    <aside className="board-document-agent" aria-label={strip.agentName}>
      <div className="board-document-agent-head">
        <span className="board-document-agent-dot" data-working={chat.working ? '' : undefined} aria-hidden="true" />
        <div className="board-document-agent-title">
          <span className="board-document-agent-name">{strip.agentName}</span>
          <span className="board-document-note">{strip.headLine}</span>
        </div>
        {settled ? null : chat.working ? <StopButton place={place} /> : <ModeSwitch place={place} mode={proposalMode} />}
      </div>
      <div className="board-document-chat" role="log" aria-label={`Chat with the ${strip.agentName.toLowerCase()}`}>
        {chat.items.map((item) => <ChatItem key={item.key} item={item} props={props} />)}
      </div>
      <DocumentAgentStrip document={place.document} strip={strip} />
      <Composer props={props} />
    </aside>
  );
}
