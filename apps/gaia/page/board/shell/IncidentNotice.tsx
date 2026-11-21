/**
 * The incident line above the header: one error banner however many defaults the Overseer applied, naming the newest, whose button opens
 * the incident drawer over the header. The drawer lists the open incidents and the applied defaults, each row unfolding its trail, one at a
 * time, the newest default unfolded first. Esc, which leaves no panel and no embedding page an Esc of its own, or a pointer down outside
 * closes it; Esc hands the focus back to the line's button. "Mark defaults seen" hides the line in this browser until the next default.
 */

import {
  useId,
  useRef,
  useState,
  type RefObject
} from 'react';
import {
  Banner,
  Button,
  KeyedLineList,
  MicroCapsLabel,
  MonoId,
  Pane,
  Stamp,
  StateBadge,
  TextButton,
  useDismissal
} from '../../lib/design-system/DesignSystemInterface.ts';

import { IncidentStepText, JobLink, TicketLinks } from '../conversation/ConversationParts.tsx';
import { StateToneUtil }                          from '../utils/StateToneUtil.ts';
import { useBoardHrefOf }                         from './BoardRouteLinks.ts';
import type {
  IncidentBannerModel,
  IncidentDrawerModel,
  IncidentMetaPart,
  IncidentNoticeModel,
  IncidentRowModel
} from './IncidentNoticeModel.ts';

export interface IncidentNoticeProps {
  readonly model:      IncidentNoticeModel;
  readonly onMarkSeen: () => void;
}

function NewestDefault({ newest }: { readonly newest: IncidentBannerModel['newest'] }) {
  return (
    <>
      {'Newest: '}
      <MonoId text={newest.incidentId} />
      {' took its default, '}
      <MonoId text={newest.move} />
      {newest.ticketIds.length === 0 ? null : <>{' on '}<TicketLinks ticketIds={newest.ticketIds} /></>}
      {newest.at === null ? null : <>{', at '}<Stamp shortText={newest.at.shortText} fullText={newest.at.fullText} element="time" /></>}
      .
    </>
  );
}

function MetaParts({ parts }: { readonly parts: readonly IncidentMetaPart[] }) {
  // A row's meta line is fixed words and ids; a part is known by its place.
  return parts.map((part, i) => (part.kind === 'text' ? <span key={i}>{part.text}</span> : <JobLink key={i} jobId={part.jobId} />));
}

interface IncidentRowProps {
  readonly row:      IncidentRowModel;
  readonly isOpen:   boolean;
  readonly onToggle: () => void;
}

function IncidentRow({ row, isOpen, onToggle }: IncidentRowProps) {
  const trailElementId = useId();
  return (
    <li className="board-incident-row" data-open={isOpen ? '' : undefined} data-unseen={row.unseen ? '' : undefined}>
      <button type="button" className="board-incident-row-toggle" aria-expanded={isOpen} aria-controls={trailElementId} onClick={onToggle}>
        <span className="board-incident-id">{row.incidentId}</span>
        <span className="board-incident-kind">{row.kind}</span>
      </button>
      <span className="board-incident-subject">
        <TicketLinks ticketIds={row.ticketIds} />
        {row.jobId === null ? null : <>{' '}<JobLink jobId={row.jobId} /></>}
        <span className="board-incident-meta">
          {row.ticketIds.length === 0 && row.jobId === null ? null : ' · '}
          <MetaParts parts={row.meta} />
        </span>
      </span>
      <span className="board-incident-pill"><StateBadge {...StateToneUtil.lookOf(row.pill.state)} label={row.pill.label} size="compact" /></span>
      {isOpen
        ? (
          <div className="board-incident-trail" id={trailElementId}>
            <KeyedLineList
              label={`Trail of ${row.incidentId}`}
              keyColumn="stamp"
              lines={row.trail.map((line) => ({
                key:  line.at?.shortText ?? '',
                text: <IncidentStepText step={line.step} />,
                ...(line.at === null ? {} : { keyTitle: line.at.fullText }),
                ...(line.alert ? { mark: 'alert' as const } : {}),
              }))}
            />
          </div>
        )
        : null}
    </li>
  );
}

