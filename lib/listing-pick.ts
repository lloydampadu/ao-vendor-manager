// What every dropdown listing form shares (oils & fluids, batteries): the picker's "Not in the list"
// choice, the already-listed message, and how a typed name is matched.

export const NOT_LISTED = "Not in the list";
export const ALREADY_LISTED_MESSAGE = "You already list this. Edit your existing listing.";

/** A typed name and a listed one are the same name whatever their case or surrounding spaces. */
export const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
