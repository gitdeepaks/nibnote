import type { Folder } from "@nibnote/shared";
import { FlashList } from "@shopify/flash-list";
import { useLiveRead } from "../../db/useLiveRead";
import { EmptyState, LoadingState } from "../../components/EmptyState";
import { NotebookCard } from "./NotebookCard";
import { notebookFilter, sectionParam, type LibrarySection } from "./sections";

const CARD_MIN_WIDTH = 190;

type NotebookGridProps = {
  readonly section: Exclude<LibrarySection, { kind: "trash" }>;
  readonly folders: readonly Folder[];
  /** Width available to the grid; columns follow the live window size (Split View, Stage Manager). */
  readonly width: number;
  readonly onCreate: () => void;
};

export function NotebookGrid({ section, folders, width, onCreate }: NotebookGridProps) {
  const filter = notebookFilter(section);
  const library = useLiveRead(
    ["notebooks", "pages"],
    (repo) => ({
      notebooks: repo.notebooks.list(filter),
      pageCounts: repo.pages.countsByNotebook(),
      now: Date.now(),
    }),
    sectionParam(section),
  );

  if (library.status === "loading") return <LoadingState />;
  if (library.status === "error") {
    return (
      <EmptyState
        icon="exclamationmark.triangle"
        title="Couldn't load notebooks"
        message={library.message}
        action={null}
      />
    );
  }
  const { notebooks, pageCounts, now } = library.value;
  if (notebooks.length === 0) {
    return section.kind === "favourites" ? (
      <EmptyState
        icon="star"
        title="No favourites"
        message="Long press a notebook and add it to Favourites."
        action={null}
      />
    ) : section.kind === "recents" ? (
      <EmptyState icon="clock" title="Nothing opened yet" message="Notebooks you open appear here." action={null} />
    ) : (
      <EmptyState
        icon="book.closed"
        title="No notebooks"
        message="Create a notebook to start writing."
        action={{ label: "New Notebook", onPress: onCreate }}
      />
    );
  }

  const columns = Math.max(2, Math.floor((width - 32) / CARD_MIN_WIDTH));
  return (
    <FlashList
      key={columns}
      data={notebooks}
      numColumns={columns}
      keyExtractor={(notebook) => notebook.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16 }}
      renderItem={({ item }) => (
        <NotebookCard notebook={item} pageCount={pageCounts.get(item.id) ?? 0} now={now} folders={folders} />
      )}
    />
  );
}
