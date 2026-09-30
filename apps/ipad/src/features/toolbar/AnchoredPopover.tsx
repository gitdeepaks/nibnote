import { Host, Popover, RNHostView } from "@expo/ui/swift-ui";
import type { ReactElement, ReactNode } from "react";

/** Where the popover opens relative to its button: above a bottom toolbar, beside a side one. */
export type PopoverSide = "above" | "below" | "leading" | "trailing";

const PLACEMENT = {
  above: { attachmentAnchor: "top", arrowEdge: "bottom" },
  below: { attachmentAnchor: "bottom", arrowEdge: "top" },
  leading: { attachmentAnchor: "leading", arrowEdge: "trailing" },
  trailing: { attachmentAnchor: "trailing", arrowEdge: "leading" },
} as const;

type AnchoredPopoverProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly side: PopoverSide;
  /** The toolbar button the popover points at. */
  readonly anchor: ReactElement;
  /**
   * SwiftUI content (a `VStack` of native controls). React Native parts go inside `RNHostView`s
   * within it: a SwiftUI control nested inside a hosted React Native view never gets its touches.
   */
  readonly content: ReactNode;
};

/**
 * A system popover (SwiftUI) anchored to one of our React Native toolbar buttons. The system gives
 * it the iPadOS look, the arrow and tap-outside dismissal.
 */
export function AnchoredPopover({ open, onOpenChange, side, anchor, content }: AnchoredPopoverProps) {
  return (
    <Host matchContents>
      <Popover isPresented={open} onIsPresentedChange={onOpenChange} {...PLACEMENT[side]}>
        <Popover.Trigger>
          <RNHostView matchContents>{anchor}</RNHostView>
        </Popover.Trigger>
        <Popover.Content>{content}</Popover.Content>
      </Popover>
    </Host>
  );
}
