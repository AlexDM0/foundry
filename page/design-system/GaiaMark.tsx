/**
 * Gaia's mark (COMPONENT_LIBRARY 3.1): a tile with a globe ring opened at the top right, where Forge's orange node sits, and an orange
 * core, drawn on a 64-unit grid in the mark's tokens of each theme. It is decoration; the link or the name beside it carries the meaning.
 * Every mark on a page draws the same gradient and mask, so one id for each serves them all.
 */
const DEFAULT_SIZE_PIXELS = 28;

export interface GaiaMarkProps {
  /** 28 in the brand bar and a notification, 22 in the window bar, 88 on the splash, 128 and 64 for the app icon. */
  readonly sizePixels?: number;
}

export function GaiaMark({ sizePixels = DEFAULT_SIZE_PIXELS }: GaiaMarkProps) {
  return (
    <svg className="gaia-mark" aria-hidden="true" width={sizePixels} height={sizePixels} viewBox="0 0 64 64">
      <defs>
        <linearGradient id="gaia-mark-ground" x1="0" y1="0" x2="1" y2="1">
          <stop className="gaia-mark-ground-from" offset="0" />
          <stop className="gaia-mark-ground-to" offset="1" />
        </linearGradient>
        <mask id="gaia-mark-gap" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect className="gaia-mark-mask-open" width="64" height="64" />
          <circle className="gaia-mark-mask-shut" cx="44.4" cy="19.6" r="10.4" />
        </mask>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="13" fill="url(#gaia-mark-ground)" />
      <g mask="url(#gaia-mark-gap)">
        <circle className="gaia-mark-ring" cx="32" cy="32" r="17.5" fill="none" strokeWidth="5" />
      </g>
      <circle className="gaia-mark-core" cx="32" cy="32" r="6.4" />
      <circle className="gaia-mark-node-ring" cx="44.4" cy="19.6" r="7.1" fill="none" strokeWidth="2.6" />
      <circle className="gaia-mark-node-core" cx="44.4" cy="19.6" r="3.3" />
      <rect className="gaia-mark-rim" x="1.5" y="1.5" width="61" height="61" rx="12.5" fill="none" />
    </svg>
  );
}
