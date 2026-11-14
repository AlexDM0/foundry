/** What the sensors read from the host's page, and the attributes they write on the host's habitat elements for the host to style. */
export const SENSORS = {
  /** A press on Flint that moves further than this is a drag; less is a click. */
  DRAG_THRESHOLD_PIXELS:  5,
  /** On each registered habitat element; its value is the habitat's kind. */
  HABITAT_ATTRIBUTE:      'data-sprite-habitat',
  /** On the habitat below the pointer while the user carries Flint, so the host can outline the drop target. */
  DROP_TARGET_ATTRIBUTE:  'data-sprite-drop-target',
  PRIMARY_POINTER_BUTTON: 0,
} as const;

/** The stored habitat is `<version><separator><kind>`; an empty kind is the home. */
export const STORED_HABITAT_SEPARATOR = ':';
