export type Transition = "none" | "down" | "recovered";

/**
 * Pure state machine for incident transitions.
 *
 * `prevSuccess` is the success flag of the most recent prior check,
 * `null` when there is no history. `nextSuccess` is the current check.
 *
 *   null  -> true   => "none"        (first check, healthy)
 *   null  -> false  => "down"        (first check, failing)
 *   true  -> true   => "none"        (staying up)
 *   true  -> false  => "down"        (just went down -> open incident)
 *   false -> false  => "none"        (still down)
 *   false -> true   => "recovered"   (back up -> close incident)
 */
export function nextTransition(
  prevSuccess: boolean | null,
  nextSuccess: boolean,
): Transition {
  if (nextSuccess) {
    return prevSuccess === false ? "recovered" : "none";
  }
  return prevSuccess === false ? "none" : "down";
}
