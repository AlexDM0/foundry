/**
 * The Activity view (artboard A3): the two filters across the top, then what happened across the fleet, newest first, beside the cards of today's
 * landings and tokens per forge, and the usage line. `ActivityView` keeps the filters and whether the
 * forge menu is open; `ActivityLayout` takes no hooks and lays the view out from the model's content alone; `activityViewPartsOf` hands the shell the
 * page title's parts with the view.
 */
import { Card }                                 from 'design-system/Card';
import { DataTable, type DataTableColumn }      from 'design-system/DataTable';
import { EmptyState }                           from 'design-system/EmptyState';
import { FillMeter }                            from 'design-system/FillMeter';
import { Icon }                                 from 'design-system/Icon';
import { Menu, MenuItem }                       from 'design-system/Menu';
import { SectionHead }                          from 'design-system/SectionHead';
import { type SegmentOption, SegmentedControl } from 'design-system/SegmentedControl';
import { Stamp }                                from 'design-system/Stamp';
import { StateDot }                             from 'design-system/StateDot';
import type { StateTone }                       from 'design-system/StateTone';
import { Text }                                 from 'design-system/Text';
import { useMemo, useState }                    from 'react';

import { LIMITS }             from '../../../src/shared/constants/Limits.ts';
import type { FleetDocument } from '../../@types/FleetDocument.ts';
import { RoleDot }            from '../../design-system/RoleDot.tsx';
import type { ClockReading }  from '../../shared/@types/ClockReading.ts';
import type { ViewParts }     from '../../shared/@types/ViewParts.ts';
import {
  type ActivityContent,
  type ActivityFilters,
  type ActivityKindFilter,
  ActivityModel,
  type ActivityRow,
  type CountedKind,
  EVERY_ENTRY,
  type ForgeChoices,
  KIND_FILTER_LABELS,
  KIND_FILTERS,
  type TodayList,
} from './ActivityModel.ts';

const TITLE = 'Activity';

const LEAD = `The newest ${LIMITS.activityEntriesShownPerForge} entries of each forge, as each forge words them.`;

type ActivityColumn = 'at' | 'forge' | 'kind' | 'text';

const COLUMNS: readonly DataTableColumn<ActivityColumn>[] = [
  { key: 'at', label: 'At' },
  { key: 'forge', label: 'Forge' },
  { key: 'kind', label: 'Kind' },
  { key: 'text', label: 'What happened' },
];

const COLUMN_WIDTHS = 'var(--activity-at-width) var(--activity-forge-width) var(--activity-kind-width) minmax(0, 1fr)';

function kindIsCounted(kind: ActivityKindFilter): kind is CountedKind {
  return kind === 'needs-user' || kind === 'landed';
}

function kindOptionsOf(kindCounts: ActivityContent['kindCounts']): SegmentOption<ActivityKindFilter>[] {
  return KIND_FILTERS.map((kind) => (kindIsCounted(kind)
    ? { value: kind, label: KIND_FILTER_LABELS[kind], count: kindCounts[kind] }
    : { value: kind, label: KIND_FILTER_LABELS[kind] }));
}

/** A tracker id is never empty, so the empty value stands for every forge. */
const EVERY_FORGE_VALUE = '';

const KIND_LABEL_ID = 'gaia-activity-kind-label';
const FORGE_LABEL_ID = 'gaia-activity-forge-label';

const FOOTNOTE = 'A dormant forge shows its entries up to its stop. Older entries are in each forge\'s own log.';

const NOTHING_REPORTED_SENTENCE = 'No forge reports it.';

const USAGE_SOURCE_SENTENCE = 'As the forges report it.';

export interface ActivityLayoutProps {
  readonly content:          ActivityContent;
  readonly kindFilter:       ActivityKindFilter;
  readonly menuIsOpen:       boolean;
  readonly onKindFilter:     (kind: ActivityKindFilter) => void;
  /** `null` for every forge. */
  readonly onForgeChoice:    (trackerId: string | null) => void;
  readonly onMenuOpenChange: (isOpen: boolean) => void;
}

function KindCell({ row }: { readonly row: ActivityRow }) {
  return (
    <span className="gaia-activity-kind">
      {row.dotRole === null ? <span className="gaia-activity-dot-space" aria-hidden="true" /> : <RoleDot role={row.dotRole} />}
      {row.categoryWord}
    </span>
  );
}

