/**
 * The spacing scale of the package: the gaps, paddings and margins the graphite-and-orange designs use. A step is named for its size, so a
 * call site reads as the design does (`gap="eight"` is the designs' `gap: 8px`). Each step is the custom property of `styles/tokens.css`
 * that holds its value, so the stylesheets and the spacing props read one scale; `Spacing.spec.ts` holds the two in step.
 */
export const SPACING = Object.freeze({
  none:        'var(--space-0)',
  one:         'var(--space-1)',
  two:         'var(--space-2)',
  three:       'var(--space-3)',
  four:        'var(--space-4)',
  five:        'var(--space-5)',
  six:         'var(--space-6)',
  seven:       'var(--space-7)',
  eight:       'var(--space-8)',
  nine:        'var(--space-9)',
  ten:         'var(--space-10)',
  eleven:      'var(--space-11)',
  twelve:      'var(--space-12)',
  thirteen:    'var(--space-13)',
  fourteen:    'var(--space-14)',
  sixteen:     'var(--space-16)',
  eighteen:    'var(--space-18)',
  twenty:      'var(--space-20)',
  twentyTwo:   'var(--space-22)',
  twentyFour:  'var(--space-24)',
  twentyEight: 'var(--space-28)',
  thirtyTwo:   'var(--space-32)',
});

export type SpacingStep = keyof typeof SPACING;
