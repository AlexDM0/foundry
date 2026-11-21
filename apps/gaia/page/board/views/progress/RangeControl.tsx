/**
 * The Progress chart's range, above the chart: the presets and Custom… as one segmented control, the range they draw with its tick size,
 * and a mark once the rows shown changed under a held range. Custom… opens the custom range popover under the control and takes the focus
 * back when it closes from inside.
 */

import {
  useCallback,
  useId,
  useRef,
  useState
} from 'react';
import { MicroCapsLabel, type SegmentOption, SegmentedControl } from '../../../lib/design-system/DesignSystemInterface.ts';

import { CustomRangePopover } from './CustomRangePopover.tsx';
import {
  CUSTOM_RANGE_PRESET,
  FIT_RANGE_PRESET,
  RANGE_PRESET_KEYS,
  type RangePresetKey
} from './constants/ProgressChart.ts';
import type { StoredViewOverride } from './utils/ChartPreferenceUtil.ts';
import { RangePresetUtil }         from './utils/RangePresetUtil.ts';

type RangeSegment = RangePresetKey | typeof CUSTOM_RANGE_PRESET;

const RANGE_SEGMENTS: readonly SegmentOption<RangeSegment>[] = [
  ...RANGE_PRESET_KEYS.map((presetKey) => ({
    value: presetKey,
    label: RangePresetUtil.modeLabelOf(presetKey),
    ...presetKey === FIT_RANGE_PRESET ? { accessibleName: 'Fit the rows shown' } : {},
  })),
  { value: CUSTOM_RANGE_PRESET, label: 'Custom…' },
];

const ROWS_CHANGED_UNDER_HELD_RANGE = 'The rows shown changed under this held range; Fit follows them';

/** The fields of the chart model the range control reads. */
export interface RangeControlChart {
  readonly pressedPreset:  string;
  readonly modeIsHeld:     boolean;
  readonly modeTitle:      string;
  readonly rangeNoteText:  string;
  readonly rangeNoteTitle: string;
}

export interface RangeControlProps {
  readonly chart:                     RangeControlChart;
  readonly appliedOverride:           StoredViewOverride;
  readonly rowsChangedUnderHeldRange: boolean;
  readonly todayCalendarDate:         string;
  readonly resolveBound:              (text: string) => number | null;
  readonly onApply:                   (override: StoredViewOverride) => void;
}

function pressedSegmentOf(pressedPreset: string): RangeSegment | null {
  return RANGE_SEGMENTS.find((segment) => segment.value === pressedPreset)?.value ?? null;
}

export function RangeControl({
  chart, appliedOverride, rowsChangedUnderHeldRange, todayCalendarDate, resolveBound, onApply
}: RangeControlProps) {
  const labelElementId = useId();
  const [customRangeIsOpen, setCustomRangeIsOpen] = useState(false);
  const customSegmentRef = useRef<HTMLButtonElement | null>(null);
  const closeCustomRange = useCallback((returnFocus: boolean) => {
    setCustomRangeIsOpen(false);
    if (returnFocus) customSegmentRef.current?.focus();
  }, []);
  const chooseSegment = (segment: RangeSegment): void => {
    if (segment === CUSTOM_RANGE_PRESET) setCustomRangeIsOpen(true);
    else onApply(RangePresetUtil.overrideOfPreset(segment, appliedOverride));
  };

  return (
    <div className="board-progress-range">
      <MicroCapsLabel text="Range" id={labelElementId} />
      <SegmentedControl
        labelledBy={labelElementId}
        options={RANGE_SEGMENTS}
        selected={pressedSegmentOf(chart.pressedPreset)}
        size="standard"
        optionRef={(segment, element) => {
          if (segment === CUSTOM_RANGE_PRESET) customSegmentRef.current = element;
        }}
        onSelect={chooseSegment}
      />
      <span className="board-progress-range-ends" data-held={chart.modeIsHeld ? '' : undefined} title={`${chart.rangeNoteTitle}\n${chart.modeTitle}`}>
        {chart.rangeNoteText}
      </span>
      {rowsChangedUnderHeldRange
        ? <span className="board-progress-range-changed" role="img" aria-label={ROWS_CHANGED_UNDER_HELD_RANGE} title={ROWS_CHANGED_UNDER_HELD_RANGE} />
        : null}
      {customRangeIsOpen
        ? (
          <CustomRangePopover
            appliedOverride={appliedOverride}
            resolveBound={resolveBound}
            todayCalendarDate={todayCalendarDate}
            onApply={onApply}
            onClose={closeCustomRange}
          />
        )
        : null}
    </div>
  );
}
