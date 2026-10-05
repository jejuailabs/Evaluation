import { Unzip, UnzipInflate, strFromU8 } from 'fflate';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { collectContent, type SourceBlock, type DocumentContent } from '../domain/document-content';

const MAX_XML = 12 * 1024 * 1024;
// Expand only text-bearing entries, with a real output-byte budget (ZIP declarations are untrusted).
export function readTextArchive(bytes: Uint8Array): Record<string, string> {
  if (bytes.length > 25 * 1024 * 1024) throw new Error('25MB 이내 문서를 선택해 주세요.');
  const result: Record<string, string> = Object.create(null);
  let total = 0, entries = 0, open = 0;
  let failure: Error | undefined;
  const unzip = new Unzip(file => {
    if (++entries > 2000) throw new Error('내부 파일이 너무 많은 문서예요. 내용을 나누어 올려 주세요.');
    if (!/^(Contents\/section\d+\.xml|word\/document\.xml|xl\/(worksheets\/sheet\d+\.xml|sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels))$/.test(file.name)) return;
    if (Object.hasOwn(result, file.name)) throw new Error('중복된 문서 구성이 있어 읽을 수 없어요.');
    result[file.name] = '';
    if ((file.originalSize ?? 0) > MAX_XML) throw new Error('압축을 푼 문서 내용이 읽기 한도를 넘어요.');
    open++;
    const chunks: Uint8Array[] = [];
    let size = 0;
    file.ondata = (error, data, final) => {
      if (error) { failure ??= new Error('문서 압축이 손상되었거나 암호화되어 있어요.'); return; }
      total += data.length; size += data.length;
      if (total > MAX_XML) { failure = new Error('압축을 푼 문서 내용이 12MB를 넘어요. 문서를 나누어 주세요.'); file.terminate(); return; }
      chunks.push(data);
      if (final) {
        const merged = new Uint8Array(size); let pos = 0;
        for (const chunk of chunks) { merged.set(chunk, pos); pos += chunk.length; }
        result[file.name] = strFromU8(merged); open--;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let pos = 0; pos < bytes.length; pos += 4096) {
    unzip.push(bytes.subarray(pos, pos + 4096), pos + 4096 >= bytes.length);
    if (failure) throw failure;
  }
  if (open) throw new Error('문서 압축이 끝까지 저장되지 않았어요. 원본을 다시 확인해 주세요.');
  return result;
}

type Node = { [key: string]: any };
function xml(text: string): Node[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('외부 정의가 포함된 XML 문서는 읽지 않아요.');
  if (XMLValidator.validate(text) !== true) throw new Error('문서 내부 XML이 손상되어 있어요.');
  return new XMLParser({ preserveOrder: true, ignoreAttributes: false, parseTagValue: false, trimValues: false, removeNSPrefix: true }).parse(text);
}
function nodes(tree: Node[], name: string): Node[] {
  const out: Node[] = [];
  function walk(items: Node[], depth: number) {
    if (depth > 80) throw new Error('문서 구조가 너무 복잡해요. 텍스트 형식으로 다시 저장해 주세요.');
    for (const node of items) for (const [key, value] of Object.entries(node)) {
      if (key === name) out.push(node);
      if (key !== ':@' && Array.isArray(value)) walk(value, depth + 1);
    }
  }
  walk(tree, 0); return out;
}
function textOf(tree: Node[]): string {
  return tree.map(n => Object.entries(n).filter(([key]) => key !== ':@').map(([key, value]) =>
    key === '#text' ? String(value) : key === 'tab' ? '\t' : key === 'br' || key === 'lineBreak' ? '\n' : Array.isArray(value) ? textOf(value) : '').join('')).join('');
}
function paragraphs(tree: Node[], prefix: string): SourceBlock[] {
  // Collect text runs only: nested table paragraphs are their own blocks, never counted twice.
  return nodes(tree, 'p').map((n, index) => {
    function runs(items: Node[]): string {
      return items.map(x => Object.entries(x).filter(([key]) => key !== ':@' && key !== 'p' && key !== 'del').map(([key, value]) =>
        key === 't' ? textOf(value) : key === 'tab' ? '\t' : key === 'br' ? '\n' : Array.isArray(value) ? runs(value) : '').join('')).join('');
    }
    return { id: `${prefix}:${index + 1}`, location: `${prefix} · 문단 ${index + 1}`, text: runs(n.p) };
  });
}
function spreadsheets(files: Record<string, string>): DocumentContent {
  const shared = files['xl/sharedStrings.xml'] ? nodes(xml(files['xl/sharedStrings.xml']), 'si').map(n => nodes(n.si, 't').map(t => textOf(t.t)).join('')) : [];
  const workbook = files['xl/workbook.xml'] ? nodes(xml(files['xl/workbook.xml']), 'sheet') : [];
  const rels = files['xl/_rels/workbook.xml.rels'] ? nodes(xml(files['xl/_rels/workbook.xml.rels']), 'Relationship') : [];
  const blocks: SourceBlock[] = [];
  for (const path of Object.keys(files).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    const rel = rels.find(r => `xl/${String(r[':@']?.['@_Target']).replace(/^\/?xl\//, '')}` === path);
    const sheet = workbook.find(s => s[':@']?.['@_id'] === rel?.[':@']?.['@_Id']);
    const name = String(sheet?.[':@']?.['@_name'] ?? path.split('/').at(-1));
    for (const row of nodes(xml(files[path]), 'row')) {
      const cells = nodes(row.row, 'c').map(c => {
        const attr = c[':@'] ?? {}, type = attr['@_t'];
        const raw = nodes(c.c, 'v').map(v => textOf(v.v)).join('');
        const value = type === 's' ? shared[Number(raw)] ?? '' : type === 'inlineStr' ? nodes(c.c, 't').map(t => textOf(t.t)).join('') : raw;
        const formula = nodes(c.c, 'f').length ? (value ? ' [수식 저장값]' : '[수식 결과 없음]') : '';
        return `${attr['@_r'] ?? '?'}: ${value}${formula}`;
      });
      if (cells.length) blocks.push({ id: `${path}:${row[':@']?.['@_r'] ?? blocks.length}`, location: `${name} · ${row[':@']?.['@_r'] ?? '?'}행`, text: cells.join(' | ') });
    }
  }
  return collectContent('XLSX', blocks, ['셀의 저장된 값만 읽어요. 수식은 실행하지 않으며 날짜·서식은 원본과 다를 수 있어요. 숨겨진 행·시트의 텍스트도 포함돼요.']);
}
export function extractOffice(name: string, bytes: Uint8Array): DocumentContent {
  const ext = name.split('.').at(-1)?.toLowerCase();
  if (['txt', 'md', 'csv', 'tsv', 'json', 'log'].includes(ext ?? '')) {
    let text: string; const warnings: string[] = [];
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { text = new TextDecoder('euc-kr').decode(bytes); warnings.push('UTF-8이 아니어서 EUC-KR로 읽었어요. 한글이 깨졌는지 확인해 주세요.'); }
    return collectContent(ext!.toUpperCase(), text.split(/\r?\n/).map((text, i) => ({ id: `line:${i + 1}`, location: `${i + 1}행`, text })), warnings);
  }
  if (!['hwpx', 'docx', 'xlsx'].includes(ext ?? '')) throw new Error('내용 읽기는 HWPX·DOCX·XLSX·PDF·텍스트를 지원해요. 이 형식은 원본으로 보관하고, 읽기 가능한 형식으로 변환해 올려 주세요.');
  const files = readTextArchive(bytes);
  if (ext === 'xlsx') return spreadsheets(files);
  const paths = ext === 'hwpx' ? Object.keys(files).filter(k => /^Contents\/section\d+\.xml$/.test(k)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : ['word/document.xml'].filter(k => files[k]);
  if (!paths.length) throw new Error('본문을 찾지 못했어요. 암호·보호 설정과 파일 형식을 확인해 주세요.');
  return collectContent(ext!.toUpperCase(), paths.flatMap((path, i) => paragraphs(xml(files[path]), ext === 'hwpx' ? `구역 ${i + 1}` : '본문')), ['본문 텍스트와 표 안의 문장을 읽어요. 사진·도형·머리말·주석과 원래의 배치는 포함하지 않아요.']);
}
