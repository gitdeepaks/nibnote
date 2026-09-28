// Geometry of the page grid. Every cell has the same size, so positions are plain arithmetic:
// no measuring, and dragging can hit-test any point, including cells that aren't rendered.

const MIN_CELL_WIDTH = 170;
const PADDING = 16;
/** Space under the thumbnail for the page number. */
const LABEL_HEIGHT = 28;
/** A4 portrait; other page shapes fit inside this box. */
const PAGE_BOX_RATIO = 842 / 595;

export type GridLayout = {
  readonly columns: number;
  readonly padding: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  /** The thumbnail box inside a cell. */
  readonly boxWidth: number;
  readonly boxHeight: number;
};

export function gridLayout(width: number): GridLayout {
  const inner = Math.max(width - PADDING * 2, MIN_CELL_WIDTH);
  const columns = Math.max(2, Math.floor(inner / MIN_CELL_WIDTH));
  const cellWidth = inner / columns;
  const boxWidth = cellWidth - 24;
  const boxHeight = boxWidth * PAGE_BOX_RATIO;
  return {
    columns,
    padding: PADDING,
    cellWidth,
    cellHeight: boxHeight + LABEL_HEIGHT + 16,
    boxWidth,
    boxHeight,
  };
}

/** Top-left of cell `index` in content coordinates (before scrolling). */
export function cellOrigin(
  layout: GridLayout,
  index: number,
): { readonly x: number; readonly y: number } {
  return {
    x: layout.padding + (index % layout.columns) * layout.cellWidth,
    y: layout.padding + Math.floor(index / layout.columns) * layout.cellHeight,
  };
}

/** The cell index under a point in content coordinates, clamped to the page count. */
export function indexAt(
  layout: GridLayout,
  x: number,
  y: number,
  count: number,
): number {
  const column = Math.min(
    Math.max(Math.floor((x - layout.padding) / layout.cellWidth), 0),
    layout.columns - 1,
  );
  const row = Math.max(Math.floor((y - layout.padding) / layout.cellHeight), 0);
  return Math.min(row * layout.columns + column, Math.max(count - 1, 0));
}
