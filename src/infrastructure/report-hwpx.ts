import {Unzip,UnzipInflate,zipSync,strToU8,strFromU8} from 'fflate';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {hwpxHeader,hwpxSectionProperties} from './hwpx-style';
import {exportMetrics,exportPeriod,exportTitle,isAnnualReport,reportSheets,type ExportReport} from './report-data';
const esc=(x:unknown)=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const ns=[...hwpxHeader.matchAll(/xmlns:[a-z0-9]+="[^"]+"/g)].map(m=>m[0]).join(' ');
export function boundedArchive(bytes:Uint8Array){
 if(bytes.length>25*1024*1024)throw new Error('양식 파일은 25MB까지예요.');
 const files:Record<string,Uint8Array>=Object.create(null);let count=0,total=0,open=0,failure=false;
 const unzip=new Unzip(file=>{if(++count>3000||files[file.name]||file.name.split('/').includes('..')||file.name.startsWith('/')||/^Scripts\//i.test(file.name))throw new Error('지원하지 않는 양식 구성이에요.');files[file.name]=new Uint8Array();open++;const chunks:Uint8Array[]=[];let size=0;file.ondata=(error,data,final)=>{if(error){failure=true;return;}total+=data.length;size+=data.length;if(total>60*1024*1024){failure=true;file.terminate();return;}chunks.push(data);if(final){const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}files[file.name]=bytes;open--;}};file.start();});unzip.register(UnzipInflate);
 for(let i=0;i<bytes.length;i+=4096){unzip.push(bytes.subarray(i,i+4096),i+4096>=bytes.length);if(failure)throw new Error('손상되었거나 너무 큰 양식이에요.');}if(open)throw new Error('양식 압축이 불완전해요.');
 for(const [name,content] of Object.entries(files))if(/\.(xml|hpf)$/i.test(name)){const text=strFromU8(content);if(/<!DOCTYPE|<!ENTITY/i.test(text)||XMLValidator.validate(text)!==true)throw new Error('양식 XML을 확인해 주세요.');}return files;
}
export const reportFields=(r:ExportReport)=>({title:exportTitle(r),period:exportPeriod(r),purpose:r.purpose,note:r.note,reportId:r.id,metrics:exportMetrics(r).map(m=>`${m.name} | 목표 ${m.target??'—'} | 예상 ${m.forecast??'—'} | 확인 ${m.actual??'—'} ${m.unit}`).join('\n'),budget:isAnnualReport(r)?`계획 ${r.budget} / 집행 ${r.spent} / 지급 ${r.paid}`:`배정 ${r.budget.allocated} / 집행 ${r.budget.spent} / 지급 ${r.budget.paid}`});
export type TemplateMapping=Record<string,keyof ReturnType<typeof reportFields>>;
export function hwpxTextFields(bytes:Uint8Array){const files=boundedArchive(bytes);return Object.keys(files).filter(k=>/^Contents\/section\d+\.xml$/.test(k)).flatMap(path=>[...strFromU8(files[path]).matchAll(/<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>/g)].map((m,i)=>({key:`${path}#${i}`,text:String(new XMLParser({ignoreAttributes:true}).parse(`<text>${m[1]}</text>`).text??'')})));}
export function fillHWPX(bytes:Uint8Array,r:ExportReport,mapping:TemplateMapping){
 const files=boundedArchive(bytes),fields=reportFields(r),keys=new Set(hwpxTextFields(bytes).map(f=>f.key));
 if(!Object.keys(mapping).length||Object.keys(mapping).some(k=>!keys.has(k))||Object.values(mapping).some(v=>!(v in fields)))throw new Error('양식에 연결할 항목을 확인해 주세요.');
 for(const path of Object.keys(files).filter(k=>/^Contents\/section\d+\.xml$/.test(k))){let n=0;files[path]=strToU8(strFromU8(files[path]).replace(/<hp:t(\s[^>]*)?>([\s\S]*?)<\/hp:t>/g,(match,attrs)=>{const mapped=mapping[`${path}#${n++}`];return mapped?`<hp:t${attrs??''}>${fields[mapped].split('\n').map(esc).join('<hp:lineBreak/>')}</hp:t>`:match;}).replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g,''));}
 delete files['Preview/PrvImage.png'];files['Preview/PrvText.txt']=strToU8(Object.values(fields).join('\n'));
 return zipSync({mimetype:[strToU8('application/hwp+zip'),{level:0}],...Object.fromEntries(Object.entries(files).filter(([k])=>k!=='mimetype'))});
}
function paragraph(text:string,id:number,style=0){return `<hp:p id="${id}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${style}"><hp:t>${esc(text)}</hp:t></hp:run></hp:p>`;}
function table(rows:string[][],id:number){const cols=rows[0].length,width=Math.floor(42520/cols),height=2200;
 return `<hp:p id="${id}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:tbl id="${id}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length}" colCnt="${cols}" cellSpacing="0" borderFillIDRef="1" noAdjust="0"><hp:sz width="${width*cols}" widthRelTo="ABSOLUTE" height="${height*rows.length}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="140" right="140" top="140" bottom="140"/>${rows.map((row,ri)=>`<hp:tr>${row.map((v,ci)=>`<hp:tc name="" header="${ri===0?1:0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="1"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${paragraph(v,id+ri*cols+ci+1)}</hp:subList><hp:cellAddr colAddr="${ci}" rowAddr="${ri}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${width}" height="${height}"/><hp:cellMargin left="140" right="140" top="140" bottom="140"/></hp:tc>`).join('')}</hp:tr>`).join('')}</hp:tbl></hp:run></hp:p>`;
}
export function reportHWPX(r:ExportReport){
 let id=100;const text=[exportTitle(r),exportPeriod(r),r.purpose];
 let section=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hs:sec ${ns}><hp:p id="1" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${hwpxSectionProperties}<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl><hp:t/></hp:run></hp:p>`+text.map(t=>paragraph(t,id++)).join('');
 for(const sheet of reportSheets(r)){section+=paragraph(sheet.name,id++,7);const columns=Math.max(...sheet.rows.map(row=>row.length));if(columns<=6&&sheet.rows.length<200){section+=table(sheet.rows.map(row=>Array.from({length:columns},(_,n)=>String(row[n]??''))),id);id+=sheet.rows.length*columns+10;}else for(const row of sheet.rows)section+=paragraph(row.map(x=>String(x??'')).join(' | '),id++);}
 section+='</hs:sec>';
 const files:Record<string,Uint8Array>={
  'version.xml':strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="1" os="1" xmlVersion="1.4" application="Value Lens" appVersion="1.0"/>'),
  'Contents/header.xml':strToU8(hwpxHeader),'Contents/section0.xml':strToU8(section),
  'Contents/content.hpf':strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><opf:package xmlns:opf="http://www.idpf.org/2007/opf/" version="" unique-identifier="" id=""><opf:metadata><opf:title>${esc(exportTitle(r))}</opf:title><opf:language>ko</opf:language></opf:metadata><opf:manifest><opf:item id="version" href="version.xml" media-type="application/xml"/><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/></opf:manifest><opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>`),
  'META-INF/container.xml':strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>'),
  'META-INF/manifest.xml':strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>'),
  'Preview/PrvText.txt':strToU8(text.join('\n')),
 };return zipSync({mimetype:[strToU8('application/hwp+zip'),{level:0}],...files});
}
