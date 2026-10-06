import {reportStatus,reportStatusLabels} from '../domain/report-workflow';
import type {AnnualReport,Report} from '../domain/types';
import type {Context} from '../ui/shared';
export function reportHref(r:Report|AnnualReport){return 'planId' in r?`#/annual/reports/${encodeURIComponent(r.id)}`:`#/projects/${encodeURIComponent(r.projectId)}/report/${encodeURIComponent(r.id)}`;}
export function ReportInbox({s,canManage=true,memberId}:Pick<Context,'s'|'canManage'|'memberId'>){
 const reports=[...s.reports,...(canManage?s.annualReports??[]:[])];
 const pending=reports.filter(r=>(canManage?['in-review','returned']:['returned']).includes(reportStatus(r))&&(canManage||r.createdById===memberId)&&!reports.some(n=>n.previousReportId===r.id));
 if(!pending.length)return null;
 return <section className="panel report-queue"><div className="section-title compact"><h3>확인할 보고서</h3><span>{pending.length}건</span></div>{pending.slice(0,8).map(r=><a className="text-link" key={r.id} href={reportHref(r)}>{r.title} · {reportStatusLabels[reportStatus(r)]} →</a>)}{pending.length>8&&<small>나머지 보고서는 보고서·연간 계획에서 확인해 주세요.</small>}</section>;
}
