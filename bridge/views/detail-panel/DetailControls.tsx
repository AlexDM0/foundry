/**
 * The Bridge's own controls on a ticket, in the panel's section style: Merge while the ticket waits for merge (Accept, Update branch), then
 * Controls (Ready, Hold or Unhold, Park, Set network). Each posts its `ControlCommand` and shows the Overseer's refusal verbatim.
 */
import { TitledBlock } from 'design-system/TitledBlock';
import { useState }    from 'react';

import { CommandButton }                                                          from '../../shell/CommandButton.tsx';
import { DetailControlsModelUtil, type DetailControlsModel, type MergeWaitModel } from './DetailControlsModel.ts';

/** Accept never sends while the prediction is not clean; Update branch sends whenever the ticket waits. */
function MergeWaitControls({ ticketId, mergeWait }: { readonly ticketId: string; readonly mergeWait: MergeWaitModel }) {
  return (
    <TitledBlock title="Merge" rule="above">
      <p className="bridge-detail-note">{`Waiting for merge: ${mergeWait.predictionText}`}</p>
      {mergeWait.conflictedFiles.length === 0 ? null : (
        <ul className="bridge-detail-conflicts" aria-label="Conflicted files">
          {mergeWait.conflictedFiles.map((file) => <li key={file}>{file}</li>)}
        </ul>
      )}
      <div className="bridge-detail-controls" role="group" aria-label="Merge approval">
        <CommandButton label="Accept" command={mergeWait.accepts ? { kind: 'merge-accept', ticketReference: ticketId } : null} primary />
        <CommandButton label="Update branch" command={{ kind: 'merge-update', ticketReference: ticketId }} />
      </div>
    </TitledBlock>
  );
}

function TicketControls({ ticketId, controls }: { readonly ticketId: string; readonly controls: DetailControlsModel }) {
  const [reason, setReason] = useState('');
  const [networkText, setNetworkText] = useState(() => controls.network.join(', '));
  return (
    <TitledBlock title="Controls" rule="above">
      <div className="bridge-detail-controls" role="group" aria-label="Ticket controls">
        {controls.readies ? <CommandButton label="Ready" command={{ kind: 'ticket-ready', ticketReferences: [ticketId] }} primary /> : null}
        {controls.holdMove !== null || controls.parks
          ? <input className="bridge-detail-input" aria-label="Reason" placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          : null}
        {controls.holdMove === 'hold' ? <CommandButton label="Hold" command={{ kind: 'ticket-hold', ticketReference: ticketId, reason }} /> : null}
        {controls.holdMove === 'unhold' ? <CommandButton label="Unhold" command={{ kind: 'ticket-unhold', ticketReference: ticketId }} /> : null}
        {controls.parks ? <CommandButton label="Park" command={{ kind: 'ticket-park', ticketReference: ticketId, reason }} /> : null}
      </div>
      {controls.setsNetwork
        ? (
          <div className="bridge-detail-controls" role="group" aria-label="Network">
            <input
              className="bridge-detail-input"
              aria-label="Network domains"
              placeholder="example.com, api.example.com"
              value={networkText}
              onChange={(event) => setNetworkText(event.target.value)}
            />
            <CommandButton label="Set network" command={{ kind: 'ticket-network', ticketReference: ticketId, domains: DetailControlsModelUtil.networkDomainsOf(networkText) }} />
          </div>
        )
        : null}
    </TitledBlock>
  );
}

/** Keyed by ticket, so a typed reason never carries over to the next ticket opened. */
export function DetailControls({ ticketId, controls }: { readonly ticketId: string; readonly controls: DetailControlsModel }) {
  return (
    <>
      {controls.mergeWait === undefined ? null : <MergeWaitControls ticketId={ticketId} mergeWait={controls.mergeWait} />}
      {DetailControlsModelUtil.offersAnyTicketControl(controls) ? <TicketControls key={ticketId} ticketId={ticketId} controls={controls} /> : null}
    </>
  );
}
