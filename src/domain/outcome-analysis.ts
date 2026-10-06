import { z } from 'zod';
import type { EvidenceRef } from './types';

const number = z.number().finite().nonnegative().nullable();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v).nullable();
export const outcomeCandidateSchema = z.object({
  indicatorId: z.string().min(1).max(100), value: number, denominator: number,
  assessment: z.enum(['not-yet', 'partial', 'achieved']).nullable(),
  asOf: date, periodStart: date, blockId: z.string().max(200).nullable(),
  location: z.string().trim().min(1).max(300), quote: z.string().trim().min(1).max(1500),
  explanation: z.string().trim().min(1).max(2000), uncertainty: z.string().max(1500),
}).strict();
export const outcomeResultSchema = z.object({summary: z.string().max(2000), candidates: z.array(outcomeCandidateSchema).max(8)}).strict();
export type OutcomeCandidate = z.infer<typeof outcomeCandidateSchema>;
export type OutcomeDraft = OutcomeCandidate & { receipt: string };
export interface OutcomeAnalysis {
  summary: string; candidates: OutcomeDraft[]; warnings: string[];
  evidence: EvidenceRef; documentName: string; kind: 'text'|'image'|'pdf';
}
// The server fills this from a signed draft. It is not accepted as a client command field.
export interface OutcomeSource {
  id: string; method: 'ai'; indicatorVersion: number; documentName: string;
  location: string; quote: string; uncertainty: string; kind: OutcomeAnalysis['kind'];
  proposed: Pick<OutcomeCandidate, 'value'|'denominator'|'assessment'|'asOf'|'periodStart'>;
  reviewedAt: string; reviewedBy: string;
}
