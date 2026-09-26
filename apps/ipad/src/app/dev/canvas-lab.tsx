import type {
  DrawingChangedEvent,
  DrawingPolicy,
  PageTemplate,
  PencilActionEvent,
} from "@nibnote/shared";
import { Redirect } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  PencilCanvas,
  type PencilCanvasRef,
} from "../../../modules/pencil-canvas";
import { LabButton, LabChips } from "../../features/canvas-lab/LabChips";
import {
  DEFAULT_TEMPLATE,
  LAB_COLORS,
  LAB_PAGES,
  LAB_TEMPLATES,
  LAB_TOOL_LABELS,
  LAB_WIDTHS,
  drawingUriFor,
  toolFor,
  type LabToolKey,
} from "../../features/canvas-lab/presets";

const TOOL_CHIPS = Object.entries(LAB_TOOL_LABELS).flatMap(([value, label]) =>
  isLabToolKey(value) ? [{ label, value }] : [],
);

function isLabToolKey(value: string): value is LabToolKey {
  return Object.hasOwn(LAB_TOOL_LABELS, value);
}

const EMPTY_STATUS = {
  strokeCount: 0,
  canUndo: false,
  canRedo: false,
  hasUnsavedChanges: false,
};

/** Dev-only test bench for the Phase 1 exit criteria. Removed when the Phase 2 editor lands. */
export default function CanvasLab() {
  const canvasRef = useRef<PencilCanvasRef>(null);
  const [page, setPage] = useState(LAB_PAGES[0]);
  const [template, setTemplate] = useState<PageTemplate>(DEFAULT_TEMPLATE);
  const [toolKey, setToolKey] = useState<LabToolKey>("pen");
  const [previousToolKey, setPreviousToolKey] = useState<LabToolKey>("pen");
  const [color, setColor] = useState(LAB_COLORS[0]);
  const [widthScale, setWidthScale] = useState<number>(1);
  const [policy, setPolicy] = useState<DrawingPolicy>("pencilOnly");
  const [systemPicker, setSystemPicker] = useState(false);
  const [status, setStatus] =
    useState<Omit<DrawingChangedEvent, "pageId">>(EMPTY_STATUS);
  const [log, setLog] = useState("Ready");

  if (!__DEV__ || page === undefined || color === undefined) {
    return <Redirect href="/" />;
  }

  const selectTool = (next: LabToolKey) => {
    setPreviousToolKey(toolKey);
    setToolKey(next);
  };

  const handlePencilAction = (event: PencilActionEvent) => {
    setLog(`Pencil ${event.kind} → ${event.preferredAction}`);
    switch (event.preferredAction) {
      case "switchEraser":
        selectTool(
          toolKey === "strokeEraser" || toolKey === "pixelEraser"
            ? previousToolKey
            : "strokeEraser",
        );
        return;
      case "switchPrevious":
        selectTool(previousToolKey);
        return;
      case "ignore":
      case "showColorPalette":
      case "showInkAttributes":
      case "showContextualPalette":
      case "runSystemShortcut":
        return;
    }
  };

  const save = async () => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const start = performance.now();
    try {
      const result = await canvas.save();
      const ms = (performance.now() - start).toFixed(0);
      setLog(
        `Saved ${String(result.strokeCount)} strokes in ${ms} ms (incl. bridge) · sha ${result.sha256.slice(0, 8)}`,
      );
    } catch (error) {
      setLog(
        `Save failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  };

  const run = (label: string, action: () => Promise<void>) => {
    void (async () => {
      try {
        await action();
      } catch (error) {
        setLog(
          `${label} failed: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    })();
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.toolbar}>
        <LabChips
          title="Page"
          chips={LAB_PAGES.map((item) => ({ label: item.label, value: item }))}
          selected={page}
          onSelect={(next) => {
            setPage(next);
            setStatus(EMPTY_STATUS);
          }}
        />
        <LabChips
          title="Template"
          chips={LAB_TEMPLATES.map((item) => ({
            label: item.label,
            value: item.template,
          }))}
          selected={template}
          onSelect={setTemplate}
        />
        <LabChips
          title="Tool"
          chips={TOOL_CHIPS}
          selected={toolKey}
          onSelect={selectTool}
        />
        <LabChips
          title="Colour"
          chips={LAB_COLORS.map((item) => ({ label: item.label, value: item }))}
          selected={color}
          onSelect={setColor}
        />
        <LabChips
          title="Width"
          chips={LAB_WIDTHS.map((item) => ({
            label: item.label,
            value: item.scale,
          }))}
          selected={widthScale}
          onSelect={setWidthScale}
        />
        <LabChips
          title="Input"
          chips={[
            { label: "Pencil only", value: "pencilOnly" },
            { label: "Any input", value: "anyInput" },
          ]}
          selected={policy}
          onSelect={setPolicy}
        />
        <View style={styles.actions}>
          <LabButton
            label="Undo"
            disabled={!status.canUndo}
            onPress={() => {
              run("Undo", () => canvasRef.current?.undo() ?? Promise.resolve());
            }}
          />
          <LabButton
            label="Redo"
            disabled={!status.canRedo}
            onPress={() => {
              run("Redo", () => canvasRef.current?.redo() ?? Promise.resolve());
            }}
          />
          <LabButton
            label="Save now"
            onPress={() => {
              run("Save", save);
            }}
          />
          <LabButton
            label="+500 strokes"
            onPress={() => {
              run(
                "Fill",
                () =>
                  canvasRef.current?.debugFillStrokes(500) ?? Promise.resolve(),
              );
            }}
          />
          <LabButton
            label="+2000 strokes"
            onPress={() => {
              run(
                "Fill",
                () =>
                  canvasRef.current?.debugFillStrokes(2000) ??
                  Promise.resolve(),
              );
            }}
          />
          <LabButton
            label={systemPicker ? "Hide PKToolPicker" : "Show PKToolPicker"}
            onPress={() => {
              setSystemPicker(!systemPicker);
            }}
          />
        </View>
        <Text style={styles.status}>
          {`${String(status.strokeCount)} strokes · ${status.hasUnsavedChanges ? "unsaved" : "saved"} · ${log}`}
        </Text>
      </View>
      <PencilCanvas
        ref={canvasRef}
        style={styles.canvas}
        pageId={page.pageId}
        drawingFileUri={drawingUriFor(page)}
        pageSize={page.size}
        template={template}
        tool={toolFor(toolKey, color.hex, widthScale)}
        drawingPolicy={policy}
        debugSystemToolPicker={systemPicker}
        onDrawingChanged={(event) => {
          setStatus({
            strokeCount: event.strokeCount,
            canUndo: event.canUndo,
            canRedo: event.canRedo,
            hasUnsavedChanges: event.hasUnsavedChanges,
          });
        }}
        onPencilAction={handlePencilAction}
        onCanvasError={(event) => {
          setLog(`Canvas error ${event.code}: ${event.message}`);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F2F2F7" },
  toolbar: { gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 2 },
  status: { fontSize: 12, color: "#3A3A3C" },
  canvas: { flex: 1 },
});
