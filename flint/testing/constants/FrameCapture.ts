/** The stage, the times and the folder of the frame capture, `flint/testing/CaptureFlintFrames.ts`. */
export const FRAME_CAPTURE_STAGE = {
  VIEWPORT_WIDTH_PIXELS:  300,
  VIEWPORT_HEIGHT_PIXELS: 200,
  /** Each CSS pixel is this many pixels of the picture, so a thin line is still several pixels wide. */
  DEVICE_SCALE_FACTOR:    2,
  PIXELS_FOR_ONE_UNIT:    2,
  /** The floor Flint stands on, from the top of the viewport. */
  FLOOR_Y_PIXELS:         180,
  /** Narrower than Flint, so the wander holds it in the middle and it never walks out of the picture. */
  HOME_WIDTH_PIXELS:      10,
  GROUND_COLOUR:          '#f6f6f6',
} as const;

/**
 * The stage of a behaviour that takes an element (`chase-bug`, `lay-bar-along`): at one pixel for one unit, a home as wide as the picture,
 * so the behaviour has room to move, and the host's element as a grey bar above the floor, to the right of where Flint stands. In CSS
 * pixels of the viewport.
 */
export const ELEMENT_BEHAVIOUR_STAGE = {
  PIXELS_FOR_ONE_UNIT:   1,
  HOME_LEFT_PIXELS:      10,
  HOME_WIDTH_PIXELS:     280,
  ELEMENT_LEFT_PIXELS:   180,
  ELEMENT_TOP_PIXELS:    140,
  ELEMENT_WIDTH_PIXELS:  100,
  ELEMENT_HEIGHT_PIXELS: 10,
  ELEMENT_COLOUR:        '#d9d9d9',
  ELEMENT_RADIUS_PIXELS: 3,
} as const;

export const FRAME_CAPTURE_TIMING = {
  FRAME_MILLISECONDS:                16,
  /** The default moments after the intent is given; each is a whole number of frames. */
  DEFAULT_MOMENTS_MILLISECONDS:      [160, 640, 1296, 2608],
  /** Under reduced motion a gesture holds its still moment; this long after the intent the easing has settled on it. */
  STILL_MOMENT_CAPTURE_MILLISECONDS: 1504,
  /** The count of an attendant the capture shows when it is asked for one. */
  DEFAULT_ATTENDANT_COUNT:           4,
} as const;

/** A pixel whose channels differ by no more than this between two pictures counts as anti-aliasing noise. */
export const FRAME_COMPARISON = { NOISE_CHANNEL_DIFFERENCE: 24 } as const;

export const FRAME_CAPTURE_FOLDERS = {
  /** Relative to the repository root; git ignores `.claude/.evidence/`. */
  EVIDENCE_FOLDER: '.claude/.evidence/flint-frames',
} as const;

/** The Chrome or Chromium the capture drives, the macOS applications first, then one on the PATH. */
export const CHROME_LOCATIONS = {
  APPLICATION_PATHS: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  COMMAND_NAMES: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'],
} as const;
