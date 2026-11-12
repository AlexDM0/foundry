/** Gaia's mark: a circle between two arcs, stroked in the current colour. It is decoration; the name beside it carries the meaning. */
const DEFAULT_SIZE_PIXELS = 22;

export interface GaiaMarkProps {
  readonly sizePixels?: number;
}

export function GaiaMark({ sizePixels = DEFAULT_SIZE_PIXELS }: GaiaMarkProps) {
  return (
    <svg className="gaia-mark" aria-hidden="true" width={sizePixels} height={sizePixels} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="11" cy="11" r="4" />
      <path d="M2.5 11a8.5 8.5 0 0 1 14.5-6" />
      <path d="M19.5 11a8.5 8.5 0 0 1-14.5 6" />
    </svg>
  );
}
