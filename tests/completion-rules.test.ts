import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSeed} from '../src/domain/seed';
import {execute} from '../src/domain/commands';
import {commandBase} from '../src/domain/command-base';
import {metricSummary} from '../src/domain/selectors';
import {reportHWPX,hwpxTextFields,fillHWPX} from '../src/infrastructure/report-hwpx';
import {extractOffice} from '../src/infrastructure/office-content';
import {inspectFile} from '../server/file-inspection';
import {unzipSync,strFromU8,zipSync,strToU8} from 'fflate';
import {XMLValidator} from 'fast-xml-parser';
const now='2026-10-06T10:00:00.000Z';
test('결재: 요청 당시 직무 분리 정책과 순서를 이후 설정 변경에도 보존',()=>{
 let s=createSeed();s.expenses=[];s.organization.approvalPolicy={approverIds:['m2'],separateDuties:true};
 s=execute(s,{type:'expense.add',expense:{id:'request',orgId:s.organization.id,projectId:'care',title:'검증 지출',amount:100,date:'2026-09-30',ownerId:'m1',status:'planned',evidence:{documentId:'d2',versionId:'v2'}}},now,'m1');
 s=execute(s,{type:'expense.submit',projectId:'care',expenseId:'request'},now,'m1');
 s=execute(s,{type:'organization.approval.save',approverIds:[],separateDuties:false},now,'m1');
 assert.throws(()=>execute(s,{type:'expense.review',projectId:'care',expenseId:'request',decision:'confirmed',reason:'자가 승인'},now,'m1'),/작성자/);
 s=execute(s,{type:'expense.review',projectId:'care',expenseId:'request',decision:'confirmed',reason:'대조 확인'},now,'m2');
 const pay={type:'expense.pay' as const,projectId:'care',expenseId:'request',payment:{id:'pay',date:'2026-10-01',amount:100,note:'계좌 대조',evidence:{documentId:'d2',versionId:'v2'}}};
 assert.throws(()=>execute(s,pay,now,'m2'),/승인자/);s=execute(s,pay,now,'m3');assert.equal(s.expenses[0].status,'paid');
});
test('연도 이월: 총예산 보존·약정 재승인·마감연도 승인액의 다음 연도 지급',()=>{
 let s=createSeed();s.expenses=[];s.annualPlans=[];s.annualAllocations=[];s.annualGoals=[];
 s.projects[0].start='2025-01-01';s.projects[0].end='2027-12-31';s.projects[0].budget=2000;
 for(const year of [2025,2026]){s=execute(s,{type:'annual.plan.save',plan:{id:'y'+year,orgId:s.organization.id,year,title:String(year),purpose:'검증',budget:1000},reason:'계획'},now,'m1');s=execute(s,{type:'annual.budget.allocate',planId:'y'+year,allocations:[{projectId:'care',amount:1000}],reason:'배정'},now,'m1');}
 const expense={orgId:s.organization.id,projectId:'care',title:'다음 연도 집행',amount:200,date:'2025-12-31',ownerId:'m1',status:'planned' as const,evidence:{documentId:'d2',versionId:'v2'}};
 s=execute(s,{type:'expense.add',expense:{...expense,id:'roll'}},now,'m1');
 s=execute(s,{type:'annual.budget.carryover',fromPlanId:'y2025',toPlanId:'y2026',projectId:'care',amount:300,expenseIds:['roll'],date:'2026-01-02',reason:'일정 이월'},now,'m1');
 assert.deepEqual(s.annualPlans!.map(p=>p.budget).sort((a,b)=>a-b),[700,1300]);assert.equal(s.expenses[0].date,'2026-01-02');assert.equal(s.expenses[0].status,'planned');assert.equal(s.annualAllocations!.reduce((n,a)=>n+a.amount,0),2000);
 s=execute(s,{type:'expense.add',expense:{...expense,id:'settle',amount:100}},now,'m1');s=execute(s,{type:'expense.submit',projectId:'care',expenseId:'settle'},now,'m1');s=execute(s,{type:'expense.review',projectId:'care',expenseId:'settle',decision:'confirmed',reason:'확인'},now,'m2');
 s.annualPlans!.find(p=>p.year===2025)!.status='closed';
 s=execute(s,{type:'expense.pay',projectId:'care',expenseId:'settle',payment:{id:'p',amount:100,date:'2026-01-03',evidence:expense.evidence,note:'전년도 승인액 정산'}},now,'m3');assert.equal(s.expenses.find(e=>e.id==='settle')!.status,'paid');assert.equal(s.expenses.find(e=>e.id==='settle')!.date,'2025-12-31');
});
test('업무: 순환·미완료 선행·미완료 하위 업무 검증, 실패 시 원본 보존',()=>{
 let s=createSeed();s.tasks=[];const p=s.projects[0],a={id:'a',orgId:s.organization.id,projectId:p.id,title:'상위',due:p.end,ownerId:p.ownerId,status:'todo' as const};
 s=execute(s,{type:'task.add',task:a});s=execute(s,{type:'task.add',task:{...a,id:'b',title:'하위',parentId:'a'}});
 const before=structuredClone(s);assert.throws(()=>execute(s,{type:'task.status',projectId:p.id,taskId:'a',status:'done'}),/하위/);assert.deepEqual(s,before);
 assert.throws(()=>execute(s,{type:'task.update',task:{...s.tasks[0],dependencyIds:['b'],parentId:'b'}}),/순환/);
 s=execute(s,{type:'task.status',projectId:p.id,taskId:'b',status:'done'});s=execute(s,{type:'task.status',projectId:p.id,taskId:'a',status:'done'});assert.equal(s.tasks.filter(t=>t.status==='done').length,2);
 assert.throws(()=>execute(s,{type:'task.status',projectId:p.id,taskId:'b',status:'todo'}),/하위/);
});
test('문서: 새 버전·복원 원본 보존, 영향 재확인과 참조 범위',()=>{
 let s=createSeed();const d=s.documents[0],old=d.versions[0];const i=s.indicators.find(i=>i.projectId===d.projectId)!;i.planningSource={evidence:{documentId:d.id,versionId:old.id},documentName:old.name,location:'본문',quote:'근거',method:'manual',reviewedAt:now};
 s=execute(s,{type:'document.version',projectId:d.projectId,documentId:d.id,version:{id:'new',name:'new.txt',inlineText:'새 근거',size:10,createdAt:now}},now);
 assert.ok(s.indicators.find(x=>x.id===i.id)!.needsReview);s=execute(s,{type:'document.restore',projectId:d.projectId,documentId:d.id,versionId:old.id,reason:'검토 후 이전본 복원'},now);
 const restored=s.documents.find(x=>x.id===d.id)!.versions.at(-1)!;assert.equal(restored.restoredFromId,old.id);assert.notEqual(restored.id,old.id);assert.equal(restored.inlineText,old.inlineText);
 s=execute(s,{type:'source.review',projectId:d.projectId,kind:'indicator',id:i.id,reason:'정의에 영향 없음'},now);assert.equal(s.indicators.find(x=>x.id===i.id)!.needsReview,undefined);
});
test('지표: 정의 버전 분리·참여자 중복 제거·예상 산식 검증',()=>{
 let s=createSeed();const i=s.indicators.find(i=>i.aggregation==='period-sum')??s.indicators[0];i.aggregation='period-sum';i.uniqueParticipants=true;i.definitionVersion=1;
 const d=s.documents.find(d=>d.projectId===i.projectId)!;s.measurements=s.measurements.filter(m=>m.indicatorId!==i.id);
 const key=(n:string)=>'p_'+n.repeat(64);for(const [id,periodStart,asOf,keys] of [['one','2026-06-01','2026-06-30',[key('a'),key('b')]],['two','2026-07-01','2026-07-31',[key('b'),key('c')]]] as const){s.measurements.push({id,orgId:s.organization.id,projectId:i.projectId,indicatorId:i.id,asOf,periodStart,value:keys.length,participantKeys:[...keys],definitionVersion:1,evidence:{documentId:d.id,versionId:d.versions[0].id},status:'confirmed',createdAt:now,note:'참여자 집계'});}
 assert.equal(metricSummary(s,i,'2026-09-30').actual,3);
 s=execute(s,{type:'indicator.definition',projectId:i.projectId,indicatorId:i.id,definition:'개정 대상',unit:i.unit,aggregation:i.aggregation,uniqueParticipants:true,reason:'대상 기준 개정'},now);assert.equal(metricSummary(s,s.indicators.find(x=>x.id===i.id)!,'2026-09-30').actual,null);
 s=execute(s,{type:'indicator.forecast',projectId:i.projectId,indicatorId:i.id,calculation:{method:'product',factors:[{name:'대상',low:10,base:20,high:30},{name:'횟수',low:2,base:3,high:4}],assumptions:'프로그램 계획',source:{documentId:d.id,versionId:d.versions[0].id}}},now);assert.equal(s.indicators.find(x=>x.id===i.id)!.forecast,60);
});
test('동시 편집: 다른 프로젝트 변경과 같은 프로젝트 변경 구별',async()=>{
 const s=createSeed(),t=s.tasks[0],c={type:'task.status' as const,projectId:t.projectId,taskId:t.id,status:'doing' as const},base=await commandBase(s,c);const next=structuredClone(s);next.projects.find(p=>p.id!==t.projectId)!.purpose+=' 수정';assert.equal(await commandBase(next,c),base);next.tasks[0].title+=' 수정';assert.notEqual(await commandBase(next,c),base);
});
test('HWPX: 실제 ZIP/XML·수치·표·양식 항목 연결과 XML 주입 방어',()=>{
 const s=execute(createSeed(),{type:'report.create',projectId:'care',asOf:'2026-09-30',note:'<script>검토</script>'},now),r=s.reports[0],bytes=reportHWPX(r),archive=unzipSync(bytes);
 assert.equal(strFromU8(archive.mimetype),'application/hwp+zip');for(const [name,data] of Object.entries(archive))if(/\.(xml|hpf)$/.test(name))assert.equal(XMLValidator.validate(strFromU8(data)),true,name);
 const content=extractOffice('report.hwpx',bytes);assert.ok(content.blocks.some(b=>b.text.includes(r.projectName)));assert.match(strFromU8(archive['Contents/section0.xml']),/<hp:tbl/);assert.doesNotMatch(strFromU8(archive['Contents/section0.xml']),/<script>/);
 const fields=hwpxTextFields(bytes);const mapped=fillHWPX(bytes,r,{[fields[1].key]:'period'});assert.ok(extractOffice('mapped.hwpx',mapped).blocks.length>0);
});
test('파일 검사: 실행 파일·EICAR·매크로 ZIP 차단, 일반 문서 해시 생성',()=>{
 assert.throws(()=>inspectFile('photo.jpg',strToU8('MZfake')),/실행/);assert.throws(()=>inspectFile('test.txt',strToU8('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')),/차단/);
 assert.throws(()=>inspectFile('bad.docx',zipSync({'word/vbaProject.bin':strToU8('macro')})),/압축|안전/);assert.equal(inspectFile('ok.txt',strToU8('정상 본문')).sha256.length,64);
});
