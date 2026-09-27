import { migrationBundle } from "@nibnote/db";
import { StyleSheet, Text } from "react-native";
import { useRepository } from "../../db/DatabaseProvider";

/** Dev-only line on the home screen confirming the local database booted (Phase 2, M1). */
export function DatabaseStatus() {
  const repository = useRepository();
  const notebookCount = repository.notebooks.list({ kind: "all" }).length;
  const migrations = migrationBundle.journal.entries.length;
  return (
    <Text style={styles.status}>
      {`Database ready · ${String(notebookCount)} notebooks · ${String(migrations)} migration(s) applied`}
    </Text>
  );
}

const styles = StyleSheet.create({
  status: { fontSize: 13, color: "#34C759" },
});
