/**
 * Flint's brain as Gaia's only Flint-related mark: a 7 px square outline turned 45 degrees, orange while the brain is asked for or runs, and
 * neutral once it ended. The package draws no diamond, so Gaia draws it. Decoration only: the word beside it says what it is.
 */
export interface BrainDiamondProps {
  readonly ended?: boolean;
}

export function BrainDiamond({ ended = false }: BrainDiamondProps) {
  return <span className="gaia-brain-diamond" data-ended={ended ? '' : undefined} aria-hidden="true" />;
}
