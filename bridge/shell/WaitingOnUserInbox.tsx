/**
 * The Waiting on User popover's body: its head with the count and the order, the escalated rows, then the others by age, each row one
 * thing that waits with its age and the one action that opens its place; a foot linking to Questions and to the drafts on the Kanban,
 * with the notification allowance while it is unasked. The ages tick each second from the injected clock while the stream is live.
 */
import {
  useEffect,
  useRef,
  type MouseEvent,
  type ReactNode
} from 'react';

import { AskItem, type AskAge }                                           from '../conversation/AskItem.tsx';
import { JobLink }                                                        from '../conversation/ConversationParts.tsx';
import { Button }                                                         from '../design-system/Button.tsx';
import { SectionHead }                                                    from '../design-system/ListSection.tsx';
import { MicroCapsLabel }                                                 from '../design-system/MicroCapsLabel.tsx';
import { IdLink }                                                         from '../design-system/MonoId.tsx';
import { Stamp }                                                          from '../design-system/Stamp.tsx';
import { ElapsedTimeUtil }                                                from '../utils/ElapsedTimeUtil.ts';
import { TimeUtil, type TimestampSlices }                                 from '../utils/TimeUtil.ts';
import { NotificationAllowanceControl }                                   from '../views/questions/NotificationAllowanceControl.tsx';
import type { QuestionNotifier }                                          from '../views/questions/QuestionAlerts.ts';
import { useTickingNow, type BridgeClock }                                from './BridgeClock.ts';
import { DetailRoute }                                                    from './DetailRoute.ts';
import { HashRouter }                                                     from './HashRouter.ts';
import type { HeaderFigureLane }                                          from './HeaderModel.ts';
import { ATTENTION_KIND_WORDING, type AttentionItem, type WaitingOnUser } from './WaitingOnUserModel.ts';

export interface WaitingOnUserInboxProps {
  readonly waiting:         WaitingOnUser;
  readonly clock:           BridgeClock;
  readonly isLive:          boolean;
  /** `null` on a board that serves no page: the ages still show, with the stamps as written. */
  readonly timestampSlices: TimestampSlices | null;
  readonly notifier:        QuestionNotifier;
  readonly onShowLane:      ((lane: HeaderFigureLane) => void) | undefined;
  /** A link in the popover was followed. */
  readonly onNavigate:      () => void;
}

const ORDER_TEXT = 'escalated first, then oldest first';

const EMPTY_TEXT = 'Nothing waits on User.';

function TicketIdLinks({ ticketIds }: { readonly ticketIds: readonly string[] }): ReactNode {
  return ticketIds.map((ticketId, position) => (
    <span key={ticketId}>
      {position === 0 ? null : ' '}
      <IdLink text={`#${ticketId}`} href={HashRouter.fragmentOf({ tab: 'kanban', item: DetailRoute.itemTextOf({ form: 'ticket', ticketId }) })} />
    </span>
  ));
}

function decisionMetaOf(item: AttentionItem): ReactNode[] {
  const escalation = item.kind === 'escalated-question'
    ? (
      <>
        escalated by the Assistant
        {item.escalatedFromIncidentId === null
          ? null
          : (
            <>
              {' from '}
              <IdLink text={item.escalatedFromIncidentId} href={HashRouter.fragmentOf({ tab: 'assistant', item: null })} />
            </>
          )}
      </>
    )
    : null;
  return [
    item.decisionKind,
    item.askedBy === null ? null : `asked by ${item.askedBy}`,
    item.jobId === null
      ? 'no job'
      : (
        <>
          {'job '}
          <JobLink jobId={item.jobId} />
        </>
      ),
    escalation,
  ];
}

