/**
 * The banners the board shows above its header: Hephaestus unreachable while the event stream is down, in the error
 * colours (a lost session is Gaia's own page banner); launches held for an install change in the held orange; and Hephaestus's warnings
 * (in the error colours) and notices.
 */
import { Banner } from '../../lib/design-system/DesignSystemInterface.ts';

export interface ConnectionBannersProps {
  readonly streamIsDown:       boolean;
  /** When the last whole board arrived, as the browser's local time; `null` before the first. */
  readonly boardShownAsOf:     string | null;
  /** Hephaestus's own 423 sentence when a command brought it, otherwise `null` while held by the board's word, `undefined` when not held. */
  readonly installHeldRefusal: string | null | undefined;
  readonly warnings:           readonly string[];
  readonly notices:            readonly string[];
}

export function ConnectionBanners({
  streamIsDown, boardShownAsOf, installHeldRefusal, warnings, notices
}: ConnectionBannersProps) {
  return (
    <>
      {streamIsDown
        ? (
          <div className="board-shell-banner">
            <Banner
              tone="error"
              role="alert"
              lead="Hephaestus unreachable."
              text={`Reconnecting; ${boardShownAsOf === null ? 'no board received yet' : `showing the board as of ${boardShownAsOf}`}.`}
            />
          </div>
        )
        : null}
      {installHeldRefusal === undefined
        ? null
        : (
          <div className="board-shell-banner">
            <Banner
              tone="warn"
              role="alert"
              lead="Launches held."
              text={installHeldRefusal ?? 'The install version changed, so launches are held until the board is updated.'}
            />
          </div>
        )}
      {warnings.length === 0 ? null : (
        <ul className="board-banners" aria-label={`${warnings.length} warnings`}>
          {warnings.map((warning) => <Banner key={warning} tone="error" element="li" text={warning} />)}
        </ul>
      )}
      {notices.length === 0 ? null : (
        <ul className="board-banners" aria-label={`${notices.length} notices`}>
          {notices.map((notice) => <Banner key={notice} tone="warn" element="li" text={notice} />)}
        </ul>
      )}
    </>
  );
}
