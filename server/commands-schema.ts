import { z } from 'zod';
const id=z.string().min(1).max(100), text=z.string().max(10000), date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/), num=z.number().finite().nonnegative();
const scope={id,orgId:id,projectId:id};
const evidence=z.object({documentId:id,versionId:id}).strict();
const version=z.object({id,name:z.string().min(1).max(255),size:num.int(),createdAt:z.string().max(40),blobKey:id}).strict();
export const commandSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('project.add'),project:z.object({id,orgId:id,name:z.string().min(1).max(80),purpose:text,start:date,end:date,ownerId:id,budget:num.int(),category:z.string().max(80)}).strict()}).strict(),
 z.object({type:z.literal('task.add'),task:z.object({...scope,title:z.string().min(1).max(160),due:date,ownerId:id,status:z.enum(['todo','doing','done'])}).strict()}).strict(),
 z.object({type:z.literal('task.status'),projectId:id,taskId:id,status:z.enum(['todo','doing','done'])}).strict(),
 z.object({type:z.literal('document.add'),document:z.object({...scope,title:z.string().min(1).max(160),versions:z.array(version).length(1)}).strict()}).strict(),
 z.object({type:z.literal('document.version'),projectId:id,documentId:id,version}).strict(),
 z.object({type:z.literal('expense.add'),expense:z.object({...scope,title:z.string().min(1).max(160),amount:num.int(),date,ownerId:id,status:z.enum(['planned','confirmed','paid']),evidence:evidence.optional()}).strict()}).strict(),
 z.object({type:z.literal('expense.status'),projectId:id,expenseId:id,status:z.enum(['confirmed','paid'])}).strict(),
 z.object({type:z.literal('expense.evidence'),projectId:id,expenseId:id,evidence}).strict(),
 z.object({type:z.literal('indicator.add'),indicator:z.object({...scope,name:z.string().min(1).max(160),unit:z.string().max(30),target:num.nullable(),forecast:num.nullable(),forecastNote:text,definition:text,source:z.literal('우리 조직 지표'),aggregation:z.literal('cumulative-snapshot'),direction:z.literal('higher'),version:z.literal(1)}).strict()}).strict(),
 z.object({type:z.literal('measurement.add'),measurement:z.object({...scope,indicatorId:id,asOf:date,value:num,note:text,evidence,status:z.literal('pending'),createdAt:z.string().max(40)}).strict()}).strict(),
 z.object({type:z.literal('measurement.confirm'),projectId:id,measurementId:id}).strict(),
 z.object({type:z.literal('report.create'),projectId:id,asOf:date,note:text}).strict(),
]);
export const envelopeSchema=z.object({id:z.string().uuid(),revision:z.number().int().nonnegative(),command:commandSchema}).strict();
