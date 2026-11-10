/**
 * The Intake view: New request starts a product-owner session (`intake-start`); each session shows its transcript, its questions inline,
 * the drafts it filed, a chat box for follow-ups (`job-message`) and Close intake (`intake-close`), which submits the
 * drafts it filed. A closed session keeps its transcript and chat, marked closed: a message resumes it.
 */
import { useState } from 'react';

import type { ConversationBoardDocument, TicketDocument }        from '../../@types/ConversationDocuments.ts';
import { ChatBox }                                               from '../../conversation/ChatBox.tsx';
import { CardHead }                                              from '../../conversation/ConversationParts.tsx';
import { DecisionCard }                                          from '../../conversation/DecisionCard.tsx';
import { TranscriptLog, useTranscript, type TranscriptFollower } from '../../conversation/TranscriptLog.tsx';
import { ListSection, SectionHead }                              from '../../design-system/ListSection.tsx';
import { MonoId }                                                from '../../design-system/MonoId.tsx';
import { StateBadge }                                            from '../../design-system/StateBadge.tsx';
import { CommandButton }                                         from '../../shell/CommandButton.tsx';
import { DetailRoute }                                           from '../../shell/DetailRoute.ts';
import { HashRouter }                                            from '../../shell/HashRouter.ts';
import { IntakeModelUtil, type IntakeSession }                   from './IntakeModel.ts';

export interface IntakeViewProps {
  readonly board:            ConversationBoardDocument;
  readonly followTranscript: TranscriptFollower;
}

function NewRequestForm() {
  const [text, setText] = useState('');
  return (
    <div className="bridge-form">
      <textarea className="bridge-textarea" aria-label="New request" placeholder="New request" value={text} onChange={(event) => setText(event.target.value)} />
      <CommandButton label="New request" command={text.trim() === '' ? null : { kind: 'intake-start', text: text.trim() }} onApplied={() => setText('')} />
    </div>
  );
}

function DraftItem({ ticket }: { readonly ticket: TicketDocument }) {
  const pill = IntakeModelUtil.draftPillOf(ticket);
  return (
    <li className="bridge-intake-draft">
      <a
        className="bridge-intake-draft-link"
        href={HashRouter.fragmentOf({ tab: 'kanban', item: DetailRoute.itemTextOf({ form: 'ticket', ticketId: ticket.id }) })}
      >
        <MonoId text={`#${ticket.id}`} />
        <span className="bridge-intake-draft-title">{ticket.title}</span>
      </a>
      <StateBadge state={pill.state} label={pill.label} />
    </li>
  );
}

function IntakeSessionItem({ session, followTranscript }: { readonly session: IntakeSession; readonly followTranscript: TranscriptFollower }) {
  const entries = useTranscript(session.jobId, followTranscript);
  return (
    <li className="bridge-card" data-state={session.closed ? 'closed' : 'open'} aria-label={`Intake ${session.jobId}`}>
      <CardHead id={session.jobId} pill={IntakeModelUtil.sessionPillOf(session)} />
      {session.closed ? <p className="bridge-card-meta">a message resumes it</p> : null}
      {session.requestText === null ? null : <p className="bridge-note">{session.requestText}</p>}
      {session.questions.length === 0
        ? null
        : (
          <ul className="bridge-list" aria-label={`Questions of ${session.jobId}`}>
            {session.questions.map((decision) => <DecisionCard key={decision.id} decision={decision} escalated={false} />)}
          </ul>
        )}
      {session.drafts.length === 0
        ? null
        : (
          <ul className="bridge-intake-drafts" aria-label={`Drafts of ${session.jobId}`}>
            {session.drafts.map((ticket) => <DraftItem key={ticket.id} ticket={ticket} />)}
          </ul>
        )}
      <TranscriptLog label={`Transcript of ${session.jobId}`} entries={entries} />
      <ChatBox label={`Message ${session.jobId}`} jobId={session.jobId} />
      {session.closed
        ? null
        : (
          <div className="bridge-card-actions">
            <CommandButton label="Close intake" command={{ kind: 'intake-close', jobId: session.jobId, proposedDraftSets: [] }} />
          </div>
        )}
    </li>
  );
}

export function IntakeView({ board, followTranscript }: IntakeViewProps) {
  const sessions = IntakeModelUtil.intakeSessionsOf(board);
  return (
    <div className="bridge-view">
      <section className="bridge-section" aria-label="New request">
        <SectionHead title="New request" />
        <NewRequestForm />
      </section>
      <ListSection
        label="Product-owner sessions"
        title="Sessions"
        count={sessions.length}
        emptyText="No intake session yet."
        items={sessions}
        keyOf={(session) => session.jobId}
        renderItem={(session) => <IntakeSessionItem session={session} followTranscript={followTranscript} />}
      />
    </div>
  );
}
