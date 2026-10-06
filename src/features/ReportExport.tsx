import { useEffect, useRef, useState } from 'react';
import { download } from '../infrastructure/storage';
import { annualReportHTML, reportHTML } from '../infrastructure/report';
import { exportTitle, isAnnualReport, type ExportReport } from '../infrastructure/report-data';

export function ReportExport({ report }: { report: ExportReport }) {
  const generation=useRef('');
  const [format, setFormat] = useState('docx'); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const key=`${report.id}:${report.workflow?.version??0}:${format}`;generation.current=key;
  const [prepared,setPrepared]=useState<{url:string;name:string}|null>(null);
  useEffect(()=>()=>{if(prepared)URL.revokeObjectURL(prepared.url);},[prepared]);
  useEffect(()=>{setPrepared(null);setError('');},[key]);
  function file(blob:Blob,name:string){if(generation.current!==key)return;setPrepared({url:URL.createObjectURL(blob),name});download(blob,name);}
  const html = () => isAnnualReport(report) ? annualReportHTML(report) : reportHTML(report);
  async function save() {
    setBusy(true); setError('');
    const name = exportTitle(report).replace(/[\\/:*?"<>|]/g, '_').slice(0, 70)+`_${report.id.slice(0,8)}_v${report.workflow?.version??0}`;
    try {
      if (format === 'docx') { const { reportDOCX } = await import('../infrastructure/report-docx'); file(await reportDOCX(report), `${name}.docx`); }
      else if (format === 'xlsx') { const { reportXLSX } = await import('../infrastructure/report-xlsx'); file(new Blob([new Uint8Array(reportXLSX(report))], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${name}.xlsx`); }
      else if (format === 'html') file(new Blob([html()], { type: 'text/html;charset=utf-8' }), `${name}.html`);
      else {
        const frame = document.createElement('iframe'); frame.setAttribute('aria-hidden', 'true'); frame.title = '보고서 인쇄';
        frame.style.cssText = 'position:fixed;width:0;height:0;border:0;bottom:0;left:0';
        frame.srcdoc = html(); frame.onload = () => { frame.contentWindow?.addEventListener('afterprint', () => frame.remove(), { once: true }); frame.contentWindow?.focus(); frame.contentWindow?.print(); };
        document.querySelector('body')!.appendChild(frame); setTimeout(() => frame.remove(), 300000);
      }
    } catch { setError('파일을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  return <div><div className="export-controls"><select aria-label="보고서 파일 형식" value={format} onChange={e => setFormat(e.target.value)} disabled={busy}><option value="docx">Word 문서</option><option value="xlsx">Excel 집계표</option><option value="html">웹 문서</option><option value="pdf">인쇄·PDF 저장</option></select><button className="button secondary" disabled={busy} onClick={save}>{busy ? '파일 만드는 중…' : format === 'pdf' ? '인쇄 창 열기' : '파일 내려받기'}</button></div>{prepared&&<p className="export-ready" role="status">파일이 준비됐어요. <a href={prepared.url} download={prepared.name}>준비된 파일 다시 받기</a></p>}{format === 'pdf' && <small>인쇄 창에서 ‘PDF로 저장’을 선택하세요.</small>}{error && <p role="alert" className="export-error">{error}</p>}</div>;
}
