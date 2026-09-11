export function distanceMetres(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMetres = 6_371_000;
  const phi1 = toRad(latitudeA);
  const phi2 = toRad(latitudeB);
  const deltaPhi = toRad(latitudeB - latitudeA);
  const deltaLambda = toRad(longitudeB - longitudeA);
  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return earthRadiusMetres * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isDeliveryQuestEligible({
  availabilityEnabled,
  selectedCanteenIds,
  canteenId,
  latitude,
  longitude,
  canteenLatitude,
  canteenLongitude,
  pickupRadiusMetres,
}: {
  availabilityEnabled: boolean;
  selectedCanteenIds: readonly string[];
  canteenId: string | null;
  latitude: number;
  longitude: number;
  canteenLatitude: number;
  canteenLongitude: number;
  pickupRadiusMetres: number;
}) {
  if (
    !availabilityEnabled ||
    !canteenId ||
    !selectedCanteenIds.includes(canteenId)
  ) {
    return false;
  }
  return (
    distanceMetres(latitude, longitude, canteenLatitude, canteenLongitude) <=
    pickupRadiusMetres
  );
}
