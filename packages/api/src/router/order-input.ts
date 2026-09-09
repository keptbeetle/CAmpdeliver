import { z } from "zod/v4";

const latitudeSchema = z.number().finite().min(-90).max(90);
const longitudeSchema = z.number().finite().min(-180).max(180);

export const createOrderInputSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            menuItemId: z.string().uuid(),
            quantity: z.number().int().positive().max(20),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    canteenId: z.string().uuid(),
    deliveryLocationName: z.string().trim().min(1).max(200),
    deliveryLatitude: latitudeSchema,
    deliveryLongitude: longitudeSchema,
  })
  .strict();

export const updateDelivererLocationInputSchema = z
  .object({
    orderId: z.string().uuid(),
    latitude: latitudeSchema,
    longitude: longitudeSchema,
  })
  .strict();
