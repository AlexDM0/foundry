/**
 * The controls on a ticket the forge offers, in the panel's section style: Merge while the ticket waits for merge (Accept, Update branch),
 * then Controls (Ready, Hold or Unhold, Park, Set network). Each posts its board command and shows the forge's refusal verbatim.
 */
import { useState } from 'react';

import { PAGE_CONTRACT_VERSIONS }                                                 from '../../../../src/shared/constants/PageContractVersions.ts';
import { TitledBlock }                                                            from '../../../lib/design-system/DesignSystemInterface.ts';
import { CommandButton }                                                          from '../../shared/commands/CommandButton.tsx';
import { DetailControlsModelUtil, type DetailControlsModel, type MergeWaitModel } from './DetailControlsModel.ts';

const COMMAND_VERSION = PAGE_CONTRACT_VERSIONS.gaiaBoardCommand;

/** Accept and Update branch send only while the forge offers them. */
function MergeWaitControls({ ticketId, mergeWait }: { readonly ticketId: string; readonly mergeWait: MergeWaitModel }) {
  return (
    <TitledBlock title="Merge" rule="above">
      <p className="board-detail-note">{`Waiting for merge: ${mergeWait.predictionText}`}</p>
      {mergeWait.conflictedFiles.length === 0 ? null : (
        <ul className="board-detail-conflicts" aria-label="Conflicted files">
          {mergeWait.conflictedFiles.map((file) => <li key={file}>{file}</li>)}
        </ul>
      )}
      <div className="board-detail-controls" role="group" aria-label="Merge approval">
        <CommandButton label="Accept" command={mergeWait.accepts ? { boardCommandVersion: COMMAND_VERSION, kind: 'merge-accept', ticketId } : null} primary />
        <CommandButton label="Update branch" command={mergeWait.updates ? { boardCommandVersion: COMMAND_VERSION, kind: 'merge-update', ticketId } : null} />
      </div>
    </TitledBlock>
  );
}

function TicketControls({ ticketId, controls }: { readonly ticketId: string; readonly controls: DetailControlsModel }) {
  const [reason, setReason] = useState('');
  const [networkText, setNetworkText] = useState(() => controls.network.join(', '));
  return (
    <TitledBlock title="Controls" rule="above">
      <div className="board-detail-controls" role="group" aria-label="Ticket controls">
        {controls.readies ? <CommandButton label="Ready" command={{ boardCommandVersion: COMMAND_VERSION, kind: 'ticket-ready', ticketIds: [ticketId] }} primary /> : null}
        {controls.holdMove !== null || controls.parks
          ? <input className="board-detail-input" aria-label="Reason" placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          : null}
        {controls.holdMove === 'hold' ? <CommandButton label="Hold" command={{
          boardCommandVersion: COMMAND_VERSION, kind: 'ticket-hold', ticketId, reason
        }} /> : null}
        {controls.holdMove === 'unhold' ? <CommandButton label="Unhold" command={{ boardCommandVersion: COMMAND_VERSION, kind: 'ticket-unhold', ticketId }} /> : null}
        {controls.parks ? <CommandButton label="Park" command={{
          boardCommandVersion: COMMAND_VERSION, kind: 'ticket-park', ticketId, reason, incidentId: null
        }} /> : null}
      </div>
      {controls.setsNetwork
        ? (
          <div className="board-detail-controls" role="group" aria-label="Network">
            <input
              className="board-detail-input"
              aria-label="Network domains"
              placeholder="example.com, api.example.com"
              value={networkText}
              onChange={(event) => setNetworkText(event.target.value)}
            />
            <CommandButton label="Set network" command={{
              boardCommandVersion: COMMAND_VERSION, kind: 'ticket-network', ticketId, domains: DetailControlsModelUtil.networkDomainsOf(networkText)
            }} />
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
