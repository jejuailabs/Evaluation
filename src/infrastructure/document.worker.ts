import { extractOffice } from './office-content';
self.onmessage = (event: MessageEvent<{name: string; bytes: ArrayBuffer}>) => {
  try { self.postMessage({ result: extractOffice(event.data.name, new Uint8Array(event.data.bytes)) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : '문서를 읽지 못했어요.' }); }
};
