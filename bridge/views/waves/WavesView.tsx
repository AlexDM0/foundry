/**
 * The Waves tab: its title row, then `WavesModel`'s waves canvas and its legend. Pointing at a ticket lights its lineage, the ticket, everything
 * it depends on and everything waiting on it, with the edges between them, and dims the rest; leaving clears it after a short grace, so
 * crossing the gap to a neighbouring ticket switches the lineage without a frame in which nothing is lit. A ticket opens the row form of
 * the detail panel in place, over the Waves tab.
 */

import { StateBadge }                  from 'design-system/StateBadge';
import { Text }                        from 'design-system/Text';
import { View }                        from 'design-system/View';
import { useEffect, useRef, useState } from 'react';

import { TicketIdMark }     from '../../chips/TicketMarks.tsx';
import { useDetailRouting } from '../../shell/DetailRouting.ts';
import { StateToneUtil }    from '../../utils/StateToneUtil.ts';
import { ViewTitle }        from '../ViewTitle.tsx';
import type {
  DependencyColumnModel,
  DependencyNodeChip,
  DependencyNodeEpic,
  DependencyNodeModel,
  WavesCanvasModel
} from './WavesModel.ts';

import { EMPTY_WAVES_TEXT, NO_FORECAST_TEXT, WavesModel } from './WavesModel.ts';

const LINEAGE_CLEAR_GRACE_MILLISECONDS = 120;

export interface WavesViewProps {
  readonly canvas: WavesCanvasModel;
}

function NodeChip({ chip }: { readonly chip: DependencyNodeChip }) {
  if (chip.kind === 'ready') return <StateBadge {...StateToneUtil.readyLook()} label="Ready" size="compact" shrinkable />;
  if (chip.kind === 'held') return <span className="bridge-kanban-held" title={chip.title}>Held</span>;
  return <StateBadge {...StateToneUtil.lookOf(chip.displayState)} label={chip.label} size="compact" shrinkable />;
}

function NodeEpicLine({ epic }: { readonly epic: DependencyNodeEpic }) {
  return (
    <span className="bridge-dependency-node-epic" data-epic-slot={String(epic.slot)}>
      <span className="bridge-epic-swatch" aria-hidden="true" />
      <span className="bridge-dependency-node-epic-title">{epic.title}</span>
    </span>
  );
}

/** An open wave's forecast, or that it has none; the Done column has no forecast line. */
function ForecastLine({ forecastText }: { readonly forecastText: string | null }) {
  if (forecastText === null) return <Text typeRole="small" subtle>{NO_FORECAST_TEXT}</Text>;
  return <Text typeRole="small" mono bold>{forecastText}</Text>;
}

function ColumnHead({ column }: { readonly column: DependencyColumnModel }) {
  return (
    <div
      className="bridge-dependency-head"
      data-narrow={column.isNarrow ? '' : undefined}
      data-done={column.isDone ? '' : undefined}
      style={{ left: column.left }}
    >
      <span className="bridge-dependency-head-name">{column.label}</span>
      <span className="bridge-dependency-head-count">{column.countText}</span>
      {column.isDone ? null : <ForecastLine forecastText={column.forecastText} />}
      {column.slotsFilled.length === 0
        ? null
        : (
          <span className="bridge-dependency-slots" role="img" aria-label={column.slotsLabel}>
            {column.slotsFilled.map((filled, slot) => <span key={slot} className="bridge-dependency-slot" data-filled={filled ? '' : undefined} />)}
          </span>
        )}
    </div>
  );
}

const WAVES_LEAD = 'Tickets that can run side by side, wave by wave. Point at a ticket to light what it depends on and what waits on it.';

function DependencyNode({ node, isLit, onPoint }: { readonly node: DependencyNodeModel; readonly isLit: boolean; readonly onPoint: (ticketId: string) => void }) {
  const routing = useDetailRouting();
  return (
    <a
      className="bridge-dependency-node"
      href={routing.openerHrefOf({ form: 'ticket-row', ticketId: node.ticketId })}
      aria-label={`${node.idLabel} ${node.title}`}
      data-ticket-id={node.ticketId}
      data-state={node.displayState}
      data-state-tone={StateToneUtil.toneOf(node.displayState)}
      data-done={node.isDone ? '' : undefined}
      data-in-review={node.isInReview ? '' : undefined}
      data-live={node.isLive ? '' : undefined}
      data-lit={isLit ? '' : undefined}
      style={{ left: node.left, top: node.top }}
      onPointerEnter={() => onPoint(node.ticketId)}
    >
      <span className="bridge-dependency-node-head">
        <TicketIdMark ticketId={node.ticketId} />
        {node.chips.map((chip) => <NodeChip key={chip.kind} chip={chip} />)}
        {node.heldCount === 0 ? null : <span className="bridge-dependency-wait" data-heavy={node.heldIsHeavy ? '' : undefined}>{`${node.heldCount} wait`}</span>}
      </span>
      <span className="bridge-dependency-node-title">{node.title}</span>
      {node.primaryEpic === null ? null : <NodeEpicLine epic={node.primaryEpic} />}
    </a>
  );
}

