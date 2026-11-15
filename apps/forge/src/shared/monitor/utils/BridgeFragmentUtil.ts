/**
 * How a Bridge route is written: `#<tab>` or `#<tab>/<item>`, and a detail form's item `<form>/<id>`. The Bridge's router and the monitor
 * snapshot write a route alike, so a monitor's link opens what the Bridge's own link opens.
 */

/** Each segment of the item is encoded on its own, so an item's own `/` reads as a separator in the address bar. */
function fragmentOf(tab: string, item: string | null): string {
  return item === null ? `#${tab}` : `#${tab}/${item.split('/').map(encodeURIComponent).join('/')}`;
}

function detailItemTextOf(form: string, id: string): string {
  return `${form}/${id}`;
}

export const BridgeFragmentUtil = Object.freeze({ fragmentOf, detailItemTextOf });
