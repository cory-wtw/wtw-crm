import { z } from "zod";

export const PIPELINE_STAGES = [
  "found",
  "connected",
  "filed",
  "won",
  "lost",
] as const;

export const pipelineStageSchema = z.enum(PIPELINE_STAGES);
export type PipelineStage = z.infer<typeof pipelineStageSchema>;

export const PIPELINE_LABELS: Record<PipelineStage, string> = {
  found: "Found",
  connected: "Connected",
  filed: "Filed",
  won: "Won",
  lost: "Lost",
};

export const PIPELINE_DESCRIPTIONS: Record<PipelineStage, string> = {
  found: "Field Scout makes first contact.",
  connected: "Warm handoff to VSO partner. Appointment confirmed.",
  filed: "VSO submits the claim. Scout maintains contact.",
  won: "Benefits approved. Monthly tax-free income flowing.",
  lost: "Pipeline closed out.",
};

export const pipelineHistoryEntrySchema = z.object({
  stage: pipelineStageSchema,
  enteredAt: z.date(),
  byUid: z.string(),
});
export type PipelineHistoryEntry = z.infer<typeof pipelineHistoryEntrySchema>;
