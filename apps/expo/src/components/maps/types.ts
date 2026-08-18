export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

export interface CanteenMapPoint extends MapCoordinate {
  id: string;
  name: string;
}

export interface DeliveryMapProps {
  canteen: MapCoordinate & { name: string };
  otherCanteens: CanteenMapPoint[];
  delivery: MapCoordinate & { name: string };
  deliverer: MapCoordinate | null;
  route: MapCoordinate[];
  showUserLocation: boolean;
}
