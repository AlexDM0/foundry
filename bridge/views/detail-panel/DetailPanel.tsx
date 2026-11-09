/**
 * The detail panel of one ticket: the head, the facts, the phases its own row recorded, the controls its status offers, the body in its
 * sandboxed frame and the log lines claimed for it. Each control posts its `ControlCommand` and shows the Overseer's refusal verbatim.
 */
import { useState } from 'react';

import type { TicketsBoardState }      from '../../@types/TicketsBoardState.ts';
import { EpicChips }                   from '../../chips/EpicChips.tsx';
import { SandboxedHtmlFrame }          from '../../sandboxed-html/SandboxedHtmlFrame.tsx';
import { CommandButton }               from '../../shell/CommandButton.tsx';
import { DetailRoute, type DetailTab } from '../../shell/DetailRoute.ts';
import { HashRouter }                  from '../../shell/HashRouter.ts';
import {
  DetailPanelModel,
  NO_LOG_LINES_TEXT,
  type DetailControlsModel,
  type DetailFactModel,
  type MergeWaitModel,
  type StampModel
} from './DetailPanelModel.ts';

export interface DetailPanelProps {
  readonly boardState:        TicketsBoardState;
  readonly ticketId:          string;
  readonly todayCalendarDate: string;
  /** The tab the panel was opened from, which closing returns to. */
  readonly tab:               DetailTab;
}

function Stamp({ stamp, element = 'span' }: { readonly stamp: StampModel; readonly element?: 'span' | 'time' }) {
  return element === 'time'
    ? <time title={stamp.fullText}>{stamp.shortText}</time>
    : <span title={stamp.fullText}>{stamp.shortText}</span>;
}

function FactValue({ fact, tab }: { readonly fact: DetailFactModel; readonly tab: DetailTab }) {
  switch (fact.kind) {
    case 'stamp':
      return <Stamp stamp={fact.stamp} />;
    case 'tickets':
      return (
        <span>
          {fact.ticketIds.map((ticketId) => (
            <a key={ticketId} className="bridge-link" href={HashRouter.fragmentOf({ tab, item: DetailRoute.itemTextOf({ form: 'ticket-row', ticketId }) })}>{`#${ticketId}`}</a>
          ))}
        </span>
      );
    case 'epics':
      return (
        <EpicChips epics={fact.epics} />
      );
    default:
      return <span>{fact.text}</span>;
  }
}

/** Accept never sends while the prediction is not clean; Update branch sends whenever the ticket waits. */
function MergeWaitControls({ ticketId, mergeWait }: { readonly ticketId: string; readonly mergeWait: MergeWaitModel }) {
  return (
    <div className="bridge-detail-controls" role="group" aria-label="Merge approval">
      <span>{`Waiting for merge: ${mergeWait.predictionText}`}</span>
      {mergeWait.conflictedFiles.length === 0 ? null : (
        <ul className="bridge-merge-pairwise" aria-label="Conflicted files">
          {mergeWait.conflictedFiles.map((file) => <li key={file}>{file}</li>)}
        </ul>
      )}
      <CommandButton label="Accept" command={mergeWait.accepts ? { kind: 'merge-accept', ticketReference: ticketId } : null} />
      <CommandButton label="Update branch" command={{ kind: 'merge-update', ticketReference: ticketId }} />
    </div>
  );
}

