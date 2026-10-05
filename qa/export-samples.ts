// Run with node --import tsx qa/export-samples.ts. All fixtures contain invented demo data.
import { mkdir, writeFile } from 'node:fs/promises';
import { execute } from '../src/domain/commands';
import { createSeed } from '../src/domain/seed';
import { annualSnapshot } from '../src/domain/annual';
import { reportDOCX } from '../src/infrastructure/report-docx';
import { reportXLSX } from '../src/infrastructure/report-xlsx';
import { reportHTML } from '../src/infrastructure/report';
import { zipSync, strToU8 } from 'fflate';
const dir='.sites-runtime/report-qa';await mkdir(dir,{recursive:true});
let s=createSeed();s=execute(s,{type:'report.create',projectId:'care',asOf:'2026-09-30',note:'돌봄 이용자 86명이 확인되었습니다. 다음 분기에는 이동이 어려운 이웃의 방문 일정과 담당자를 먼저 정하고, 월말에 명부를 대조합니다.'});
const reports=[['project',s.reports[0]],['annual',annualSnapshot(s,s.annualPlans![0],'2026-01-01','2026-09-30','목표별 차이의 원인을 확인하고 4분기 실행 계획을 보완합니다.',new Date().toISOString())]] as const;
for(const [name,r] of reports){await writeFile(`${dir}/${name}.docx`,new Uint8Array(await(await reportDOCX(r)).arrayBuffer()));await writeFile(`${dir}/${name}.xlsx`,reportXLSX(r));}
await writeFile(`${dir}/project.html`,reportHTML(s.reports[0]));
const text='2026년 이웃 돌봄 사업계획\n고유 이용자 목표는 120명입니다. 명부의 참여자 번호를 기준으로 중복을 제외합니다.\n월 10명씩 10개월 동안 모집해 100명이 참여할 것으로 예상합니다.\n매월 방문 후 사진과 상담 기록을 남기고, 분기 말에 참여자와 변화 내용을 확인합니다.';
await writeFile(`${dir}/plan.txt`,text);await writeFile(`${dir}/field.txt`,'2026년 9월 현장 기록\n중복을 제외한 이용자는 86명입니다. 명부와 방문 기록을 대조했습니다.');
await writeFile(`${dir}/plan.hwpx`,zipSync({'mimetype':strToU8('application/hwp+zip'),'Contents/section0.xml':strToU8(`<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">${text.split('\n').map(t=>`<hp:p><hp:run><hp:t>${t}</hp:t></hp:run></hp:p>`).join('')}</hs:sec>`)}));
console.log('Created local QA exports and input fixtures in '+dir);
