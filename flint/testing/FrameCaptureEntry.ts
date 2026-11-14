/**
 * The page side of `flint/testing/CaptureFlintFrames.ts`, bundled for the browser: it shows one moment of Flint through `createFlint` on a
 * manual frame source, and compares two pictures. A behaviour that takes an element is shown on a wide home with the host's element drawn
 * as a grey bar, which `perform` is given. It installs `flintCapture` on the page when it loads, since it is the bundle's entry.
 */
import type { FlintHandle }                  from '../CreateFlint.ts';
import { createFlint }                       from '../CreateFlint.ts';
import { SPRITE_ATTENDANTS, SPRITE_INTENTS } from '../SpriteHabitat.ts';
import { behaviourOfIntent }                 from '../behaviours/BehaviourCatalog.ts';
import { createManualFrameSource }           from './ManualFrameSource.ts';
import {
  ELEMENT_BEHAVIOUR_STAGE,
  FRAME_CAPTURE_STAGE,
  FRAME_CAPTURE_TIMING,
  FRAME_COMPARISON
} from './constants/FrameCapture.ts';

export type CaptureFacing = 'right' | 'left';

export interface FrameRequest {
  /** Null shows Flint idle. */
  readonly intent:        string | null;
  /** An attendant shown at the default count; null shows none. */
  readonly attendant:     string | null;
  readonly facing:        CaptureFacing;
  readonly milliseconds:  number;
  readonly reducedMotion: boolean;
}

export interface PictureDifference {
  readonly differingPixels:          number;
  /** Pixels that differ by more than anti-aliasing noise. */
  readonly pixelsBeyondNoise:        number;
  readonly largestChannelDifference: number;
  readonly sizesDiffer:              boolean;
}

export interface FlintCapture {
  readonly intents:      () => readonly string[];
  readonly attendants:   () => readonly string[];
  /** Returns what `perform` or `attend` answered, or `idle`. */
  readonly showFrame:    (request: FrameRequest) => string;
  readonly differenceOf: (firstPictureAddress: string, secondPictureAddress: string) => Promise<PictureDifference>;
}

let shownFlint: FlintHandle | null = null;

interface Stage {
  readonly home:             HTMLElement;
  /** The host's element a behaviour is given; null on the stage of every other subject. */
  readonly element:          HTMLElement | null;
  readonly pixelsForOneUnit: number;
}

function placedBox(left: number, top: number, width: number, height: number): HTMLElement {
  const box = document.createElement('div');
  box.style.position = 'absolute';
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  box.style.width = `${width}px`;
  box.style.height = `${height}px`;
  document.body.appendChild(box);
  return box;
}

function stageFor(takesElement: boolean): Stage {
  document.body.replaceChildren();
  document.body.style.margin = '0';
  document.body.style.background = FRAME_CAPTURE_STAGE.GROUND_COLOUR;
  if (!takesElement) {
    const left = (FRAME_CAPTURE_STAGE.VIEWPORT_WIDTH_PIXELS - FRAME_CAPTURE_STAGE.HOME_WIDTH_PIXELS) / 2;
    const home = placedBox(left, 0, FRAME_CAPTURE_STAGE.HOME_WIDTH_PIXELS, FRAME_CAPTURE_STAGE.FLOOR_Y_PIXELS);
    return { home, element: null, pixelsForOneUnit: FRAME_CAPTURE_STAGE.PIXELS_FOR_ONE_UNIT };
  }
  const home = placedBox(ELEMENT_BEHAVIOUR_STAGE.HOME_LEFT_PIXELS, 0, ELEMENT_BEHAVIOUR_STAGE.HOME_WIDTH_PIXELS, FRAME_CAPTURE_STAGE.FLOOR_Y_PIXELS);
  const element = placedBox(
    ELEMENT_BEHAVIOUR_STAGE.ELEMENT_LEFT_PIXELS,
    ELEMENT_BEHAVIOUR_STAGE.ELEMENT_TOP_PIXELS,
    ELEMENT_BEHAVIOUR_STAGE.ELEMENT_WIDTH_PIXELS,
    ELEMENT_BEHAVIOUR_STAGE.ELEMENT_HEIGHT_PIXELS,
  );
  element.style.background = ELEMENT_BEHAVIOUR_STAGE.ELEMENT_COLOUR;
  element.style.borderRadius = `${ELEMENT_BEHAVIOUR_STAGE.ELEMENT_RADIUS_PIXELS}px`;
  return { home, element, pixelsForOneUnit: ELEMENT_BEHAVIOUR_STAGE.PIXELS_FOR_ONE_UNIT };
}

