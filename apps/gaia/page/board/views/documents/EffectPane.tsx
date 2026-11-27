/**
 * "What the plan names": the closable pane beside the plan with the effect reading of its head. It says what the reading read and how
 * long it took, the legend of change marks, the folder tree of the places the plan names with their reference numbers, and the places it
 * could not resolve, each a warning card with the reason and a hint. The reading is not saved: Refresh reads the head again.
 */
import type { CSSProperties } from 'react';

import type { BoardEffectReadingDocument }            from '../../../@types/board/TicketDocumentsDocument.ts';
import { Button, IconButton, MicroCapsLabel }         from '../../../lib/design-system/DesignSystemInterface.ts';
import { useControlCommand }                          from '../../shared/commands/ControlCommandSender.ts';
import { EffectTreeModel }                            from './EffectTreeModel.ts';
import { TicketDocumentCommands, type DocumentPlace } from './TicketDocumentCommands.ts';

export interface EffectPaneProps {
  readonly place:      DocumentPlace;
  /** `null` before the first reading of this document. */
  readonly reading:    BoardEffectReadingDocument | null;
  /** The head version Refresh reads; `null` while the document has none. */
  readonly headNumber: number | null;
  readonly onClose:    () => void;
}

export function EffectPane({
  place, reading, headNumber, onClose
}: EffectPaneProps) {
  const refresh = useControlCommand(headNumber === null || reading?.state === 'reading' ? null : TicketDocumentCommands.effectReadOf(place, headNumber));
  const pane = reading === null ? null : EffectTreeModel.paneOf(reading);
  return (
    <section className="board-document-effect" aria-label="Effect in repo">
      <div className="board-document-effect-head">
        <div className="board-document-effect-title-row">
          <span className="board-document-effect-title">What the plan names</span>
          <IconButton glyph="close" accessibleName="Close the picture" onPress={onClose} />
        </div>
        <span className="board-document-note">{pane?.sourceLine ?? 'Not read yet. Refresh reads the plan against the file tree.'}</span>
        {pane === null
          ? null
          : (
            <div className="board-document-effect-legend">
              {pane.legend.map((item) => (
                <span key={item.change} className="board-document-effect-legend-item">
                  <b className="board-document-mono">{item.sigil}</b>
                  {` ${item.word}`}
                </span>
              ))}
            </div>
          )}
      </div>
      <div className="board-document-effect-body">
        {(pane?.rows ?? []).map((row) => (
          <div
            key={row.key}
            className="board-document-tree-row"
            style={{ '--tree-depth': row.depth } as CSSProperties}
            data-kind={row.kind}
            data-root={row.depth === 0 ? '' : undefined}
            data-change={row.kind === 'entry' ? row.change : undefined}
            title={row.kind === 'entry' ? row.detail : undefined}
          >
            <span className="board-document-tree-sigil">{row.kind === 'entry' ? row.sigil : ''}</span>
            <span className="board-document-tree-name">
              {row.name}
              {row.kind === 'entry' && row.fileCount !== null ? <>{' · '}<span className="board-document-tree-count">{row.fileCount}</span></> : null}
              {row.kind === 'entry' && row.becomes !== null ? <>{' '}<span className="board-document-tree-count">{row.becomes}</span></> : null}
            </span>
            {row.kind === 'entry'
              ? <span className="board-document-reference" data-unresolved={row.change === 'unresolved' ? '' : undefined}>{row.reference}</span>
              : <span />}
          </div>
        ))}
        {pane === null || pane.unresolved.length === 0
          ? null
          : (
            <div className="board-document-unresolved">
              <MicroCapsLabel text={`Unresolved · ${pane.unresolved.length}`} />
              {pane.unresolved.map((item) => (
                <div key={item.key} className="board-document-unresolved-item">
                  <span>
                    <span className="board-document-reference" data-unresolved="">{item.reference}</span>
                    {' '}
                    <span className="board-document-mono">{item.named}</span>
                  </span>
                  <span className="board-document-unresolved-reason">{item.reason}</span>
                  <span className="board-document-note">{item.hint}</span>
                </div>
              ))}
            </div>
          )}
      </div>
      <div className="board-document-effect-foot">
        <span className="board-document-note">Not saved. Redraw after editing.</span>
        <Button label="Refresh" dense disabled={!refresh.enabled} onPress={() => void refresh.send()} />
        {refresh.refusal === null ? null : <span className="board-refusal" role="status">{refresh.refusal}</span>}
      </div>
    </section>
  );
}
