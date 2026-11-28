/** What a reader of `hephaestus.log` takes from a stored line: when it was logged, its kind, and the sentence it was worded as. */
export interface StoredHephaestusLogLine {
  readonly at:      string;
  readonly kind:    string;
  readonly details: string;
}
