/**
 * A compact button whose leading glyph carries the state of the work it starts (`done`, `again`, `busy`, `fetch`, `restart`) and changes in
 * place, so the button never moves; the glyph's motions are in its stylesheet. A count, such as how many items wait, follows the label.
 */
import { Button } from '../atoms/Button.tsx';

export type StatusGlyph = 'done' | 'again' | 'busy' | 'fetch' | 'restart';

export interface StatusButtonProps {
  readonly label:           string;
  readonly glyph:           StatusGlyph;
  readonly emphasis?:       'quiet' | 'primary';
  /** Work it started is on its way: it keeps its look, and a press calls nothing. */
  readonly busy?:           boolean;
  readonly disabled?:       boolean;
  /** A short count after the label, such as "3". */
  readonly count?:          string;
  /** The name when the label and the count alone do not say it, such as "Example, 3 waiting". */
  readonly accessibleName?: string;
  readonly onPress:         () => void;
}

const CHECK_POINTS = '3.5 8.5 6.6 11.5 12.5 4.8';
const AGAIN_PATH = 'M13 8a5 5 0 1 1-1.5-3.6';
const AGAIN_HEAD = '13 2.6 13 5.4 10.2 5.4';
const RESTART_PATH = 'M3 8a5 5 0 1 0 1.5-3.6';
const RESTART_HEAD = '3 2.6 3 5.4 5.8 5.4';

function AgainDrawing({ overlay }: { readonly overlay: boolean }) {
  return (
    <svg className={overlay ? 'design-system-status-button-again-overlay' : 'design-system-status-button-again'} viewBox="0 0 16 16" aria-hidden="true">
      <path d={AGAIN_PATH} />
      <polyline points={AGAIN_HEAD} />
    </svg>
  );
}

function GlyphDrawing({ glyph }: { readonly glyph: StatusGlyph }) {
  switch (glyph) {
    case 'done':
      return (
        <>
          <svg className="design-system-status-button-check" viewBox="0 0 16 16" aria-hidden="true"><polyline points={CHECK_POINTS} /></svg>
          <AgainDrawing overlay />
        </>
      );
    case 'again':
      return <AgainDrawing overlay={false} />;
    case 'busy':
      return <span className="design-system-status-button-spinner" aria-hidden="true" />;
    case 'fetch':
      return (
        <svg className="design-system-status-button-fetch" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 2.5v7.5" />
          <polyline points="4.8 7 8 10.2 11.2 7" />
          <path d="M3 13.3h10" />
        </svg>
      );
    case 'restart':
      return (
        <svg className="design-system-status-button-restart" viewBox="0 0 16 16" aria-hidden="true">
          <path d={RESTART_PATH} />
          <polyline points={RESTART_HEAD} />
        </svg>
      );
  }
}

export function StatusButton({
  label, glyph, emphasis = 'quiet', busy = false, disabled = false, count, accessibleName, onPress
}: StatusButtonProps) {
  const flagAttribute = (isSet: boolean) => (isSet ? '' : undefined);
  return (
    <span
      className="design-system-status-button"
      data-glyph={glyph}
      data-primary={flagAttribute(emphasis === 'primary')}
      data-off={flagAttribute(busy || disabled)}
    >
      <Button
        compact
        label={label}
        emphasis={emphasis}
        busy={busy}
        disabled={disabled}
        onPress={onPress}
        // A new glyph mounts anew, so it pops in, and a check draws itself in, on a change of glyph only, never on a render.
        leading={<span key={glyph} className="design-system-status-button-glyph"><GlyphDrawing glyph={glyph} /></span>}
        {...(count === undefined ? {} : { trailing: <span className="design-system-status-button-count">{count}</span> })}
        {...(accessibleName === undefined ? {} : { accessibleName })}
      />
      {busy && emphasis === 'primary' ? <span className="design-system-status-button-band" aria-hidden="true" /> : null}
      {glyph === 'done' ? <span key="done" className="design-system-status-button-wash" aria-hidden="true" /> : null}
    </span>
  );
}
