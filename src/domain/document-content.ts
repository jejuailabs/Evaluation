export interface SourceBlock { id: string; location: string; text: string }
export interface DocumentContent { format: string; blocks: SourceBlock[]; warnings: string[]; truncated: boolean }
export const CONTENT_LIMIT = 80000;
export function collectContent(format: string, blocks: SourceBlock[], warnings: string[] = []): DocumentContent {
  let length = 0;
  const kept: SourceBlock[] = [];
  let truncated = false;
  for (const b of blocks) {
    const text = b.text.replace(/\r/g, '').replace(/\u0000/g, '').trim();
    if (!text) continue;
    const remaining = CONTENT_LIMIT - length;
    if (!remaining || kept.length >= 1500) { truncated = true; break; }
    kept.push({ ...b, text: text.slice(0, remaining) });
    length += text.length;
    if (text.length > remaining) { truncated = true; break; }
  }
  if (truncated) warnings.push('읽기 한도(8만 자·1,500개 문단)에 도달해 일부만 표시해요. 원본에서 나머지 내용을 확인해 주세요.');
  if (!kept.length) warnings.push('읽을 수 있는 텍스트가 없어요. 스캔·사진 문서는 OCR 연결이 필요해요.');
  return { format, blocks: kept, warnings, truncated };
}