function TextCell({ row }: { readonly row: ActivityRow }) {
  if (row.href === null) return <span className="gaia-activity-text" title={row.text}>{row.text}</span>;
  return <a className="gaia-activity-text" href={row.href} title={row.text}>{row.text}</a>;
}

/** A row whose text links to the entry is interactive: its link stretches over the row, which is ringed on hover. */
function tableRowsOf(rows: readonly ActivityRow[]) {
  return rows.map((row) => ({
    key:         row.key,
    interactive: row.href !== null,
    cells:       {
      at:    <span className="gaia-activity-at"><Stamp element="time" dateTime={row.at} shortText={row.clockTime} /></span>,
      forge: <span className="gaia-activity-forge">{row.project}</span>,
      kind:  <KindCell row={row} />,
      text:  <TextCell row={row} />,
    },
  }));
}

interface ForgeMenuProps {
  readonly choices:          ForgeChoices;
  readonly menuIsOpen:       boolean;
  readonly onForgeChoice:    (trackerId: string) => void;
  readonly onMenuOpenChange: (isOpen: boolean) => void;
}

/** The forges past the first three, behind the tray's last segment, which names the chosen one when it is among them. */
function ForgeMenu({
  choices, menuIsOpen, onForgeChoice, onMenuOpenChange
}: ForgeMenuProps) {
  const chosenInMenu = choices.inMenu.find((choice) => choice.trackerId === choices.chosen) ?? null;
  return (
    <Menu
      label="More forges"
      trigger="segment"
      triggerContent={(
        <>
          {chosenInMenu === null ? `${choices.inMenu.length} more` : chosenInMenu.project}
          <Icon name="chevron-down" label={null} />
        </>
      )}
      align="end"
      pressed={chosenInMenu !== null}
      isOpen={menuIsOpen}
      onOpenChange={onMenuOpenChange}
    >
      {choices.inMenu.map((choice) => (
        <MenuItem
          key={choice.trackerId}
          label={choice.project}
          pressed={choice.trackerId === choices.chosen}
          closing="return-focus"
          onChoose={() => onForgeChoice(choice.trackerId)}
        />
      ))}
    </Menu>
  );
}

interface TodaySectionProps {
  readonly head: string;
  readonly list: TodayList;
  readonly tone: StateTone;
}

