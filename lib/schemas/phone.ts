import { z } from "zod";

export const PHONE_STATUSES = [
  "available",
  "assigned",
  "returned",
  "lost",
  "retired",
] as const;
export const phoneStatusSchema = z.enum(PHONE_STATUSES);
export type PhoneStatus = z.infer<typeof phoneStatusSchema>;

export const PHONE_STATUS_LABELS: Record<PhoneStatus, string> = {
  available: "Available",
  assigned: "Assigned",
  returned: "Returned",
  lost: "Lost",
  retired: "Retired",
};

export const phoneSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Required"),
  imeiSerial: z.string().optional(),
  status: phoneStatusSchema.default("available"),
  assignedVeteranId: z.string().nullable().default(null),
  dateAssigned: z.date().nullable().default(null),
  dateReturned: z.date().nullable().default(null),
  notes: z.string().optional(),
  createdBy: z.string(),
  createdAt: z.date(),
  updatedBy: z.string(),
  updatedAt: z.date(),
});
export type Phone = z.infer<typeof phoneSchema>;

export const phoneInputSchema = phoneSchema.omit({
  id: true,
  createdBy: true,
  createdAt: true,
  updatedBy: true,
  updatedAt: true,
});
export type PhoneInput = z.infer<typeof phoneInputSchema>;
