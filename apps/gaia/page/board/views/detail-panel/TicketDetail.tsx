/**
 * The ticket form a Kanban card or wave card opens, as the side panel's head and body: the head (the id line with type and priority, which
 * × closes, then the title in the display face beside the state pill) over the section tabs (Overview, Timeline, Activity, Description),
 * each a link to its own route over the same board tab, stays put; the body scrolls the section shown. Only that section is mounted, so the
 * body's frame measures itself once it is visible.
 */

import { useEffect, useRef } from 'react';
import {
  CountBadge,
  type LinkTabItem,
  Row,
  SidePanelBody,
  SidePanelHead,
  StatePill,
  Tabs,
  Text,
  View
} from '../../../lib/design-system/DesignSystemInterface.ts';

import { PriorityMark, TypeMark }             from '../../chips/TicketMarks.tsx';
import { SandboxedHtmlFrame }                 from '../../sandboxed-html/SandboxedHtmlFrame.tsx';
import { useBoardHrefOf, useBoardNavigation } from '../../shell/BoardRouteLinks.ts';
import { DetailRoute, type TicketSection }    from '../../shell/DetailRoute.ts';
import { useDetailRouting }                   from '../../shell/DetailRouting.ts';
import { StateToneUtil }                      from '../../utils/StateToneUtil.ts';
import { LogLines }                           from './DetailParts.tsx';
import type { TicketDetailModel }             from './TicketDetailModel.ts';
import { TicketOverview }                     from './TicketOverview.tsx';
import { TicketTimeline }                     from './TicketTimeline.tsx';

export const NO_TICKET_LOG_LINES_NOTE = 'No log line names this ticket or its row.';

/** The id line, which × closes. */
function TicketIdLine({ model }: { readonly model: TicketDetailModel }) {
  return (
    <div className="board-ticket-detail-id-line">
      <span className="board-detail-id">{model.idText}</span>
      <TypeMark type={model.ticketType} />
      <PriorityMark priority={model.priority} />
    </div>
  );
}

/** The title beside its state pill, as wide as the head. */
function TicketHead({ model }: { readonly model: TicketDetailModel }) {
  return (
    <div className="board-ticket-detail-head" data-state={model.stateToken} data-state-tone={StateToneUtil.toneOf(model.stateToken)}>
      <Row between centerY gap="twelve">
        <View grow><Text typeRole="page" element="h2">{model.title}</Text></View>
        <Row centerY gap="four">
          <StatePill label={model.stateLabel} {...StateToneUtil.pillLookOf(model.stateToken)} />
          {model.reviewedTitle === null
            ? null
            : (
              <span
                className="board-detail-reviewed-mark"
                data-state="reviewed"
                data-state-tone={StateToneUtil.toneOf('reviewed')}
                title={model.reviewedTitle}
                role="img"
                aria-label="reviewed"
              >
                ✓
              </span>
            )}
        </Row>
      </Row>
    </div>
  );
}

function logLinesText(count: number): string {
  return count === 1 ? '1 log line' : `${String(count)} log lines`;
}

function SectionTabs({ model }: { readonly model: TicketDetailModel }) {
  const { tab } = useDetailRouting();
  const hrefOf = useBoardHrefOf();
  const navigate = useBoardNavigation();
  const routeOf = (section: TicketSection) => DetailRoute.sectionRouteOf(tab, model.ticketId, section);
  const items = model.tabs.map((sectionTab): LinkTabItem<TicketSection> => ({
    key:   sectionTab.section,
    label: sectionTab.label,
    href:  hrefOf(routeOf(sectionTab.section)),
    ...(sectionTab.count === null
      ? {}
      : { countBadge: <CountBadge count={sectionTab.count} tone="neutral" />, accessibleName: `${sectionTab.label}, ${logLinesText(sectionTab.count)}` }),
  }));
  return (
    <Tabs
      label="Ticket sections"
      mode="links"
      size="section"
      items={items}
      selectedKey={model.section}
      onSelect={(section) => navigate(routeOf(section))}
    />
  );
}

function ShownSection({ model }: { readonly model: TicketDetailModel }) {
  switch (model.section) {
    case 'timeline':
      return <TicketTimeline model={model.timeline} />;
    case 'activity':
      return <LogLines lines={model.activity} emptyNote={NO_TICKET_LOG_LINES_NOTE} />;
    case 'description':
      return <SandboxedHtmlFrame title={`Description of ${model.title}`} html={model.bodyHtml} placement="ticket-body" />;
    default:
      return <TicketOverview ticketId={model.ticketId} model={model.overview} />;
  }
}

export interface TicketDetailProps {
  readonly model:      TicketDetailModel;
  readonly closeLabel: string;
  readonly onClose:    () => void;
  /** The body's content key: a new item cross-fades it. */
  readonly contentKey: string;
}

export function TicketDetail({
  model, closeLabel, onClose, contentKey
}: TicketDetailProps) {
  const bodyScroll = useRef<HTMLDivElement>(null);
  // A new section starts at the body's top, so the section's start shows; the focus stays on the tab that opened it.
  useEffect(() => {
    if (bodyScroll.current !== null) bodyScroll.current.scrollTop = 0;
  }, [model.section]);
  return (
    <>
      <SidePanelHead closeLabel={closeLabel} onClose={onClose} firstLine={<TicketIdLine model={model} />}>
        <TicketHead model={model} />
        <div className="board-detail-tab-bar">
          <SectionTabs model={model} />
        </div>
      </SidePanelHead>
      <SidePanelBody contentKey={contentKey} scrollRef={bodyScroll}>
        <ShownSection model={model} />
      </SidePanelBody>
    </>
  );
}
