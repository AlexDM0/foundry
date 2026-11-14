/**
 * The direct spacing props of a layout component, turned into the inline style React sets through the DOM style object, each value the
 * spacing token of its step. Each side takes its most specific prop: a side prop wins over an axis prop, which wins over the all-sides
 * prop. Only the four longhands are set, so a caller's side never fights a shorthand.
 */
import type { CSSProperties } from 'react';

import { SPACING, type SpacingStep } from '../constants/Spacing.ts';

export interface PaddingProps {
  readonly padding?:           SpacingStep;
  readonly paddingHorizontal?: SpacingStep;
  readonly paddingVertical?:   SpacingStep;
  readonly paddingTop?:        SpacingStep;
  readonly paddingBottom?:     SpacingStep;
  readonly paddingLeft?:       SpacingStep;
  readonly paddingRight?:      SpacingStep;
}

export interface MarginProps {
  readonly margin?:           SpacingStep;
  readonly marginHorizontal?: SpacingStep;
  readonly marginVertical?:   SpacingStep;
  readonly marginTop?:        SpacingStep;
  readonly marginBottom?:     SpacingStep;
  readonly marginLeft?:       SpacingStep;
  readonly marginRight?:      SpacingStep;
}

type Side = 'Top' | 'Bottom' | 'Left' | 'Right';

interface SideSteps {
  readonly all:        SpacingStep | undefined;
  readonly horizontal: SpacingStep | undefined;
  readonly vertical:   SpacingStep | undefined;
  readonly sides:      Readonly<Record<Side, SpacingStep | undefined>>;
}

function sideValuesOf(steps: SideSteps): Partial<Record<Side, string>> {
  const sideValues: Partial<Record<Side, string>> = {};
  for (const side of ['Top', 'Bottom', 'Left', 'Right'] as const) {
    const axisStep = side === 'Top' || side === 'Bottom' ? steps.vertical : steps.horizontal;
    const step = steps.sides[side] ?? axisStep ?? steps.all;
    if (step !== undefined) sideValues[side] = SPACING[step];
  }
  return sideValues;
}

function prefixedStyleOf(property: 'padding' | 'margin', sideValues: Partial<Record<Side, string>>): CSSProperties {
  return Object.fromEntries(Object.entries(sideValues).map(([side, value]) => [`${property}${side}`, value]));
}

export const SpacingStyleUtil = Object.freeze({
  paddingStyleOf(props: PaddingProps): CSSProperties {
    return prefixedStyleOf('padding', sideValuesOf({
      all:        props.padding,
      horizontal: props.paddingHorizontal,
      vertical:   props.paddingVertical,
      sides:      {
        Top: props.paddingTop, Bottom: props.paddingBottom, Left: props.paddingLeft, Right: props.paddingRight
      },
    }));
  },

  marginStyleOf(props: MarginProps): CSSProperties {
    return prefixedStyleOf('margin', sideValuesOf({
      all:        props.margin,
      horizontal: props.marginHorizontal,
      vertical:   props.marginVertical,
      sides:      {
        Top: props.marginTop, Bottom: props.marginBottom, Left: props.marginLeft, Right: props.marginRight
      },
    }));
  },

  gapStyleOf(gap: SpacingStep | undefined): CSSProperties {
    return gap === undefined ? {} : { gap: SPACING[gap] };
  },
});
