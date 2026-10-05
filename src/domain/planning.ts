import { z } from 'zod';
export const candidateSchema = z.object({
  name: z.string().min(1).max(160), unit: z.string().min(1).max(30),
  target: z.number().finite().nonnegative().nullable(), forecast: z.number().finite().nonnegative().nullable(),
  forecastNote: z.string().max(2000), definition: z.string().min(1).max(3000),
  aggregation: z.enum(['cumulative-snapshot', 'period-sum', 'ratio', 'qualitative']), direction: z.enum(['higher', 'lower']),
  rubric: z.string().max(2000), standardId: z.string().max(100).nullable(),
  blockId: z.string().min(1).max(200), quote: z.string().min(1).max(1500), uncertainty: z.string().max(2000),
}).strict();
export const planningResultSchema = z.object({ summary: z.string().max(2000), candidates: z.array(candidateSchema).max(8) }).strict();
export type PlanningCandidate = z.infer<typeof candidateSchema>;
export type PlanningResult = z.infer<typeof planningResultSchema>;