function TodaySection({ head, list, tone }: TodaySectionProps) {
  return (
    <section className="gaia-activity-side-section">
      <Card paddingTop="fourteen" paddingHorizontal="eighteen" paddingBottom="sixteen" gap="twelve">
        <Text typeRole="micro" element="h2">
          {list.totalText === null ? head : <>{head} · <Text typeRole="micro" mono>{list.totalText}</Text></>}
        </Text>
        {list.rows.length === 0 ? <EmptyState text={NOTHING_REPORTED_SENTENCE} compact /> : (
          <ul className="gaia-activity-today-list">
            {list.rows.map((row) => (
              <li key={row.trackerId} className="gaia-activity-today-row">
                <span className="gaia-activity-today-project">{row.project}</span>
                <span className="gaia-activity-today-value">{row.valueText}</span>
                {row.meter === null ? null : (
                  <span className="gaia-activity-today-meter">
                    <FillMeter label={row.meter.label} used={row.meter.used} limit={row.meter.whole} near={false} tone={tone} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

interface UsageSectionProps {
  readonly lines:           readonly string[];
  readonly linesAtTheLimit: readonly string[];
}

/** A forge's usage reading ends at the clock time its window resets, after its month and day when that is not today; it is set as a stamp. */
const TRAILING_CLOCK_TIME = /(\d{2}-\d{2} )?\d{1,2}:\d{2}$/;

function UsageLine({ line }: { readonly line: string }) {
  const clockTime = TRAILING_CLOCK_TIME.exec(line)?.[0] ?? null;
  if (clockTime === null) return <p className="gaia-activity-usage-line">{line}</p>;
  return <p className="gaia-activity-usage-line">{line.slice(0, -clockTime.length)}<Stamp shortText={clockTime} /></p>;
}

/** A neutral dot under the limit and an orange one at it, each beside its words. */
function UsageSection({ lines, linesAtTheLimit }: UsageSectionProps) {
  if (lines.length === 0) return null;
  return (
    <section className="gaia-activity-usage">
      <SectionHead title="Usage" />
      {lines.map((line) => (
        <div key={line} className="gaia-activity-usage-reading">
          <StateDot tone={linesAtTheLimit.includes(line) ? 'accent' : 'neutral'} small />
          <UsageLine line={line} />
        </div>
      ))}
      <Text typeRole="small" element="p" subtle>{USAGE_SOURCE_SENTENCE}</Text>
    </section>
  );
}

export function ActivityLayout({
  content, kindFilter, menuIsOpen, onKindFilter, onForgeChoice, onMenuOpenChange
}: ActivityLayoutProps) {
  const { forgeChoices } = content;
  const forgeOptions = [
    { value: EVERY_FORGE_VALUE, label: 'All forges' },
    ...forgeChoices.segments.map((choice) => ({ value: choice.trackerId, label: choice.project })),
  ];
  const forgeMenu = <ForgeMenu choices={forgeChoices} menuIsOpen={menuIsOpen} onForgeChoice={onForgeChoice} onMenuOpenChange={onMenuOpenChange} />;
  return (
    <div className="gaia-activity">
      <div className="gaia-activity-filters">
        <span className="gaia-visually-hidden" id={KIND_LABEL_ID}>Kind</span>
        <SegmentedControl<ActivityKindFilter> labelledBy={KIND_LABEL_ID} options={kindOptionsOf(content.kindCounts)} selected={kindFilter} onSelect={onKindFilter} />
        <span className="gaia-visually-hidden" id={FORGE_LABEL_ID}>Forge</span>
        <SegmentedControl
          labelledBy={FORGE_LABEL_ID}
          options={forgeOptions}
          selected={forgeChoices.chosen ?? EVERY_FORGE_VALUE}
          onSelect={(value) => onForgeChoice(value === EVERY_FORGE_VALUE ? null : value)}
          {...(forgeChoices.inMenu.length === 0 ? {} : { trailing: forgeMenu })}
        />
      </div>
      <div className="gaia-activity-columns">
        <section className="gaia-activity-entries" aria-label="Entries">
          {content.emptySentence === null
            ? <DataTable label="Activity" columns={COLUMNS} columnWidths={COLUMN_WIDTHS} rows={tableRowsOf(content.rows)} rowHeight="compact" inset="wide" />
            : <EmptyState text={content.emptySentence} />}
          <p className="gaia-activity-footnote">{FOOTNOTE}</p>
        </section>
        <aside className="gaia-activity-side" aria-label="Today">
          <TodaySection head="Landed today" list={content.landedToday} tone="success" />
          <TodaySection head="Tokens today" list={content.tokensToday} tone="neutral" />
          <UsageSection lines={content.usageLines} linesAtTheLimit={content.usageLinesAtTheLimit} />
        </aside>
      </div>
    </div>
  );
}

export interface ActivityViewProps {
  readonly fleetDocument: FleetDocument;
  /** The page's clock: the time zone clock times are shown in. */
  readonly clock:         ClockReading;
}

export function ActivityView({ fleetDocument, clock }: ActivityViewProps) {
  const [filters, setFilters] = useState<ActivityFilters>(EVERY_ENTRY);
  const [menuIsOpen, setMenuIsOpen] = useState(false);
  const content = useMemo(() => ActivityModel.activityContentOf(fleetDocument, filters, clock), [fleetDocument, filters, clock]);
  return (
    <ActivityLayout
      content={content}
      kindFilter={filters.kind}
      menuIsOpen={menuIsOpen}
      onKindFilter={(kind) => setFilters((current) => ({ ...current, kind }))}
      onForgeChoice={(trackerId) => {
        setFilters((current) => ({ ...current, trackerId }));
        setMenuIsOpen(false);
      }}
      onMenuOpenChange={setMenuIsOpen}
    />
  );
}

/** Before the first fleet document the title and its lead stand alone. */
export function activityViewPartsOf(fleetDocument: FleetDocument | null, clock: ClockReading): ViewParts {
  return {
    title:   TITLE,
    lead:    LEAD,
    figures: fleetDocument === null ? [] : ActivityModel.titleFiguresOf(fleetDocument),
    actions: null,
    content: fleetDocument === null ? null : <ActivityView fleetDocument={fleetDocument} clock={clock} />,
  };
}
