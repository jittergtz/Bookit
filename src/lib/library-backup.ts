import { validateDeviceLibrary } from "./device-database";
import type { Library } from "./model";

export const MAX_BACKUP_FILE_BYTES = 20_000_000;

export function createLibraryBackup(library: Library): string {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    library: validateDeviceLibrary(library),
  });
}

export function parseLibraryBackup(raw: string): Library {
  if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_FILE_BYTES) {
    throw new Error("Backup file is too large.");
  }
  const parsed = JSON.parse(raw);
  // Old backups may be indented JSON or contain the library without a wrapper.
  return validateDeviceLibrary(parsed.library ?? parsed);
}
