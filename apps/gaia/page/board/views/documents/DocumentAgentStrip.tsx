/** The strip above the document agent's composer: Flint's slot, the habitat of the agent's document, and what the agent does now. */
import type { BoardTicketDocumentKind }      from '../../../@types/board/BoardVocabulary.ts';
import { FlintSlotHabitat }                  from '../../flint/FlintSlotHabitat.tsx';
import { FLINT_SLOT_HABITATS }               from '../../flint/FlintSlotHabitats.ts';
import { STRIP_FLINT_SLOT }                  from '../../flint/FlintStripSlot.ts';
import { useCoveringPanelHoldsTheFlintSlot } from '../../shell/CoveringPanel.ts';
import type { DocumentAgentStripModel }      from './DocumentAgentStripModel.ts';

const HABITAT_OF_DOCUMENT = { spec: FLINT_SLOT_HABITATS.specAgent, plan: FLINT_SLOT_HABITATS.planAgent } as const;

export function DocumentAgentStrip({ document, strip }: { readonly document: BoardTicketDocumentKind; readonly strip: DocumentAgentStripModel }) {
  const flintSlotIsCovered = useCoveringPanelHoldsTheFlintSlot();
  return (
    <div className="board-document-agent-strip" aria-label="Agent status">
      {flintSlotIsCovered
        ? null
        : (
          <FlintSlotHabitat
            key={document}
            habitat={HABITAT_OF_DOCUMENT[document]}
            cue={strip.cue}
            label={`Flint, the ${strip.agentName.toLowerCase()}`}
            size={STRIP_FLINT_SLOT.SIZE}
            ground="page"
          />
        )}
      <span className="board-document-agent-status">{strip.status}</span>
    </div>
  );
}
