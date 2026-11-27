/**
 * The Epics view: its title row over a grid of epic cards, each with its head (title, key, done mark), its summary, roll-up bar, legend
 * and facts, the Waits on, waves and Frees rows, and its tickets newest first. A ticket opens its ticket form in the detail panel over
 * this tab; an epic's link points the tab at that epic's card, which scrolls into view marked. The whole description, agent-written
 * HTML, shows only in its sandboxed frame, behind a disclosure. Its live work pulses only while the board's stream is live. The view is the
 * epics habitat of Flint.
 */
import {
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { SegmentMeter, StateBadge, StateDot } from '../../../lib/design-system/DesignSystemInterface.ts';

import type { ConnectionState }  from '../../api/BoardEventStreamClient.ts';
import { TicketIdMark }          from '../../chips/TicketMarks.tsx';
import { useHabitatCues }        from '../../flint/UseHabitatHappenings.ts';
import { SandboxedHtmlFrame }    from '../../sandboxed-html/SandboxedHtmlFrame.tsx';
import { useFinishedWorkWindow } from '../../shared/FinishedWorkWindow.ts';
import { useBoardHrefOf }        from '../../shared/routing/BoardRouteLinks.ts';
import { DetailRoute }           from '../../shared/routing/DetailRoute.ts';
import { useDetailRouting }      from '../../shared/routing/DetailRouting.ts';
import { StateToneUtil }         from '../../utils/StateToneUtil.ts';
import { ViewTitle }             from '../ViewTitle.tsx';
import {
  EpicsModel,
  type EpicCard,
  type EpicsBoardDocument,
  type EpicWaveColumn
} from './EpicsModel.ts';
import { EPICS_SPRITE_HABITAT } from './EpicsSpriteHabitat.ts';
import { EpicsSpriteModel }     from './EpicsSpriteModel.ts';

export interface EpicsViewProps {
  readonly board:          EpicsBoardDocument;
  /** The epic the route points at, its card scrolled into view and marked; `null` for none. */
  readonly pointedEpicKey: string | null;
  /** Live work pulses only while the board's stream is live. */
  readonly connection:     ConnectionState;
}

function useEpicHrefOf(): (epicKey: string) => string {
  const hrefOf = useBoardHrefOf();
  return (epicKey) => hrefOf({ tab: 'epics', item: DetailRoute.epicItemTextOf(epicKey) });
}

function EpicDescription({ card }: { readonly card: EpicCard }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <details className="board-epic-description" onToggle={(event) => setIsOpen(event.currentTarget.open)}>
      <summary className="board-epic-description-toggle">Full description</summary>
      {isOpen ? <SandboxedHtmlFrame title={`${card.title} description`} html={card.descriptionHtml} placement="epic-description" /> : null}
    </details>
  );
}

function EpicLinkRow({ label, emptyText, children }: { readonly label: string; readonly emptyText: string; readonly children: readonly ReactNode[] }) {
  return (
    <div className="board-epic-link-row">
      <span className="board-epic-link-label">{label}</span>
      {children.length === 0 ? <span className="board-epic-link-empty">{emptyText}</span> : children}
    </div>
  );
}

