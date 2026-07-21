import { z } from "zod";

export type ImportPayload = {
  work?: Record<
    string,
    {
      start?: string;
      stop?: string;
      breaks?: Array<{ name?: string; mins?: number }>;
      netMins?: number;
      holiday?: boolean;
      publicHoliday?: boolean;
      sickLeave?: boolean;
    }
  >;
  comp?: Record<string, { mins?: number; note?: string }>;
};

const breakInputSchema = z.object({
  name: z.string().max(120).optional(),
  mins: z.number().int().min(0).max(1440).optional(),
});

const dayInputSchema = z.object({
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().max(8).optional(),
  stop_time: z.string().max(8).optional(),
  net_mins: z.number().int().min(0).max(1440).optional(),
  holiday: z.boolean().optional(),
  public_holiday: z.boolean().optional(),
  sick_leave: z.boolean().optional(),
  breaks: z.array(breakInputSchema).max(20).optional(),
});

const importPayloadSchema = z.object({
  work: z
    .record(
      z.string(),
      z.object({
        start: z.string().max(8).optional(),
        stop: z.string().max(8).optional(),
        breaks: z.array(breakInputSchema).max(20).optional(),
        netMins: z.number().int().min(0).max(1440).optional(),
        holiday: z.boolean().optional(),
        publicHoliday: z.boolean().optional(),
        sickLeave: z.boolean().optional(),
      }),
    )
    .optional(),
  comp: z
    .record(
      z.string(),
      z.object({
        mins: z.number().int().min(0).max(1440).optional(),
        note: z.string().max(500).optional(),
      }),
    )
    .optional(),
});

export const postPayloadSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save_day"), day: dayInputSchema }),
  z.object({ action: z.literal("reset_day"), work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ action: z.literal("fill_missing"), work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({
    action: z.literal("set_comp"),
    work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    mins: z.number().int().min(0).max(1440),
    note: z.string().max(500).optional(),
  }),
  z.object({ action: z.literal("import_json"), data: importPayloadSchema }),
  z.object({ action: z.literal("export_json") }),
]);

export type PostPayload = z.infer<typeof postPayloadSchema>;
