import { z } from 'zod';
const id=z.string().min(1).max(100), text=z.string().max(10000), date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/), num=z.number().finite().nonnegative();
const scope={id,orgId:id,projectId:id};
const evidence=z.object({documentId:id,versionId:id}).strict();
const expenseFields={title:z.string().min(1).max(160),amount:num.int(),date,ownerId:id,evidence:evidence.optional(),budgetLineId:id.optional(),description:text.optional()};
const version=z.object({id,name:z.string().min(1).max(255),size:num.int(),createdAt:z.string().max(40),blobKey:id}).strict();
const project=z.object({id,orgId:id,name:z.string().min(1).max(80),purpose:text,start:date,end:date,ownerId:id,budget:num.int(),category:z.string().max(80),status:z.enum(['planning','active','completed','archived']).optional(),closeNote:text.optional()}).strict();
const task=z.object({...scope,title:z.string().min(1).max(160),due:date,ownerId:id,status:z.enum(['todo','doing','done']),priority:z.enum(['normal','high']).optional(),note:text.optional(),indicatorId:id.optional(),completedAt:z.string().max(40).optional()}).strict();
const template={title:z.string().min(1).max(160),ownerId:id,priority:z.enum(['normal','high']).optional(),note:text.optional(),indicatorId:id.optional()};
export const commandSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('intake.meeting.save'),id,expectedRevision:num.int(),text:z.string().trim().min(1).max(30000),notes:text,reviewed:z.boolean()}).strict(),
 z.object({type:z.literal('task.series.create'),series:z.object({...scope,id:z.string().min(1).max(85),...template,start:date,end:date,frequency:z.enum(['daily','weekly','monthly']),interval:num.int().min(1).max(12)}).strict()}).strict(),
 z.object({type:z.literal('task.series.update'),projectId:id,seriesId:id,fields:z.object(template).strict(),effectiveFrom:date,reason:text.min(1)}).strict(),
 z.object({type:z.literal('task.series.stop'),projectId:id,seriesId:id,effectiveFrom:date,reason:text.min(1)}).strict(),
 z.object({type:z.literal('intake.add'),id,title:z.string().min(1).max(160),note:text,source:z.discriminatedUnion('kind',[z.object({kind:z.literal('file'),version}).strict(),z.object({kind:z.literal('text'),text:text.min(1)}).strict()])}).strict(),
 z.object({type:z.literal('intake.assign'),id,projectId:id,activity:z.object({date,body:text.min(1),taskId:id.optional(),indicatorIds:z.array(id).max(50)}).strict().optional()}).strict(),
 z.object({type:z.literal('intake.archive'),id,archived:z.boolean(),reason:text.min(1)}).strict(),
 z.object({type:z.literal('project.add'),project}).strict(),
 z.object({type:z.literal('project.update'),project,reason:text.min(1)}).strict(),
 z.object({type:z.literal('task.add'),task}).strict(),
 z.object({type:z.literal('task.update'),task}).strict(),
 z.object({type:z.literal('task.status'),projectId:id,taskId:id,status:z.enum(['todo','doing','done'])}).strict(),
 z.object({type:z.literal('document.add'),document:z.object({...scope,title:z.string().min(1).max(160),versions:z.array(version).length(1)}).strict()}).strict(),
 z.object({type:z.literal('document.version'),projectId:id,documentId:id,version}).strict(),
 z.object({type:z.literal('expense.add'),expense:z.object({...scope,...expenseFields,status:z.literal('planned')}).strict()}).strict(),
 z.object({type:z.literal('budget.line.save'),line:z.object({...scope,name:z.string().min(1).max(100),fundingSource:z.string().min(1).max(100),allocated:num.int()}).strict(),reason:text}).strict(),
 z.object({type:z.literal('expense.update'),projectId:id,expenseId:id,fields:z.object(expenseFields).strict(),reason:text.min(1)}).strict(),
 z.object({type:z.literal('expense.submit'),projectId:id,expenseId:id}).strict(),
 z.object({type:z.literal('expense.review'),projectId:id,expenseId:id,decision:z.enum(['confirmed','returned']),reason:text.min(1)}).strict(),
 z.object({type:z.literal('expense.cancel'),projectId:id,expenseId:id,reason:text.min(1)}).strict(),
 z.object({type:z.literal('expense.pay'),projectId:id,expenseId:id,payment:z.object({id,amount:num.int(),date,note:text.min(1),evidence}).strict()}).strict(),
 z.object({type:z.literal('expense.payment.void'),projectId:id,expenseId:id,paymentId:id,reason:text.min(1)}).strict(),
 z.object({type:z.literal('expense.status'),projectId:id,expenseId:id,status:z.enum(['confirmed','paid'])}).strict(),
 z.object({type:z.literal('expense.evidence'),projectId:id,expenseId:id,evidence}).strict(),
 z.object({type:z.literal('indicator.add'),indicator:z.object({...scope,name:z.string().min(1).max(160),unit:z.string().max(30),target:num.nullable(),forecast:num.nullable(),forecastNote:text,definition:text,source:z.string().max(150),sourceUrl:z.string().url().optional(),standardId:id.optional(),aggregation:z.enum(['cumulative-snapshot','period-sum','ratio','qualitative']),direction:z.enum(['higher','lower']),rubric:text.optional(),planningSource:z.object({evidence,documentName:z.string().max(255),location:z.string().min(1).max(300),quote:z.string().min(1).max(1500),method:z.enum(['manual','ai']),reviewedAt:z.string().max(40)}).strict().optional(),version:z.literal(1)}).strict()}).strict(),
 z.object({type:z.literal('indicator.revise'),projectId:id,indicatorId:id,target:num.nullable(),forecast:num.nullable(),forecastNote:text,reason:text.min(1)}).strict(),
 z.object({type:z.literal('measurement.add'),aiReceipt:z.string().min(1).max(24000).optional(),measurement:z.object({...scope,indicatorId:id,asOf:date,value:num,note:text,evidence,status:z.literal('pending'),createdAt:z.string().max(40),periodStart:date.optional(),denominator:num.optional(),assessment:z.enum(['not-yet','partial','achieved']).optional(),supersedesId:id.optional()}).strict()}).strict(),
 z.object({type:z.literal('measurement.confirm'),projectId:id,measurementId:id}).strict(),
 z.object({type:z.literal('measurement.reject'),projectId:id,measurementId:id,reason:text.min(1)}).strict(),
 z.object({type:z.literal('report.create'),projectId:id,asOf:date,note:text,periodStart:date.optional()}).strict(),
 z.object({type:z.literal('annual.plan.save'),plan:z.object({id,orgId:id,year:z.number().int().min(2000).max(2100),title:z.string().min(1).max(160),purpose:text,budget:num.int()}).strict(),reason:text}).strict(),
 z.object({type:z.literal('annual.budget.allocate'),planId:id,allocations:z.array(z.object({projectId:id,amount:num.int()}).strict()).max(500),reason:text.min(1)}).strict(),
 z.object({type:z.literal('annual.plan.status'),planId:id,status:z.enum(['draft','active','closed']),reason:text.min(1)}).strict(),
 z.object({type:z.literal('annual.goal.save'),goal:z.object({id,orgId:id,planId:id,name:z.string().min(1).max(160),unit:z.string().max(30),target:num.nullable(),definition:text,direction:z.enum(['higher','lower']),aggregation:z.enum(['sum','separate']),linkIds:z.array(id).max(100),deduplication:text}).strict(),reason:text}).strict(),
 z.object({type:z.literal('annual.report.create'),planId:id,start:date,end:date,note:text}).strict(),
 z.object({type:z.literal('activity.add'),activity:z.object({...scope,title:z.string().min(1).max(160),body:text.min(1),date,ownerId:id,taskId:id.optional(),indicatorIds:z.array(id).max(50),evidence:z.array(evidence).max(30)}).strict()}).strict(),
]);
export const envelopeSchema=z.object({id:z.string().uuid(),revision:z.number().int().nonnegative(),command:commandSchema}).strict();
