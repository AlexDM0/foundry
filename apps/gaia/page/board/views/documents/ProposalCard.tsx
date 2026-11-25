/**
 * An agent's proposed edit, in two places: inline in the document, its new lines under the struck ones with Discard, Edit first and
 * Apply, and as the diff card in the chat with its numbered removed and added lines. Edit first opens the new lines in a field per edit;
 * Apply then sends User's text. The forge lands the edit on the newest text, and a refusal shows verbatim.
 */
import { useState } from 'react';

import { MarkdownBlocks }                        from '../../../../src/lib/markdown-render/MarkdownBlocks.ts';
import { Button }                                from '../../../lib/design-system/DesignSystemInterface.ts';
import { useControlCommand }                     from '../../shell/ControlCommandSender.ts';
import { DocumentBlocks }                        from './DocumentBlocks.tsx';
import { ProposalModel, type OpenProposalModel } from './ProposalModel.ts';
import type { DocumentPlace }                    from './TicketDocumentCommands.ts';

export interface ProposalCardProps {
  readonly place:    DocumentPlace;
  readonly proposal: OpenProposalModel;
  /** Read-only: the document cannot change any more, so the card offers nothing. */
  readonly settled?: boolean;
}

function ProposalActions({
  place, proposal, editedFields, onEditFirst
}: {
  readonly place:        DocumentPlace;
  readonly proposal:     OpenProposalModel;
  readonly editedFields: readonly string[] | null;
  readonly onEditFirst:  (() => void) | null;
}) {
  const discard = useControlCommand(ProposalModel.discardCommandOf(place, proposal.proposalId));
  const apply = useControlCommand(ProposalModel.applyCommandOf(place, proposal.proposalId, editedFields));
  const refusal = apply.refusal ?? discard.refusal;
  return (
    <>
      <Button label="Discard" dense disabled={!discard.enabled} onPress={() => void discard.send()} />
      {onEditFirst === null ? null : <Button label="Edit first" dense onPress={onEditFirst} />}
      <Button label="Apply" emphasis="primary" dense disabled={!apply.enabled} onPress={() => void apply.send()} />
      {refusal === null ? null : <span className="board-refusal" role="status">{refusal}</span>}
    </>
  );
}

/** The edit in the document: the struck lines are drawn by the document itself, the new ones here. */
export function InlineProposal({ place, proposal, settled = false }: ProposalCardProps) {
  const [editedFields, setEditedFields] = useState<readonly string[] | null>(null);
  return (
    <div className="board-document-proposal" role="group" aria-label={proposal.label}>
      {editedFields === null
        ? <div className="board-document-proposal-inserted"><DocumentBlocks blocks={MarkdownBlocks.blocksOf(proposal.insertedLines.join('\n'))} /></div>
        : editedFields.map((field, position) => (
          <textarea
            key={position}
            className="board-textarea board-document-proposal-field"
            aria-label={`Your text for edit ${position + 1}`}
            rows={Math.max(field.split('\n').length, 2)}
            value={field}
            onChange={(event) => {
              const { value } = event.currentTarget;
              setEditedFields((fields) => (fields ?? []).map((existing, i) => (i === position ? value : existing)));
            }}
          />
        ))}
      <div className="board-document-proposal-bar">
        <span className="board-document-proposal-label">{proposal.label}</span>
        {settled
          ? null
          : (
            <ProposalActions
              place={place}
              proposal={proposal}
              editedFields={editedFields}
              onEditFirst={editedFields === null ? () => setEditedFields(proposal.replacementLines.map((lines) => lines.join('\n'))) : null}
            />
          )}
      </div>
    </div>
  );
}

/** The diff card in the chat. */
export function ProposalDiffCard({ place, proposal, settled = false }: ProposalCardProps) {
  return (
    <div className="board-document-diff-card" role="group" aria-label={`Proposed edit, ${proposal.linesText}`}>
      <div className="board-document-diff-head">
        <span className="board-document-micro">Proposed edit</span>
        <span className="board-document-mono board-document-note">{proposal.linesText}</span>
      </div>
      {proposal.diffRows.map((row) => (
        <div key={row.key} className="board-document-diff-line" data-sign={row.sign === '+' ? 'added' : 'removed'}>
          <span className="board-document-diff-number">{row.lineNumber}</span>
          <span className="board-document-diff-sign" aria-hidden="true">{row.sign}</span>
          <span className="board-document-diff-text">{row.text}</span>
        </div>
      ))}
      {settled
        ? null
        : <div className="board-document-diff-foot"><ProposalActions place={place} proposal={proposal} editedFields={null} onEditFirst={null} /></div>}
    </div>
  );
}