export function WavesView({ canvas }: WavesViewProps) {
  const [litTicketIds, setLitTicketIds] = useState<ReadonlySet<string> | null>(null);
  const pendingClear = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingClear = (): void => {
    if (pendingClear.current === null) return;
    clearTimeout(pendingClear.current);
    pendingClear.current = null;
  };
  useEffect(() => cancelPendingClear, []);

  const showLineage = (ticketId: string): void => {
    cancelPendingClear();
    setLitTicketIds(WavesModel.lineageOf(canvas.graph, ticketId));
  };
  /** Keeps the first deadline, so wandering over empty canvas never stretches the grace. */
  const clearAfterGrace = (): void => {
    if (pendingClear.current !== null) return;
    pendingClear.current = setTimeout(() => {
      pendingClear.current = null;
      setLitTicketIds(null);
    }, LINEAGE_CLEAR_GRACE_MILLISECONDS);
  };

  if (canvas.columns.length === 0) {
    return (
      <View gap="sixteen">
        <ViewTitle title="Waves" lead={WAVES_LEAD} />
        <section className="bridge-dependencies" aria-label="Dependencies"><p className="bridge-dependency-empty">{EMPTY_WAVES_TEXT}</p></section>
      </View>
    );
  }
  const edgeIsLit = (fromTicketId: string, toTicketId: string): boolean => litTicketIds !== null && litTicketIds.has(fromTicketId) && litTicketIds.has(toTicketId);

  return (
    <View gap="sixteen">
      <ViewTitle title="Waves" lead={WAVES_LEAD} />
      <section className="bridge-dependencies" aria-label="Dependencies">
        <div
          className="bridge-dependency-canvas"
          data-lineage-shown={litTicketIds === null ? undefined : ''}
          style={{ width: canvas.width, height: canvas.height }}
          onPointerLeave={clearAfterGrace}
          onPointerOver={(event) => {
            if (event.target instanceof Element && event.target.closest('a') === null) clearAfterGrace();
          }}
        >
          {canvas.columns.map((column) => (
            <div
              key={`band-${column.key}`}
              className="bridge-dependency-band"
              data-narrow={column.isNarrow ? '' : undefined}
              data-done={column.isDone ? '' : undefined}
              style={{
                left: column.bandLeft, top: column.bandTop, width: column.bandWidth, height: column.bandHeight
              }}
            />
          ))}
          <svg className="bridge-dependency-edges" width={canvas.width} height={canvas.height} viewBox={`0 0 ${canvas.width} ${canvas.height}`} aria-hidden="true">
            {canvas.edges.map((edge) => (
              <path
                key={`${edge.fromTicketId}>${edge.toTicketId}`}
                className="bridge-dependency-edge"
                data-from={edge.fromTicketId}
                data-to={edge.toTicketId}
                data-pace={edge.isPace ? '' : undefined}
                data-settled={edge.isSettled ? '' : undefined}
                data-lit={edgeIsLit(edge.fromTicketId, edge.toTicketId) ? '' : undefined}
                d={edge.path}
              />
            ))}
          </svg>
          {canvas.columns.map((column) => <ColumnHead key={`head-${column.key}`} column={column} />)}
          {canvas.nodes.map((node) => <DependencyNode key={node.ticketId} node={node} isLit={litTicketIds?.has(node.ticketId) === true} onPoint={showLineage} />)}
        </div>
        <ul className="bridge-dependency-legend">
          <li><span className="bridge-dependency-legend-line" data-pace="" />sets the pace</li>
          <li><span className="bridge-dependency-legend-line" />waits on</li>
          <li><span className="bridge-dependency-legend-line" data-settled="" />built on (done)</li>
          <li><span className="bridge-dependency-slot" data-filled="" />{`slot in use (of ${canvas.boardSlots})`}</li>
          <li><span className="bridge-dependency-legend-band" />one ticket at a time</li>
        </ul>
      </section>
    </View>
  );
}
