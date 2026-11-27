/**
 * The Waves tab: its title row, then `WavesModel`'s waves canvas and its legend. Pointing at a ticket lights its lineage, the ticket, everything
 * it depends on and everything waiting on it, with the edges between them, and dims the rest; leaving clears it after a short grace, so
 * crossing the gap to a neighbouring ticket switches the lineage without a frame in which nothing is lit. A ticket opens the row form of
 * the detail panel in place, over the Waves tab. A live node pulses only while the board's stream is live.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  PageHead,
  StateBadge,
  Text,
  View
} from '../../../lib/design-system/DesignSystemInterface.ts';

import type { BoardTabViewProps } from '../../@types/BoardTabViewProps.ts';
import type { ConnectionState }   from '../../api/BoardEventStreamClient.ts';
import { TicketIdMark }           from '../../chips/TicketMarks.tsx';
import { useDetailRouting }       from '../../shared/routing/DetailRouting.ts';
import { StateToneUtil }          from '../../utils/StateToneUtil.ts';
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
  readonly canvas:     WavesCanvasModel;
  /** Live nodes pulse only while this is `live`. */
  readonly connection: ConnectionState;
}

function NodeChip({ chip }: { readonly chip: DependencyNodeChip }) {
  if (chip.kind === 'ready') return <StateBadge {...StateToneUtil.readyLook()} label="Ready" size="compact" shrinkable />;
  if (chip.kind === 'held') return <span className="board-dependency-held" title={chip.title}>Held</span>;
  return <StateBadge {...StateToneUtil.lookOf(chip.displayState)} label={chip.label} size="compact" shrinkable />;
}

function NodeEpicLine({ epic }: { readonly epic: DependencyNodeEpic }) {
  return (
    <span className="board-dependency-node-epic" data-epic-slot={String(epic.slot)}>
      <span className="board-epic-swatch" aria-hidden="true" />
      <span className="board-dependency-node-epic-title">{epic.title}</span>
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
      className="board-dependency-head"
      data-narrow={column.isNarrow ? '' : undefined}
      data-done={column.isDone ? '' : undefined}
      style={{ left: column.left }}
    >
      <span className="board-dependency-head-name">{column.label}</span>
      <span className="board-dependency-head-count">{column.countText}</span>
      {column.isDone ? null : <ForecastLine forecastText={column.forecastText} />}
      {column.slotsFilled.length === 0
        ? null
        : (
          <span className="board-dependency-slots" role="img" aria-label={column.slotsLabel}>
            {column.slotsFilled.map((filled, slot) => <span key={slot} className="board-dependency-slot" data-filled={filled ? '' : undefined} />)}
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
      className="board-dependency-node"
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
      <span className="board-dependency-node-head">
        <TicketIdMark ticketId={node.ticketId} />
        {node.chips.map((chip) => <NodeChip key={chip.kind} chip={chip} />)}
        {node.heldCount === 0 ? null : <span className="board-dependency-wait" data-heavy={node.heldIsHeavy ? '' : undefined}>{`${node.heldCount} wait`}</span>}
      </span>
      <span className="board-dependency-node-title">{node.title}</span>
      {node.primaryEpic === null ? null : <NodeEpicLine epic={node.primaryEpic} />}
    </a>
  );
}

export function WavesView({ canvas, connection }: WavesViewProps) {
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
        <PageHead titleElement="h2" title="Waves" lead={WAVES_LEAD} />
        <section className="board-dependencies" aria-label="Dependencies"><p className="board-dependency-empty">{EMPTY_WAVES_TEXT}</p></section>
      </View>
    );
  }
  const edgeIsLit = (fromTicketId: string, toTicketId: string): boolean => litTicketIds !== null && litTicketIds.has(fromTicketId) && litTicketIds.has(toTicketId);

  return (
    <View gap="sixteen">
      <PageHead titleElement="h2" title="Waves" lead={WAVES_LEAD} />
      <section className="board-dependencies" aria-label="Dependencies">
        <div
          className="board-dependency-canvas"
          data-lineage-shown={litTicketIds === null ? undefined : ''}
          data-freshness={connection === 'live' ? 'live' : 'snapshot'}
          style={{ width: canvas.width, height: canvas.height }}
          onPointerLeave={clearAfterGrace}
          onPointerOver={(event) => {
            if (event.target instanceof Element && event.target.closest('a') === null) clearAfterGrace();
          }}
        >
          {canvas.columns.map((column) => (
            <div
              key={`band-${column.key}`}
              className="board-dependency-band"
              data-narrow={column.isNarrow ? '' : undefined}
              data-done={column.isDone ? '' : undefined}
              style={{
                left: column.bandLeft, top: column.bandTop, width: column.bandWidth, height: column.bandHeight
              }}
            />
          ))}
          <svg className="board-dependency-edges" width={canvas.width} height={canvas.height} viewBox={`0 0 ${canvas.width} ${canvas.height}`} aria-hidden="true">
            {canvas.edges.map((edge) => (
              <path
                key={`${edge.fromTicketId}>${edge.toTicketId}`}
                className="board-dependency-edge"
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
        <ul className="board-dependency-legend">
          <li><span className="board-dependency-legend-line" data-pace="" />sets the pace</li>
          <li><span className="board-dependency-legend-line" />waits on</li>
          <li><span className="board-dependency-legend-line" data-settled="" />built on (done)</li>
          <li><span className="board-dependency-slot" data-filled="" />{`slot in use (of ${canvas.boardSlots})`}</li>
          <li><span className="board-dependency-legend-band" />one ticket at a time</li>
        </ul>
      </section>
    </View>
  );
}

/** The Waves tab of the board: the canvas of the shown board, laid out once per board read; no view where no ticket waits on another. */
export function WavesTabView({ board, connection, services }: BoardTabViewProps) {
  const canvas = useMemo(() => WavesModel.wavesModelOf(board, services.now().getTime()), [board, services]);
  if (canvas === null) return null;
  return <WavesView canvas={canvas} connection={connection} />;
}
