/**
 * The detail panel: the side panel docked under the tab bar, showing the ticket, row or draft form the routed item opens, or the line
 * naming what the board lacks; switching items cross-fades its contents.
 */
import type { DetailBoardState }                       from '../../@types/DetailBoardState.ts';
import { SidePanel }                                   from '../../design-system/SidePanel.tsx';
import { DetailRoute, type DetailItem }                from '../../shell/DetailRoute.ts';
import type { DetailFormat }                           from './DetailFactsModel.ts';
import { DetailPanelModel, type DetailPanelViewModel } from './DetailPanelModel.ts';
import { DetailNote }                                  from './DetailParts.tsx';
import { DraftDetail }                                 from './DraftDetail.tsx';
import { RowDetail }                                   from './RowDetail.tsx';
import { TicketDetail }                                from './TicketDetail.tsx';

const TAB_BAR_SELECTOR = '.bridge-tab-bar';

export interface DetailPanelProps {
  readonly boardState:         DetailBoardState;
  readonly item:               DetailItem;
  readonly format:             DetailFormat;
  /** True while the panel slides out; `onClosed` is called once it is gone. */
  readonly isClosing:          boolean;
  readonly onClosed:           () => void;
  readonly onClose:            () => void;
  /** Asked once, as the panel first shows: true moves the focus to × so the next Tab walks the panel, as after Enter on a card. */
  readonly focusesCloseOnOpen: () => boolean;
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

function FormOf({ model }: { readonly model: DetailPanelViewModel }) {
  switch (model.form) {
    case 'ticket':
      return <TicketDetail model={model} />;
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
  boardState, item, format, isClosing, onClosed, onClose, focusesCloseOnOpen
}: DetailPanelProps) {
  const model = DetailPanelModel.detailPanelModelOf(boardState, item, format);
  return (
    <SidePanel
      label={accessibleNameOf(model)}
      width="detail"
      dockBelow={tabBarOf}
      isClosing={isClosing}
      onClosed={onClosed}
      onClose={onClose}
      closeLabel="Close"
      focusesCloseOnOpen={focusesCloseOnOpen}
      contentKey={DetailRoute.itemTextOf(item)}
    >
      <FormOf model={model} />
    </SidePanel>
  );
}