function showFrame(request: FrameRequest): string {
  shownFlint?.destroy();
  const takesElement = request.intent !== null && (behaviourOfIntent(request.intent)?.element ?? 'none') !== 'none';
  const stage = stageFor(takesElement);
  const frames = createManualFrameSource();
  const flint = createFlint({
    root:             document.body,
    home:             stage.home,
    frameSource:      frames.frameSource,
    pixelsForOneUnit: stage.pixelsForOneUnit,
    reducedMotion:    () => request.reducedMotion,
  });
  shownFlint = flint;
  frames.advance(FRAME_CAPTURE_TIMING.FRAME_MILLISECONDS);
  if (request.facing === 'left') flint.steer('face-left');
  const attended = request.attendant === null ? null : flint.attend(request.attendant, FRAME_CAPTURE_TIMING.DEFAULT_ATTENDANT_COUNT);
  const performed = (intent: string): string => (stage.element === null ? flint.perform(intent) : flint.perform(intent, stage.element));
  const verdict = request.intent === null ? attended ?? 'idle' : performed(request.intent);
  const frameCount = Math.round(request.milliseconds / FRAME_CAPTURE_TIMING.FRAME_MILLISECONDS);
  for (let i = 0; i < frameCount; i++) frames.advance(FRAME_CAPTURE_TIMING.FRAME_MILLISECONDS);
  return verdict;
}

async function pixelsOf(pictureAddress: string): Promise<ImageData> {
  const picture = new Image();
  picture.src = pictureAddress;
  await picture.decode();
  const canvas = document.createElement('canvas');
  canvas.width = picture.naturalWidth;
  canvas.height = picture.naturalHeight;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('the page has no 2d canvas');
  context.drawImage(picture, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

async function differenceOf(firstPictureAddress: string, secondPictureAddress: string): Promise<PictureDifference> {
  const [first, second] = await Promise.all([pixelsOf(firstPictureAddress), pixelsOf(secondPictureAddress)]);
  if (first.width !== second.width || first.height !== second.height) {
    return {
      differingPixels: 0, pixelsBeyondNoise: 0, largestChannelDifference: 0, sizesDiffer: true,
    };
  }
  const channelsPerPixel = 4;
  let differingPixels = 0;
  let pixelsBeyondNoise = 0;
  let largestChannelDifference = 0;
  for (let pixel = 0; pixel < first.data.length; pixel += channelsPerPixel) {
    let largestHere = 0;
    for (let channel = 0; channel < channelsPerPixel; channel++) {
      largestHere = Math.max(largestHere, Math.abs((first.data[pixel + channel] ?? 0) - (second.data[pixel + channel] ?? 0)));
    }
    if (largestHere > 0) differingPixels++;
    if (largestHere > FRAME_COMPARISON.NOISE_CHANNEL_DIFFERENCE) pixelsBeyondNoise++;
    largestChannelDifference = Math.max(largestChannelDifference, largestHere);
  }
  return {
    differingPixels, pixelsBeyondNoise, largestChannelDifference, sizesDiffer: false,
  };
}

const FLINT_CAPTURE: FlintCapture = Object.freeze({
  intents: () => [...SPRITE_INTENTS], attendants: () => [...SPRITE_ATTENDANTS], showFrame, differenceOf,
});

Object.assign(globalThis, { flintCapture: FLINT_CAPTURE });
