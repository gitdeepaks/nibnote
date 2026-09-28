import type { RepositoryError } from "@nibnote/db";
import type { Result } from "@nibnote/shared";
import { Alert } from "react-native";

function describe(error: RepositoryError): string {
  switch (error.code) {
    case "notFound":
      return `That ${error.entity} no longer exists.`;
    case "folderTooDeep":
      return "Folders can be nested one level deep.";
    case "lastPage":
      return "A notebook needs at least one page.";
  }
}

/** Shows a failed repository call to the user; failures are never dropped silently. */
export function reportFailure<T>(
  result: Result<T, RepositoryError>,
  action: string,
): result is Extract<Result<T, RepositoryError>, { ok: true }> {
  if (!result.ok) Alert.alert(`Couldn't ${action}`, describe(result.error));
  return result.ok;
}
