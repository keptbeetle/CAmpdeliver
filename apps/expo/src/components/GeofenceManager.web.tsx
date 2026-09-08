/**
 * Browsers do not provide Android-style background geofencing. The shared web
 * screens still calculate availability from the current foreground location;
 * native registration remains isolated in GeofenceManager.native.tsx.
 */
export function GeofenceManager() {
  return null;
}
