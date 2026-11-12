/**
 * Work under way with no measure of how far it got: a progress bar with no value, drawn as a turning ring or as a band that runs along a
 * track. Its name says what is under way.
 */
export interface BusyIndicatorProps {
  readonly shape:          'spinner' | 'bar';
  readonly accessibleName: string;
}

export function BusyIndicator({ shape, accessibleName }: BusyIndicatorProps) {
  return <span className="bridge-busy" role="progressbar" aria-label={accessibleName} data-shape={shape} />;
}
