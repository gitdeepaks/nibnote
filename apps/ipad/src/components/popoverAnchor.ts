import type { GestureResponderEvent } from "react-native";

/** The native view tag of the pressed element, used to anchor an action sheet popover on iPad. */
export function anchorOf(event: GestureResponderEvent): number | null {
  const tag = Number(event.nativeEvent.target);
  return Number.isFinite(tag) ? tag : null;
}
