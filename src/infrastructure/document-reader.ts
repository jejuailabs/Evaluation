import { collectContent, type DocumentContent, type SourceBlock } from '../domain/document-content';
import DocumentWorker from './document.worker?worker';
import pdfWorkerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export async function readDocument(name: string, blob: Blob): Promise<DocumentContent> {
  if (!blob.size || blob.size > 25 * 1024 * 1024) throw new Error('비어 있지 않은 25MB 이내 문서를 선택해 주세요.');
  if (name.toLowerCase().endsWith('.pdf')) return readPDF(blob);
  const bytes = await blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const worker = new DocumentWorker();
    const finish = () => { clearTimeout(timer); worker.terminate(); };
    const timer = setTimeout(() => { finish(); reject(new Error('읽기 시간이 초과됐어요. 문서를 나누어 올려 주세요.')); }, 15000);
    worker.onmessage = e => { finish(); e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.result); };
    worker.onerror = () => { finish(); reject(new Error('문서를 읽지 못했어요. 원본 형식을 확인해 주세요.')); };
    worker.postMessage({ name, bytes }, [bytes]);
  });
}
async function readPDF(blob: Blob): Promise<DocumentContent> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerURL;
  const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: false, disableFontFace: true });
  const timer = setTimeout(() => void task.destroy(), 25000);
  try {
    const pdf = await task.promise;
    const blocks: SourceBlock[] = []; const warnings: string[] = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 80); i++) {
      const page = await pdf.getPage(i); const text = await page.getTextContent();
      let line = '', lineNo = 0;
      for (const item of text.items) if ('str' in item) {
        line += item.str + ' ';
        if (item.hasEOL) { blocks.push({ id: `page:${i}:${++lineNo}`, location: `${i}쪽 · ${lineNo}행`, text: line }); line = ''; }
      }
      if (line.trim()) blocks.push({ id: `page:${i}:${++lineNo}`, location: `${i}쪽 · ${lineNo}행`, text: line });
      page.cleanup();
    }
    if (pdf.numPages > 80) warnings.push('앞 80쪽만 읽었어요. 나머지 페이지는 원본에서 확인해 주세요.');
    warnings.push('PDF의 텍스트만 읽어요. 스캔·사진 OCR과 원래의 표 배치는 지원하지 않아요.');
    return collectContent('PDF', blocks, warnings);
  } catch { throw new Error('PDF를 읽지 못했어요. 암호 설정·파일 손상을 확인하거나 문서를 나누어 주세요.'); }
  finally { clearTimeout(timer); await task.destroy(); }
}
