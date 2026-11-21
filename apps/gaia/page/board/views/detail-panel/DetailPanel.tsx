/**
 * The detail panel: the side panel docked under the tab bar, showing the ticket, row or draft form the routed item opens, or the line
 * naming what the board lacks; switching items cross-fades its contents. The ticket form brings its own head; every other form scrolls
 * whole under the lone ×.
 */
import type { RefObject } from 'react';

import type { BoardDocument }                          from '../../../@types/board/BoardDocument.ts';
import { SidePanel, SidePanelBody, SidePanelHead }     from '../../../lib/design-system/DesignSystemInterface.ts';
import { DetailRoute, type DetailItem }                from '../../shell/DetailRoute.ts';
import type { DetailFormat }                           from './DetailFactsModel.ts';
import { DetailPanelModel, type DetailPanelViewModel } from './DetailPanelModel.ts';
import { DetailNote }                                  from './DetailParts.tsx';
import { DraftDetail }                                 from './DraftDetail.tsx';
import { RowDetail }                                   from './RowDetail.tsx';
import { TicketDetail }                                from './TicketDetail.tsx';

const TAB_BAR_SELECTOR = '.board-tab-bar';

const CLOSE_LABEL = 'Close';

export interface DetailPanelProps {
  readonly board:              BoardDocument;
  readonly item:               DetailItem;
  readonly format:             DetailFormat;
  /** True while the panel slides out; `onClosed` is called once it is gone. */
  readonly isClosing:          boolean;
  readonly onClosed:           () => void;
  readonly onClose:            () => void;
  /** Asked once, as the panel first shows: true moves the focus to × so the next Tab walks the panel, as after Enter on a card. */
  readonly focusesCloseOnOpen: () => boolean;
  /** The panel's element, so the host can tell the focus inside it from the opener's. */
  readonly panelRef?:          RefObject<HTMLElement | null>;
}

function accessibleNameOf(model: DetailPanelViewModel): string {
  switch (model.form) {
    case 'ticket':
      return `Ticket ${model.idText}`;
    case 'row':
      return `Row ${model.head.idText}`;
    case 'draft':
      return `Draft ${model.idText}`;
    default:
      return 'Detail';
  }
}

/** The row and draft forms, and the note, under the lone ×. */
function FormOf({ model }: { readonly model: Exclude<DetailPanelViewModel, { readonly form: 'ticket' }> }) {
  switch (model.form) {
    case 'row':
      return <RowDetail model={model} />;
    case 'draft':
      return <DraftDetail model={model} />;
    default:
      return <DetailNote text={model.text} />;
  }
}

/** The panel's top follows the tab bar's end as the header scrolls away. */
function tabBarOf(): Element | null {
  return document.querySelector(TAB_BAR_SELECTOR);
}

export function DetailPanel({
  board, item, format, isClosing, onClosed, onClose, focusesCloseOnOpen, panelRef
}: DetailPanelProps) {
  const model = DetailPanelModel.detailPanelModelOf(board, item, format);
  const contentKey = DetailRoute.itemTextOf(item);
  return (
    <SidePanel
      label={accessibleNameOf(model)}
      width="detail"
      dockBelow={tabBarOf}
      isClosing={isClosing}
      onClosed={onClosed}
      focusesCloseOnOpen={focusesCloseOnOpen}
      {...(panelRef === undefined ? {} : { panelRef })}
    >
      {model.form === 'ticket'
        ? <TicketDetail model={model} closeLabel={CLOSE_LABEL} onClose={onClose} contentKey={contentKey} />
        : (
          <>
            <SidePanelHead closeLabel={CLOSE_LABEL} onClose={onClose} />
            <SidePanelBody contentKey={contentKey}>
              <FormOf model={model} />
            </SidePanelBody>
          </>
        )}
    </SidePanel>
  );
}
