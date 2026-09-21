/**
 * Customer recording is the master switch. A missing DID override preserves
 * the legacy default-on behavior whenever customer recording is enabled.
 */
export function resolveDidRecordingEnabled(
  customerRecordingEnabled: boolean | null | undefined,
  numberRecordingOverride: boolean | null | undefined,
): boolean {
  return (
    (customerRecordingEnabled ?? false) && (numberRecordingOverride ?? true)
  );
}
