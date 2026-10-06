import {zipSync,strToU8} from 'fflate';
import type {Workspace,DocumentVersion} from '../domain/types';
import {annualReportHTML,reportHTML} from './report';
import {reportHWPX} from './report-hwpx';
import {exportMetrics,isAnnualReport,type ExportReport} from './report-data';
const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export async function reportPackage(s:Workspace,r:ExportReport,read:(v:DocumentVersion)=>Promise<Blob>){
 const metrics=exportMetrics(r),ids=new Set(metrics.flatMap(m=>[...(m.evidenceVersionIds??[]),...(m.planningSource?[m.planningSource.evidence.versionId]:[])]));
 if(!isAnnualReport(r))r.evidence.forEach(e=>ids.add(e.versionId));
 r.finance?.expenses.forEach(e=>{if(e.evidence)ids.add(e.evidence.versionId);e.payments?.forEach(p=>ids.add(p.evidence.versionId));});
 const files:Record<string,Uint8Array>={'report.hwpx':reportHWPX(r)},manifest:{path:string;sha256:string;versionId:string;documentId:string}[]=[];let size=0,photos='';
 for(const id of ids){const d=s.documents.find(d=>d.versions.some(v=>v.id===id)),v=d?.versions.find(v=>v.id===id);if(!d||!v)throw new Error('접근할 수 없는 근거가 있어요. 원본 프로젝트 권한을 확인해 주세요.');const blob=await read(v);size+=blob.size;if(size>40*1024*1024)throw new Error('근거 묶음은 원본 합계 40MB까지예요. 보고 기간을 나누어 주세요.');
  const path=`evidence/${id}-${v.name.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_')}`,bytes=new Uint8Array(await blob.arrayBuffer());files[path]=bytes;
  manifest.push({path,versionId:id,documentId:d.id,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes))),b=>b.toString(16).padStart(2,'0')).join('')});
  if(/\.(png|jpg|jpeg|webp)$/i.test(v.name))photos+=`<figure><img src="${escape(path)}" style="max-width:100%;max-height:500px"/><figcaption>${escape(d.title)} · ${escape(id)}</figcaption></figure>`;
 }
 const numeric=metrics.filter(m=>m.actual!==null).slice(0,30),height=Math.max(140,numeric.length*70+50);
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}" viewBox="0 0 900 ${height}"><rect width="900" height="${height}" fill="white"/><text x="20" y="28" font-size="20">지표별 목표 대비 확인 실적</text>${numeric.map((m,i)=>{const y=i*70+65,width=Math.min(560,Math.max(0,(m.rate??0)/100*560));return `<text x="20" y="${y}" font-size="14">${escape(m.name)}</text><rect x="250" y="${y-16}" width="560" height="24" fill="#edf3ef"/><rect x="250" y="${y-16}" width="${width}" height="24" fill="#315747"/><text x="250" y="${y+30}" font-size="13">${m.actual} ${escape(m.unit)} / 목표 ${m.target??'미설정'} · 달성률 ${m.rate===null?'미설정':m.rate.toFixed(1)+'%'}</text>`;}).join('')}</svg>`;
 files['chart.svg']=strToU8(svg);const html=(isAnnualReport(r)?annualReportHTML(r):reportHTML(r)).replace('</body>',`<section><h2>차트와 현장 사진</h2><img src="chart.svg" style="max-width:100%"/>${photos}<h2>원본 목록</h2><ul>${manifest.map(m=>`<li><a href="${escape(m.path)}">${escape(m.path)}</a> · ${m.sha256}</li>`).join('')}</ul></section></body>`);
 files['report.html']=strToU8(html);files['manifest.json']=strToU8(JSON.stringify({reportId:r.id,createdAt:r.createdAt,files:manifest},null,2));return new Blob([new Uint8Array(zipSync(files))],{type:'application/zip'});
}
