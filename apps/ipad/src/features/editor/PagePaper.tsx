import type { Page } from "@nibnote/shared";
import { Image } from "expo-image";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { thumbnailFile } from "../../db/files";
import { colors } from "../../theme/colors";
import { repairThumbnailIfMissing } from "./thumbnailRepair";
import { useThumbnailVersion } from "./thumbnailVersions";

/** Pages are always white paper in v1.0 (the canvas renders in light appearance). */
const PAPER = "#FFFFFF";

type PagePaperProps = {
  readonly page: Page;
  /** The box the page is fitted into, keeping its own shape. */
  readonly boxWidth: number;
  readonly boxHeight: number;
  readonly highlighted: boolean;
};

/**
 * A page's thumbnail on white paper, as large as fits the box. Shared by the strip and the grid.
 * Square corners on purpose: rounding them needs a mask (overflow: hidden), which costs every
 * visible thumbnail an offscreen render pass and made the strip hitch while scrolling.
 */
export function PagePaper({ page, boxWidth, boxHeight, highlighted }: PagePaperProps) {
  const version = useThumbnailVersion(page.id);
  // A purged Caches folder leaves pages without thumbnails; rebuild them as they come on screen.
  useEffect(() => {
    repairThumbnailIfMissing(page);
  }, [page]);
  const scale = Math.min(boxWidth / page.widthPt, boxHeight / page.heightPt);
  // A page that was never saved has no thumbnail file yet; it shows as blank paper.
  const hasThumbnail = page.thumbnailPath !== null || version > 0;
  return (
    <View style={{ width: boxWidth, height: boxHeight, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: page.widthPt * scale,
          height: page.heightPt * scale,
          backgroundColor: PAPER,
          borderWidth: highlighted ? 3 : StyleSheet.hairlineWidth,
          borderColor: highlighted ? colors.tint : colors.separator,
        }}
      >
        {hasThumbnail && (
          <Image
            source={{
              uri: thumbnailFile(page.id).uri,
              // The file is rewritten in place, so a new save or render must not show the old image;
              // and it is decoded at this box's size, so the strip and the grid each cache their own.
              cacheKey: `${page.id}:${page.drawingHash ?? "new"}:${String(version)}:${String(Math.round(boxWidth))}`,
            }}
            // Decode at the displayed size. Otherwise every full-size thumbnail is shrunk on the GPU
            // with mipmaps (expo-image uses trilinear filtering), which made the grid hitch.
            enforceEarlyResizing
            cachePolicy="memory"
            recyclingKey={page.id}
            contentFit="contain"
            transition={0}
            style={{ flex: 1 }}
          />
        )}
      </View>
    </View>
  );
}