interface IncidentGroupProps {
  readonly title:          string;
  readonly rows:           readonly IncidentRowModel[];
  readonly openIncidentId: string | null;
  readonly onToggle:       (incidentId: string) => void;
}

function IncidentGroup({
  title, rows, openIncidentId, onToggle
}: IncidentGroupProps) {
  if (rows.length === 0) return null;
  return (
    <>
      <div className="board-incident-group-title"><MicroCapsLabel element="h3" text={`${title} ${String(rows.length)}`} /></div>
      <ul className="board-incident-rows" aria-label={title}>
        {rows.map((row) => <IncidentRow key={row.incidentId} row={row} isOpen={row.incidentId === openIncidentId} onToggle={() => onToggle(row.incidentId)} />)}
      </ul>
    </>
  );
}

interface IncidentDrawerProps {
  readonly elementId:  string;
  readonly drawer:     IncidentDrawerModel;
  readonly onMarkSeen: () => void;
  readonly onLeave:    () => void;
}

function IncidentDrawer({
  elementId, drawer, onMarkSeen, onLeave
}: IncidentDrawerProps) {
  const [openIncidentId, setOpenIncidentId] = useState<string | null>(drawer.defaultedRows[0]?.incidentId ?? null);
  const toggle = (incidentId: string): void => setOpenIncidentId((shown) => (shown === incidentId ? null : incidentId));
  const hrefOf = useBoardHrefOf();
  return (
    // Every link in the drawer leaves for its own place, so the drawer closes behind it.
    <div className="board-incident-drawer" id={elementId} onClick={(event) => (event.target instanceof Element && event.target.closest('a') !== null ? onLeave() : undefined)}>
      <Pane
        label="Incidents"
        title="Incidents"
        countText={drawer.summaryText}
        body="flush"
        headEnd={(
          <>
            <TextButton label="Assistant view" href={hrefOf({ tab: 'assistant', item: null })} />
            <Button label="Mark defaults seen" onPress={onMarkSeen} />
          </>
        )}
      >
        <IncidentGroup title="Open" rows={drawer.openRows} openIncidentId={openIncidentId} onToggle={toggle} />
        <IncidentGroup title="Defaults applied" rows={drawer.defaultedRows} openIncidentId={openIncidentId} onToggle={toggle} />
      </Pane>
    </div>
  );
}

function useDrawerDismissal(isOpen: boolean, insideRef: RefObject<HTMLDivElement | null>, toggleRef: RefObject<HTMLButtonElement | null>, close: () => void): void {
  useDismissal({
    isOpen,
    insideRefs:  [insideRef],
    escapePhase: 'capture',
    onDismiss:   (reason) => {
      close();
      if (reason === 'escape') toggleRef.current?.focus();
    },
  });
}

export function IncidentNotice({ model, onMarkSeen }: IncidentNoticeProps) {
  const [drawerIsOpen, setDrawerIsOpen] = useState(false);
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const drawerElementId = useId();
  const close = (): void => setDrawerIsOpen(false);
  // A drawer whose line went away closes with it, so it neither takes an Esc unseen nor comes back open with the line.
  if (model.banner === null && drawerIsOpen) setDrawerIsOpen(false);
  useDrawerDismissal(drawerIsOpen && model.banner !== null, noticeRef, toggleRef, close);
  if (model.banner === null) return null;
  return (
    <div ref={noticeRef} className="board-incident-notice">
      <Banner
        tone="error"
        role="alert"
        lead={model.banner.leadText}
        text={<NewestDefault newest={model.banner.newest} />}
        action={(
          <Button
            label={drawerIsOpen ? 'Hide incidents' : 'Show incidents'}
            expanded={drawerIsOpen}
            controls={drawerElementId}
            buttonRef={toggleRef}
            onPress={() => setDrawerIsOpen((wasOpen) => !wasOpen)}
          />
        )}
      />
      {drawerIsOpen
        ? (
          <IncidentDrawer
            elementId={drawerElementId}
            drawer={model.drawer}
            onLeave={close}
            onMarkSeen={() => {
              close();
              onMarkSeen();
            }}
          />
        )
        : null}
    </div>
  );
}
