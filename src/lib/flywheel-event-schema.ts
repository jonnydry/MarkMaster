import { z } from "zod";

const flywheelPrimitiveSchema = z.union([
  z.string().trim().max(240),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

// One level of nesting for grouped metrics (signalQuality, suggestionOutcomes,
// hybrid). Scan-quality aggregation reads these back as nested records.
const flywheelPayloadValueSchema = z.union([
  flywheelPrimitiveSchema,
  z
    .record(z.string().trim().min(1).max(40), flywheelPrimitiveSchema)
    .superRefine((value, ctx) => {
      if (Object.keys(value).length > 16) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Nested payload has too many fields",
        });
      }
    }),
]);

export const flywheelEventSchema = z.object({
  eventType: z.enum([
    "cta.review_in_orbit",
    "cta.digest_review_together",
    "feedback.good",
    "feedback.not_relevant",
    "mode.quick",
    "mode.deep",
    "digest.session_start",
    "quick.keep",
    "orbit.scan.completed",
    "orbit.scan.failed",
    "orbit.review.applied",
  ]),
  payload: z
    .record(z.string().trim().min(1).max(40), flywheelPayloadValueSchema)
    .superRefine((value, ctx) => {
      if (Object.keys(value).length > 24) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Payload has too many fields",
        });
      }
    })
    .nullable()
    .optional(),
});
