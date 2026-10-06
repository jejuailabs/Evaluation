import {extractOffice} from '../src/infrastructure/office-content';
import {collectContent,type SourceBlock} from '../src/domain/document-content';
/** Bounded, text-only PDF extraction. Never evaluate PDF scripts or load external assets. */
export async function readServerDocument(name:string,bytes:Uint8Array){
 if(!name.toLowerCase().endsWith('.pdf'))return extractOffice(name,bytes);
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const task=pdfjs.getDocument({data:new Uint8Array(bytes),useSystemFonts:false,disableFontFace:true,useWorkerFetch:false});
 const timer=setTimeout(()=>void task.destroy(),20000);
 try{
  const pdf=await task.promise,blocks:SourceBlock[]=[],warnings:string[]=[];let count=0;
  for(let i=1;i<=Math.min(pdf.numPages,80)&&count<80000;i++){
   const page=await pdf.getPage(i),text=(await page.getTextContent()).items.map(item=>'str' in item?item.str:'').join(' ');
   blocks.push({id:`page:${i}`,location:`${i}쪽`,text});count+=text.length;page.cleanup();
  }
  if(pdf.numPages>blocks.length)warnings.push('읽기 한도에 도달해 일부 페이지만 검색·분석해요.');
  return collectContent('PDF',blocks,warnings);
 }finally{clearTimeout(timer);await task.destroy();}
}
