/**
 * A flow's zoom: zoom out, the zoom as text, zoom in, then Fit. A step button at its bound is disabled; Fit always works.
 */
import { Button } from './Button.tsx';

export interface ZoomControlProps {
  /** The zoom as shown, such as "100%". */
  readonly zoomText:     string;
  readonly onZoomOut:    () => void;
  readonly onZoomIn:     () => void;
  readonly onFit:        () => void;
  readonly zoomOutLabel: string;
  readonly zoomInLabel:  string;
  readonly fitLabel:     string;
  readonly canZoomOut:   boolean;
  readonly canZoomIn:    boolean;
}

export function ZoomControl({
  zoomText, onZoomOut, onZoomIn, onFit, zoomOutLabel, zoomInLabel, fitLabel, canZoomOut, canZoomIn
}: ZoomControlProps) {
  return (
    <span className="bridge-zoom">
      <span className="bridge-zoom-steps">
        <button type="button" className="bridge-zoom-step" aria-label={zoomOutLabel} disabled={!canZoomOut} onClick={onZoomOut}>−</button>
        <output className="bridge-zoom-value">{zoomText}</output>
        <button type="button" className="bridge-zoom-step" aria-label={zoomInLabel} disabled={!canZoomIn} onClick={onZoomIn}>+</button>
      </span>
      <Button label={fitLabel} onPress={onFit} />
    </span>
  );
}