function metaOf(item: AttentionItem, todayCalendarDate: string, slices: TimestampSlices | null): ReactNode[] {
  if (item.kind === 'question' || item.kind === 'escalated-question') return decisionMetaOf(item);
  const filedStamp = item.kind === 'draft-ticket' && slices !== null && item.stamp !== ''
    ? (
      <>
        {'filed '}
        <Stamp shortText={TimeUtil.shortStampText(item.stamp, todayCalendarDate, slices)} fullText={TimeUtil.fullStampText(item.stamp, slices)} />
      </>
    )
    : null;
  return [item.metaText, filedStamp];
}

function ageOf(item: AttentionItem, now: Date, slices: TimestampSlices | null): AskAge | null {
  const shortText = ElapsedTimeUtil.ageSinceText(item.stamp, now);
  if (shortText === null) return null;
  return { shortText, fullText: `${item.stampWord} ${slices === null ? item.stamp : TimeUtil.fullStampText(item.stamp, slices)}` };
}

interface AttentionRowProps {
  readonly item:   AttentionItem;
  readonly now:    Date;
  readonly slices: TimestampSlices | null;
}

function AttentionRow({ item, now, slices }: AttentionRowProps) {
  const escalated = item.kind === 'escalated-question';
  const wording = ATTENTION_KIND_WORDING[item.kind];
  return (
    <AskItem
      layout="row"
      kind={escalated ? { text: wording.text, tone: 'error' } : { text: wording.text, tone: 'state', state: wording.state }}
      decisionId={item.idText}
      {...(item.ticketIds.length === 0 ? {} : { subject: <TicketIdLinks ticketIds={item.ticketIds} /> })}
      questionText={item.subject}
      meta={metaOf(item, TimeUtil.calendarDateOf(now.getTime()), slices)}
      age={ageOf(item, now, slices)}
      action={<Button label={item.action.label} href={item.action.href} emphasis={item.action.primary ? 'primary' : 'quiet'} />}
      escalated={escalated}
    />
  );
}

function AttentionGroup({
  title, items, now, slices
}: { readonly title: string; readonly items: readonly AttentionItem[]; readonly now: Date; readonly slices: TimestampSlices | null }) {
  if (items.length === 0) return null;
  return (
    <>
      <MicroCapsLabel text={title} element="h3" />
      <ul className="bridge-attention-list" aria-label={title}>
        {items.map((item) => <AttentionRow key={item.key} item={item} now={now} slices={slices} />)}
      </ul>
    </>
  );
}

export function WaitingOnUserInbox({
  waiting, clock, isLive, timestampSlices, notifier, onShowLane, onNavigate
}: WaitingOnUserInboxProps) {
  const now = useTickingNow(clock, isLive && waiting.total > 0);
  const inboxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const inbox = inboxRef.current;
    const firstAction = inbox?.querySelector<HTMLElement>('.bridge-ask-side a') ?? inbox?.querySelector<HTMLElement>('a, button');
    firstAction?.focus();
  }, []);
  const navigateOnLink = (event: MouseEvent<HTMLDivElement>): void => {
    if (event.target instanceof Element && event.target.closest('a') !== null) onNavigate();
  };
  return (
    <div ref={inboxRef} className="bridge-attention-inbox" onClick={navigateOnLink}>
      <SectionHead title="Waiting on User" count={waiting.total}>
        <span className="bridge-attention-inbox-order">{ORDER_TEXT}</span>
      </SectionHead>
      {waiting.total === 0
        ? <p className="bridge-attention-empty">{EMPTY_TEXT}</p>
        : (
          <>
            <AttentionGroup title="Escalated" items={waiting.escalated} now={now} slices={timestampSlices} />
            <AttentionGroup title="By age" items={waiting.byAge} now={now} slices={timestampSlices} />
          </>
        )}
      <div className="bridge-attention-foot">
        <a href={HashRouter.fragmentOf({ tab: 'questions', item: null })}>All questions</a>
        <a href={HashRouter.fragmentOf({ tab: 'kanban', item: null })} onClick={() => onShowLane?.('ready')}>Drafts on Kanban</a>
        <NotificationAllowanceControl notifier={notifier} />
      </div>
    </div>
  );
}
