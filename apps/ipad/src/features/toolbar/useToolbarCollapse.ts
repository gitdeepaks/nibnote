import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** How long after the last stroke the full toolbar comes back. */
const EXPAND_DELAY_MS = 1500;

/**
 * The toolbar shrinks to a pill while a tool touches the page and comes back 1.5 s after the last
 * stroke; a new stroke in between keeps it small. Off while VoiceOver runs: a control that moves
 * away under the user's focus would be lost.
 */
export function useToolbarCollapse() {
  const screenReader = useScreenReader();
  const [collapsed, setCollapsed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => cancelTimer, []);

  return {
    collapsed: collapsed && !screenReader,
    /** From the canvas's `onToolUsage`. */
    toolUsage: (active: boolean) => {
      cancelTimer();
      if (screenReader) return;
      if (active) {
        setCollapsed(true);
        return;
      }
      timer.current = setTimeout(() => {
        timer.current = null;
        setCollapsed(false);
      }, EXPAND_DELAY_MS);
    },
    /** Tapping the pill brings the toolbar back at once. */
    expand: () => {
      cancelTimer();
      setCollapsed(false);
    },
  };
}

function useScreenReader(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const run = { cancelled: false };
    void AccessibilityInfo.isScreenReaderEnabled().then((value) => {
      if (!run.cancelled) setEnabled(value);
    });
    const subscription = AccessibilityInfo.addEventListener("screenReaderChanged", setEnabled);
    return () => {
      run.cancelled = true;
      subscription.remove();
    };
  }, []);
  return enabled;
}

/** Whether the user asked iOS to reduce motion: animations then fade instead of scaling. */
export function useReduceMotion(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const run = { cancelled: false };
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (!run.cancelled) setEnabled(value);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setEnabled);
    return () => {
      run.cancelled = true;
      subscription.remove();
    };
  }, []);
  return enabled;
}
