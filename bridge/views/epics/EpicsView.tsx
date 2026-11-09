/**
 * The Epics view, the static page's Epics tab: a grid of epic cards, each with its head (title, key, done mark), its summary, roll-up bar,
 * legend and facts, the Waits on, waves and Frees rows, and its tickets newest first. A ticket opens its ticket form in the detail panel
 * over this tab; an epic's link points the tab at that epic's card, which scrolls into view marked. The whole description, agent-written
 * HTML, shows only in its sandboxed frame, behind a disclosure.
 */
import {
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';

import type { EpicsBoardState }                           from '../../@types/EpicsBoardState.ts';
import { StateBadge }                                     from '../../chips/StateBadge.tsx';
import { TicketIdMark }                                   from '../../chips/TicketMarks.tsx';
import { DetailRoute }                                    from '../../shell/DetailRoute.ts';
import { useDetailRouting }                               from '../../shell/DetailRouting.ts';
import { useFinishedWorkWindow }                          from '../../shell/FinishedWorkWindow.ts';
import { HashRouter }                                     from '../../shell/HashRouter.ts';
import { EpicsModel, type EpicCard, type EpicWaveColumn } from './EpicsModel.ts';
import { SandboxedHtml }                                  from './SandboxedHtml.tsx';

export interface EpicsViewProps {
  readonly boardState:     EpicsBoardState;
  /** The epic the route points at, its card scrolled into view and marked; `null` for none. */
  readonly pointedEpicKey: string | null;
}

function epicHrefOf(epicKey: string): string {
  return HashRouter.fragmentOf({ tab: 'epics', item: DetailRoute.epicItemTextOf(epicKey) });
}

function EpicDescription({ card }: { readonly card: EpicCard }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <details className="bridge-epic-description" onToggle={(event) => setIsOpen(event.currentTarget.open)}>
      <summary className="bridge-epic-description-toggle">Full description</summary>
      {isOpen ? <SandboxedHtml html={card.descriptionHtml} title={`${card.title} description`} /> : null}
    </details>
  );
}

function EpicLinkRow({ label, emptyText, children }: { readonly label: string; readonly emptyText: string; readonly children: readonly ReactNode[] }) {
  return (
    <div className="bridge-epic-link-row">
      <span className="bridge-epic-link-label">{label}</span>
      {children.length === 0 ? <span className="bridge-epic-link-empty">{emptyText}</span> : children}
    </div>
  );
}

function EpicWaves({ waves }: { readonly waves: readonly EpicWaveColumn[] }) {
  const routing = useDetailRouting();
  return (
    <div className="bridge-epic-waves">
      {waves.length === 0
        ? <span className="bridge-epic-link-empty">No tickets under this epic</span>
        : waves.map((column) => (
          <div key={column.label} className="bridge-epic-wave" data-narrow={column.isNarrow ? '' : undefined} data-done={column.isDone ? '' : undefined}>
            <span className="bridge-epic-wave-name">{column.label}</span>
            {column.pills.map((pill) => {
              const item = { form: 'ticket', ticketId: pill.ticketId } as const;
              return (
                <a
                  key={pill.ticketId}
                  className="bridge-epic-wave-pill"
                  href={routing.openerHrefOf(item)}
                  data-state={pill.displayState}
                  data-live={pill.isLive ? '' : undefined}
                  data-done={column.isDone ? '' : undefined}
                  data-narrow={column.isNarrow ? '' : undefined}
                  data-selected={routing.isOpen(item) ? '' : undefined}
                  title={pill.title}
                >
                  <TicketIdMark ticketId={pill.ticketId} />
                  <span className="bridge-epic-wave-title">{pill.title}</span>
                </a>
              );
            })}
          </div>
        ))}
    </div>
  );
}