function DetailControls({ ticketId, controls }: { readonly ticketId: string; readonly controls: DetailControlsModel }) {
  const [reason, setReason] = useState('');
  const [networkText, setNetworkText] = useState(() => controls.network.join(', '));
  const anyControl = controls.readies || controls.holdMove !== null || controls.parks || controls.setsNetwork;
  return (
    <>
      {controls.mergeWait === undefined ? null : <MergeWaitControls ticketId={ticketId} mergeWait={controls.mergeWait} />}
      {anyControl ? <div className="bridge-detail-controls" role="group" aria-label="Ticket controls">
        {controls.readies ? <CommandButton label="Ready" command={{ kind: 'ticket-ready', ticketReferences: [ticketId] }} /> : null}
        {controls.holdMove !== null || controls.parks
          ? <input className="bridge-text-input" aria-label="Reason" placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          : null}
        {controls.holdMove === 'hold' ? <CommandButton label="Hold" command={{ kind: 'ticket-hold', ticketReference: ticketId, reason }} /> : null}
        {controls.holdMove === 'unhold' ? <CommandButton label="Unhold" command={{ kind: 'ticket-unhold', ticketReference: ticketId }} /> : null}
        {controls.parks ? <CommandButton label="Park" command={{ kind: 'ticket-park', ticketReference: ticketId, reason }} /> : null}
        {controls.setsNetwork
          ? (
            <>
              <input
                className="bridge-text-input"
                aria-label="Network domains"
                placeholder="example.com, api.example.com"
                value={networkText}
                onChange={(event) => setNetworkText(event.target.value)}
              />
              <CommandButton label="Set network" command={{ kind: 'ticket-network', ticketReference: ticketId, domains: DetailPanelModel.networkDomainsOf(networkText) }} />
            </>
          )
          : null}
      </div> : null}
    </>
  );
}

export function DetailPanel({
  boardState, ticketId, todayCalendarDate, tab
}: DetailPanelProps) {
  const model = DetailPanelModel.detailPanelModelOf(boardState, ticketId, todayCalendarDate);
  const closeHref = HashRouter.fragmentOf({ tab, item: null });
  if (model === null) {
    return (
      <aside className="bridge-detail" aria-label={`Ticket #${ticketId}`}>
        <p className="bridge-empty">{`No ticket #${ticketId} on this board.`}</p>
        <a className="bridge-link" href={closeHref}>Close</a>
      </aside>
    );
  }
  return (
    <aside className="bridge-detail" aria-label={`Ticket ${model.idText}`}>
      <div className="bridge-detail-head" data-state={model.stateToken}>
        <span className="bridge-detail-id">{model.idText}</span>
        <h2 className="bridge-detail-title">{model.title}</h2>
        <span className="bridge-state-badge" data-state={model.stateToken}>{model.stateLabel}</span>
        {model.priority === null ? null : <span className="bridge-ticket-priority" data-priority={model.priority}>{model.priority}</span>}
        {model.ticketType === null ? null : <span className="bridge-ticket-type" data-type={model.ticketType}>{model.ticketType}</span>}
        <a className="bridge-link" href={closeHref}>Close</a>
      </div>
      {/* Keyed by ticket, so a typed reason never carries over to the next ticket opened. */}
      <DetailControls key={model.ticketId} ticketId={model.ticketId} controls={model.controls} />
      <dl className="bridge-detail-facts">
        {model.facts.map((fact) => (
          <div key={fact.label} className="bridge-detail-fact">
            <dt>{fact.label}</dt>
            <dd><FactValue fact={fact} tab={tab} /></dd>
          </div>
        ))}
      </dl>
      {model.phases.length === 0
        ? null
        : (
          <section className="bridge-detail-section" aria-label="Timeline">
            <h3 className="bridge-detail-section-title">Timeline</h3>
            <ol className="bridge-detail-phases">
              {model.phases.map((phase, index) => (
                <li key={`${phase.stamp.fullText}:${String(index)}`} data-state={phase.stateToken}>
                  <span className="bridge-state-badge" data-state={phase.stateToken}>{phase.label}</span>
                  <Stamp stamp={phase.stamp} element="time" />
                </li>
              ))}
            </ol>
          </section>
        )}
      <section className="bridge-detail-section" aria-label="Description">
        <h3 className="bridge-detail-section-title">Description</h3>
        <SandboxedHtmlFrame title={`Description of ${model.title}`} html={model.bodyHtml} placement="ticket-body" />
      </section>
      <section className="bridge-detail-section" aria-label="Log">
        <h3 className="bridge-detail-section-title">Log</h3>
        {model.logLines.length === 0
          ? <p className="bridge-empty">{NO_LOG_LINES_TEXT}</p>
          : (
            <ul className="bridge-detail-log">
              {model.logLines.map((line) => (
                <li key={line.key}>
                  <Stamp stamp={line.stamp} element="time" />
                  <span>{line.text}</span>
                </li>
              ))}
            </ul>
          )}
      </section>
    </aside>
  );
}
