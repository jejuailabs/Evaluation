import { reportActionLabels, reportStatus, reportStatusLabels, submissionChannels, type ReportMetadata } from '../domain/report-workflow';

export function reportWorkflowText(r:ReportMetadata & {id:string}):string[]{
  const w=r.workflow;
  return [
    `문서 상태: ${reportStatusLabels[reportStatus(r)]} · 처리 이력 버전 ${w?.version??0}`,
    `보고서 번호: ${r.id}`,
    ...(w?.recipient?[`제출 예정 기관: ${w.recipient}`]:[]),
    ...(r.previousReportId?[`이전 보고서: ${r.previousReportId}`,`수정 이유: ${r.revisionReason??''}`]:[]),
    '조직 내부 승인과 담당자가 입력한 제출 기록입니다. 외부 전송 및 수신 기관의 접수·승인을 자동 확인하지 않습니다. 원본 파일은 포함하지 않습니다.',
    ...(w?.history??[]).map(h=>`${h.at} · ${reportActionLabels[h.action]} · ${h.actorName} (${h.actorId}) · ${h.reason}${h.relatedId?' · 관련 번호 '+h.relatedId:''}`),
    ...(w?.submissions??[]).map(x=>`제출 ${x.date} · ${x.recipient} · ${submissionChannels[x.channel]} · ${x.format.toUpperCase()} · ${x.reference} · ${x.note}\n기록자 ${x.actorName} (${x.actorId}) · 기록 시각 ${x.at} · 제출 기록 번호 ${x.id}${x.voided?'\n무효 기록: '+x.voided.reason+' · '+x.voided.actorName+' · '+x.voided.at:''}`),
  ];
}