function EpicCardView({ card, isPointed }: { readonly card: EpicCard; readonly isPointed: boolean }) {
  const routing = useDetailRouting();
  const article = useRef<HTMLElement>(null);
  useEffect(() => {
    if (isPointed) article.current?.scrollIntoView?.({ block: 'nearest' });
  }, [isPointed]);
  return (
    <article
      ref={article}
      className="bridge-epic"
      data-epic-slot={String(card.slot)}
      data-live={card.isLive ? '' : undefined}
      data-selected={isPointed ? '' : undefined}
      aria-label={card.title}
    >
      <div className="bridge-epic-head">
        <a className="bridge-epic-title" href={epicHrefOf(card.key)}>
          <span className="bridge-epic-swatch" aria-hidden="true" />
          {card.title}
        </a>
        <span className="bridge-epic-key">{card.key}</span>
        <span className="bridge-epic-done">{card.doneText}</span>
      </div>
      <div className="bridge-epic-body">
        {card.summaryText === '' ? null : <p className="bridge-epic-summary">{card.summaryText}</p>}
        {card.saysMore ? <EpicDescription card={card} /> : null}
        <div>
          <div className="bridge-epic-progress" role="img" aria-label={card.rollupLabel}>
            {card.segments.map((segment) => (
              <span
                key={segment.state}
                className="bridge-epic-segment"
                data-state={segment.state}
                style={{ flexGrow: segment.count }}
                title={`${segment.label}: ${segment.count}`}
              />
            ))}
          </div>
          <ul className="bridge-epic-legend">
            {card.segments.map((segment) => (
              <li key={segment.state}>
                <span className="bridge-lane-dot" data-state={segment.state} />
                {`${segment.label} `}
                <b>{segment.count}</b>
              </li>
            ))}
          </ul>
        </div>
        <div className="bridge-epic-facts">
          {card.facts.map((fact) => (
            <div key={fact.label} className="bridge-epic-fact">
              <b>{fact.label}</b>
              <span title={fact.title ?? undefined}>{fact.value}</span>
            </div>
          ))}
        </div>
        <EpicLinkRow label="Waits on" emptyText="Nothing outside this epic">
          {card.waitsOn.map((chip) => (
            <a
              key={chip.ticketId}
              className="bridge-epic-link-chip"
              href={routing.openerHrefOf({ form: 'ticket', ticketId: chip.ticketId })}
              data-epic-slot={String(chip.epic.slot)}
              title={`#${chip.ticketId} ${chip.title}`}
            >
              <span className="bridge-epic-swatch" aria-hidden="true" />
              <TicketIdMark ticketId={chip.ticketId} />
              <span className="bridge-epic-link-epic">{chip.epic.title}</span>
            </a>
          ))}
        </EpicLinkRow>
        <EpicWaves waves={card.waves} />
        <EpicLinkRow label="Frees" emptyText="No other epic waits on this one">
          {card.frees.map((chip) => (
            <a
              key={chip.epic.key}
              className="bridge-epic-link-chip"
              href={epicHrefOf(chip.epic.key)}
              data-frees=""
              data-epic-slot={String(chip.epic.slot)}
              title={`${chip.epic.title} ${chip.viaText}`}
            >
              <span className="bridge-epic-swatch" aria-hidden="true" />
              <span>{chip.epic.title}</span>
              <span className="bridge-epic-link-via">{chip.viaText}</span>
            </a>
          ))}
        </EpicLinkRow>
        <ul className="bridge-epic-tickets">
          {card.tickets.map((ticket) => {
            const item = { form: 'ticket', ticketId: ticket.ticketId } as const;
            return (
              <li key={ticket.ticketId}>
                <a
                  className="bridge-epic-ticket"
                  href={routing.openerHrefOf(item)}
                  data-live={ticket.isLive ? '' : undefined}
                  data-selected={routing.isOpen(item) ? '' : undefined}
                >
                  <TicketIdMark ticketId={ticket.ticketId} />
                  <span className="bridge-epic-ticket-title">
                    {ticket.title}
                    {ticket.otherEpics.length === 0
                      ? null
                      : (
                        <span className="bridge-epic-also" title={`Also in ${ticket.otherEpics.map((epic) => epic.title).join(', ')}`}>
                          {'also in '}
                          {ticket.otherEpics.map((epic) => <span key={epic.key} className="bridge-epic-swatch" data-epic-slot={String(epic.slot)} aria-hidden="true" />)}
                        </span>
                      )}
                  </span>
                  <StateBadge state={ticket.stateToken} label={ticket.stateLabel} />
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}

export function EpicsView({ boardState, pointedEpicKey }: EpicsViewProps) {
  const finishedWorkWindow = useFinishedWorkWindow();
  const model = EpicsModel.epicsModelOf(boardState, finishedWorkWindow);
  return (
    <section className="bridge-epics" aria-label="Epics">
      {model.emptyText === null
        ? model.cards.map((card) => <EpicCardView key={card.key} card={card} isPointed={card.key === pointedEpicKey} />)
        : <div className="bridge-epics-empty">{model.emptyText}</div>}
    </section>
  );
}
