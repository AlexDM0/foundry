/**
 * A small line drawing on a 16 by 16 grid, stroked in the colour of what holds it. Each name says what is drawn, never what it stands for.
 * With a label it is an image of that name; with `null` it is hidden from the accessibility tree, for a drawing whose meaning is printed
 * beside it.
 */
export type IconName =
  | 'hammer' | 'magnifier' | 'inbox' | 'lifebuoy' | 'flow' | 'merge' | 'cycle' | 'document' | 'dot' | 'paper-plane' | 'narrowing-lines';

/** The path data of each drawing, one `path` per entry. */
export const ICON_PATHS: Readonly<Record<IconName, readonly string[]>> = Object.freeze({
  hammer:    ['M2.5 13.5L9.5 6.5', 'M9 2L14 7L12 9L7 4Z'],
  magnifier: ['M10.5 6.5a4 4 0 1 1-8 0a4 4 0 1 1 8 0Z', 'M9.5 9.5L14 14'],
  inbox:     ['M2 9v4.5h12V9', 'M8 2v7', 'M5 6l3 3l3-3'],
  lifebuoy:  [
    'M14 8a6 6 0 1 1-12 0a6 6 0 1 1 12 0Z',
    'M10.5 8a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0Z',
    'M9.8 6.2L12.2 3.8 M9.8 9.8L12.2 12.2 M6.2 9.8L3.8 12.2 M6.2 6.2L3.8 3.8',
  ],
  flow:  ['M1.5 1.5h4v4h-4Z', 'M10.5 1.5h4v4h-4Z', 'M6 10.5h4v4H6Z', 'M3.5 5.5V8h9V5.5 M8 8v2.5'],
  merge: [
    'M5.25 3a1.25 1.25 0 1 1-2.5 0a1.25 1.25 0 1 1 2.5 0Z',
    'M13.25 3a1.25 1.25 0 1 1-2.5 0a1.25 1.25 0 1 1 2.5 0Z',
    'M9.25 13a1.25 1.25 0 1 1-2.5 0a1.25 1.25 0 1 1 2.5 0Z',
    'M4 4.25V6l4 3.5 M12 4.25V6L8 9.5V11.75',
  ],
  cycle: [
    'M2.5 8A5.5 5.5 0 0 1 12.75 5.25',
    'M13.4 2.85L12.75 5.25L10.35 4.6',
    'M13.5 8A5.5 5.5 0 0 1 3.25 10.75',
    'M2.6 13.15L3.25 10.75L5.65 11.4',
  ],
  document:          ['M3.5 1.5h6l3 3v10h-9Z', 'M9.5 1.5v3h3', 'M5.5 8.5h5 M5.5 11h5'],
  dot:               ['M10.5 8a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0Z'],
  'paper-plane':     ['M13.8 2.2L2.2 7.1L7.1 8.9L8.9 13.8Z', 'M13.8 2.2L7.1 8.9'],
  /** Three lines, each shorter than the one above. */
  'narrowing-lines': ['M2 4h12M4 8h8M6 12h4'],
});

export interface IconProps {
  readonly name:  IconName;
  /** The image's accessible name; `null` hides the drawing, when the same meaning is printed beside it. */
  readonly label: string | null;
}

export function Icon({ name, label }: IconProps) {
  const accessibility = label === null ? { 'aria-hidden': true } : { 'role': 'img', 'aria-label': label };
  return (
    <svg className="design-system-icon" viewBox="0 0 16 16" data-icon={name} {...accessibility}>
      {ICON_PATHS[name].map((pathData) => <path key={pathData} d={pathData} />)}
    </svg>
  );
}
