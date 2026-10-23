/** Strips Electron's IPC wrapper so users see the original message. */
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+': Error:\s*/, '');
}
