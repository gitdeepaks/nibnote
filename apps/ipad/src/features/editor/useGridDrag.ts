import type { PageId } from "@nibnote/shared";
import { useLayoutEffect, useRef, useState } from "react";
import { Animated, PanResponder, type GestureResponderEvent, type HostInstance } from "react-native";
import { cellOrigin, indexAt, type GridLayout } from "./gridLayout";

// Drag to reorder with React Native's own PanResponder and Animated (no Reanimated: it would add
// 1.2 MB to the bundle). A long press lifts the page; the grid container then captures the touch,
// a floating copy follows the finger, and the list auto-scrolls near its top and bottom edges.

/** Distance from the top or bottom edge where auto-scrolling starts, and its top speed per frame. */
const EDGE = 80;
const MAX_SCROLL_STEP = 18;

export type GridDrag = { readonly pageId: PageId; readonly fromIndex: number; readonly targetIndex: number };

type GridDragOptions = {
  readonly layout: GridLayout;
  readonly count: number;
  readonly scrollTo: (offset: number) => void;
  readonly onDrop: (pageId: PageId, targetIndex: number) => void;
};

type Session = {
  drag: GridDrag | null;
  /** The container became the touch responder (the finger moved after the long press). */
  captured: boolean;
  grabX: number;
  grabY: number;
  fingerX: number;
  fingerY: number;
  scrollY: number;
  windowX: number;
  windowY: number;
  viewportHeight: number;
  frame: number | null;
};

export function useGridDrag({ layout, count, scrollTo, onDrop }: GridDragOptions) {
  const [drag, setDrag] = useState<GridDrag | null>(null);
  const [ghost] = useState(() => new Animated.ValueXY());
  const containerRef = useRef<HostInstance>(null);
  const session = useRef<Session>({
    drag: null,
    captured: false,
    grabX: 0,
    grabY: 0,
    fingerX: 0,
    fingerY: 0,
    scrollY: 0,
    windowX: 0,
    windowY: 0,
    viewportHeight: 0,
    frame: null,
  });
  // The pan handlers are created once; they read the latest layout and callbacks from here.
  const latest = useRef({ layout, count, scrollTo, onDrop });
  useLayoutEffect(() => {
    latest.current = { layout, count, scrollTo, onDrop };
  });

  const retarget = () => {
    const current = session.current;
    if (current.drag === null) return;
    const { layout: grid, count: total } = latest.current;
    const targetIndex = indexAt(grid, current.fingerX, current.fingerY + current.scrollY, total);
    if (targetIndex === current.drag.targetIndex) return;
    current.drag = { ...current.drag, targetIndex };
    setDrag(current.drag);
  };

  const stopAutoScroll = () => {
    const current = session.current;
    if (current.frame !== null) cancelAnimationFrame(current.frame);
    current.frame = null;
  };

  const autoScroll = () => {
    const current = session.current;
    const step =
      current.fingerY < EDGE
        ? -MAX_SCROLL_STEP * ((EDGE - current.fingerY) / EDGE)
        : current.fingerY > current.viewportHeight - EDGE
          ? MAX_SCROLL_STEP * ((current.fingerY - (current.viewportHeight - EDGE)) / EDGE)
          : 0;
    if (step === 0 || current.drag === null) {
      stopAutoScroll();
      return;
    }
    const { layout: grid, count: total } = latest.current;
    const contentHeight = grid.padding * 2 + Math.ceil(total / grid.columns) * grid.cellHeight;
    const maxScroll = Math.max(contentHeight - current.viewportHeight, 0);
    const next = Math.min(Math.max(current.scrollY + step, 0), maxScroll);
    if (next !== current.scrollY) {
      current.scrollY = next;
      latest.current.scrollTo(next);
      retarget();
    }
    current.frame = requestAnimationFrame(autoScroll);
  };

  const moveTo = (pageX: number, pageY: number) => {
    const current = session.current;
    current.fingerX = pageX - current.windowX;
    current.fingerY = pageY - current.windowY;
    ghost.setValue({ x: current.fingerX - current.grabX, y: current.fingerY - current.grabY });
    retarget();
    if (current.frame === null) current.frame = requestAnimationFrame(autoScroll);
  };

  const finish = () => {
    const current = session.current;
    stopAutoScroll();
    const done = current.drag;
    current.drag = null;
    current.captured = false;
    setDrag(null);
    if (done !== null && done.targetIndex !== done.fromIndex) latest.current.onDrop(done.pageId, done.targetIndex);
  };

  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: () => session.current.drag !== null,
      onPanResponderGrant: () => {
        session.current.captured = true;
      },
      onPanResponderMove: (event) => {
        moveTo(event.nativeEvent.pageX, event.nativeEvent.pageY);
      },
      onPanResponderRelease: finish,
      onPanResponderTerminate: finish,
      onPanResponderTerminationRequest: () => false,
    }),
  );

  return {
    drag,
    ghost,
    containerRef,
    panHandlers: responder.panHandlers,
    /** Keep in sync with the list's scroll offset. */
    setScrollY: (y: number) => {
      session.current.scrollY = y;
    },
    /** Call from the container's onLayout: where it sits in the window, and its height. */
    measure: () => {
      containerRef.current?.measureInWindow((x, y, _width, height) => {
        session.current.windowX = x;
        session.current.windowY = y;
        session.current.viewportHeight = height;
      });
    },
    /** A long press lifts the page at `index`. */
    lift: (pageId: PageId, index: number, event: GestureResponderEvent) => {
      const current = session.current;
      const origin = cellOrigin(latest.current.layout, index);
      const cellX = origin.x;
      const cellY = origin.y - current.scrollY;
      current.fingerX = event.nativeEvent.pageX - current.windowX;
      current.fingerY = event.nativeEvent.pageY - current.windowY;
      current.grabX = current.fingerX - cellX;
      current.grabY = current.fingerY - cellY;
      ghost.setValue({ x: cellX, y: cellY });
      current.drag = { pageId, fromIndex: index, targetIndex: index };
      current.captured = false;
      setDrag(current.drag);
    },
    /** The finger lifted without moving after the long press: nothing to drop. */
    releaseIfStill: () => {
      if (session.current.drag !== null && !session.current.captured) finish();
    },
  };
}
