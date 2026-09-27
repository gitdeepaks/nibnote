import { PAGE_SIZES, type PageTemplate } from "@nibnote/shared";
import { z } from "zod";

// Choices in the New Notebook sheet. Picker selections come back from native SwiftUI, so they are
// parsed with these enums before use.

export const PageSizeKey = z.enum(["a4Portrait", "a4Landscape", "letter", "whiteboard"]);
export type PageSizeKey = z.infer<typeof PageSizeKey>;

export const PAGE_SIZE_OPTIONS: readonly { readonly key: PageSizeKey; readonly label: string }[] = [
  { key: "a4Portrait", label: "A4" },
  { key: "a4Landscape", label: "A4 Landscape" },
  { key: "letter", label: "Letter" },
  { key: "whiteboard", label: "Whiteboard" },
];

export function pageSizeFor(key: PageSizeKey) {
  return PAGE_SIZES[key];
}

export const TemplateKey = z.enum(["blank", "lined", "grid", "dotted", "cornell"]);
export type TemplateKey = z.infer<typeof TemplateKey>;

export const TEMPLATE_OPTIONS: readonly { readonly key: TemplateKey; readonly label: string }[] = [
  { key: "blank", label: "Blank" },
  { key: "lined", label: "Lined" },
  { key: "grid", label: "Grid" },
  { key: "dotted", label: "Dotted" },
  { key: "cornell", label: "Cornell" },
];

export function templateFor(key: TemplateKey): PageTemplate {
  switch (key) {
    case "blank":
      return { kind: "blank" };
    case "lined":
      return { kind: "lined", spacingPt: 24 };
    case "grid":
      return { kind: "grid", spacingPt: 20 };
    case "dotted":
      return { kind: "dotted", spacingPt: 16 };
    case "cornell":
      return { kind: "cornell" };
  }
}