function EpicWaves({ waves }: { readonly waves: readonly EpicWaveColumn[] }) {
  const routing = useDetailRouting();
  return (
    <div className="board-epic-waves">
      {waves.length === 0
        ? <span className="board-epic-link-empty">No tickets under this epic</span>
        : waves.map((column) => (
          <div key={column.label} className="board-epic-wave" data-narrow={column.isNarrow ? '' : undefined} data-done={column.isDone ? '' : undefined}>
            <span className="board-epic-wave-head">
              <span className="board-epic-wave-name">{column.label}</span>
              {column.isNarrow ? <span className="board-epic-wave-note">one at a time</span> : null}
            </span>
            {column.pills.map((pill) => {
              const item = { form: 'ticket', ticketId: pill.ticketId } as const;
              return (
                <a
                  key={pill.ticketId}
                  className="board-epic-wave-pill"
                  href={routing.openerHrefOf(item)}
                  data-state={pill.displayState}
                  data-state-tone={StateToneUtil.toneOf(pill.displayState)}
                  data-live={pill.isLive ? '' : undefined}
                  data-done={column.isDone ? '' : undefined}
                  data-selected={routing.isOpen(item) ? '' : undefined}
                  title={pill.title}
                >
                  <TicketIdMark ticketId={pill.ticketId} compact />
                  <span className="board-epic-wave-title">{pill.title}</span>
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
  const epicHrefOf = useEpicHrefOf();
  const article = useRef<HTMLElement>(null);
  useEffect(() => {
    if (isPointed) article.current?.scrollIntoView?.({ block: 'nearest' });
  }, [isPointed]);
  return (
    <article
      ref={article}
      className="board-epic"
      data-epic-slot={String(card.slot)}
      data-live={card.isLive ? '' : undefined}
      data-selected={isPointed ? '' : undefined}
      aria-label={card.title}
    >
      <div className="board-epic-head">
        <a className="board-epic-title" href={epicHrefOf(card.key)}>
          <span className="board-epic-swatch" aria-hidden="true" />
          {card.title}
        </a>
        <span className="board-epic-key">{card.key}</span>
        <span className="board-epic-done">{card.doneText}</span>
      </div>
      <div className="board-epic-body">
        {card.summaryText === '' ? null : <p className="board-epic-summary">{card.summaryText}</p>}
        {card.saysMore ? <EpicDescription card={card} /> : null}
        <div>
          <SegmentMeter label={card.rollupLabel} segments={card.segments} />
          <ul className="board-epic-legend">
            {card.segments.map((segment) => (
              <li key={segment.state}>
                <StateDot {...StateToneUtil.dotOf(segment.state)} />
                {`${segment.label} `}
                <b>{segment.count}</b>
              </li>
            ))}
          </ul>
        </div>
        <div className="board-epic-facts">
          {card.facts.map((fact) => (
            <div key={fact.label} className="board-epic-fact">
              <b>{fact.label}</b>
              <span title={fact.title ?? undefined}>{fact.value}</span>
            </div>
          ))}
        </div>
        <EpicLinkRow label="Waits on" emptyText="Nothing outside this epic">
          {card.waitsOn.map((chip) => (
            <a
              key={chip.ticketId}
              className="board-epic-link-chip"
              href={routing.openerHrefOf({ form: 'ticket', ticketId: chip.ticketId })}
              data-epic-slot={String(chip.epic.slot)}
              title={`#${chip.ticketId} ${chip.title}`}
            >
              <span className="board-epic-swatch" aria-hidden="true" />
              <TicketIdMark ticketId={chip.ticketId} tone="strong" />
              <span className="board-epic-link-epic">{chip.epic.title}</span>
            </a>
          ))}
        </EpicLinkRow>
        <EpicWaves waves={card.waves} />
        <EpicLinkRow label="Frees" emptyText="No other epic waits on this one">
          {card.frees.map((chip) => (
            <a
              key={chip.epic.key}
              className="board-epic-link-chip"
              href={epicHrefOf(chip.epic.key)}
              data-frees=""
              data-epic-slot={String(chip.epic.slot)}
              title={`${chip.epic.title} ${chip.viaText}`}
            >
              <span className="board-epic-swatch" aria-hidden="true" />
              <span>{chip.epic.title}</span>
              <span className="board-epic-link-via">{chip.viaText}</span>
            </a>
          ))}
        </EpicLinkRow>
        <ul className="board-epic-tickets">
          {card.tickets.map((ticket) => {
            const item = { form: 'ticket', ticketId: ticket.ticketId } as const;
            return (
              <li key={ticket.ticketId}>
                <a
                  className="board-epic-ticket"
                  href={routing.openerHrefOf(item)}
                  data-state={ticket.stateToken}
                  data-state-tone={StateToneUtil.toneOf(ticket.stateToken)}
                  data-live={ticket.isLive ? '' : undefined}
                  data-selected={routing.isOpen(item) ? '' : undefined}
                >
                  <TicketIdMark ticketId={ticket.ticketId} />
                  <span className="board-epic-ticket-title">
                    {ticket.title}
                    {ticket.otherEpics.length === 0
                      ? null
                      : (
                        <span className="board-epic-also" title={`Also in ${ticket.otherEpics.map((epic) => epic.title).join(', ')}`}>
                          {'also in '}
                          {ticket.otherEpics.map((epic) => <span key={epic.key} className="board-epic-swatch" data-epic-slot={String(epic.slot)} aria-hidden="true" />)}
                        </span>
                      )}
                  </span>
                  <span className="board-epic-ticket-badge">
                    <StateBadge {...StateToneUtil.lookOf(ticket.stateToken)} label={ticket.stateLabel} fitted />
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}

export function EpicsView({ board, pointedEpicKey, connection }: EpicsViewProps) {
  const finishedWorkWindow = useFinishedWorkWindow();
  const model = EpicsModel.epicsModelOf(board, finishedWorkWindow);
  const viewElement = useRef<HTMLElement>(null);
  useHabitatCues(viewElement, EPICS_SPRITE_HABITAT, board.page.tickets, EpicsSpriteModel.cuesBetween);
  return (
    <section
      className="board-epics"
      aria-label="Epics"
      ref={viewElement}
      data-flint-workplace=""
      data-freshness={connection === 'live' ? 'live' : 'snapshot'}
    >
      <ViewTitle title="Epics" lead="Each epic's progress, rolled up from its tickets. A ticket counts under its first epic. Open epics come first." />
      <div className="board-epic-grid">
        {model.emptyText === null
          ? model.cards.map((card) => <EpicCardView key={card.key} card={card} isPointed={card.key === pointedEpicKey} />)
          : <div className="board-epics-empty">{model.emptyText}</div>}
      </div>
    </section>
  );
}
