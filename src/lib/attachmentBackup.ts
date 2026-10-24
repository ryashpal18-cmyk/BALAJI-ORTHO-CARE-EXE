import { refreshClinicalUrl } from './clinicalFiles';
const MAX_BYTES=64*1024*1024;
const FIELDS=new Set(['file_url','_localFileUrl','image_url','image_path','file_path','filePath','imagePath','local_path','pdf_url']);
export type AttachmentFile={sources:string[];mime:string;base64:string;sha256:string;size:number};
function identity(source:string){
 if(source.startsWith('data:'))return source;
 try{const u=new URL(source);if(u.protocol==='https:')return u.origin+u.pathname.replace(/\/object\/(?:public|sign)\//,'/object/');}catch{}
 return source;
}
export function attachmentSources(value:any){
 const groups=new Map<string,Set<string>>();
 const add=(id:string,source:string)=>{if(!groups.has(id))groups.set(id,new Set());groups.get(id)!.add(source);};
 const walk=(item:any)=>{if(!item||typeof item!=='object')return;if(Array.isArray(item)){item.forEach(walk);return;}
  const alias=typeof item._localFileUrl==='string'&&typeof item.file_url==='string'&&item._localFileUrl.startsWith('data:');
  if(alias){const id=identity(item.file_url);add(id,item._localFileUrl);add(id,item.file_url);}
  for(const [key,v]of Object.entries(item)){if(alias&&['_localFileUrl','file_url'].includes(key))continue;if(FIELDS.has(key)&&typeof v==='string'&&v)add(identity(v),v);else if(v&&typeof v==='object')walk(v);}};
 walk(value);return [...groups.values()].map(s=>[...s]);
}
function toBase64(bytes:Uint8Array){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}
function bytesFromBase64(text:string){if(!text||text.length>Math.ceil(MAX_BYTES*4/3)+8||!/^[A-Za-z0-9+/]*={0,2}$/.test(text)||text.length%4)throw Error('Invalid attachment bytes');return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}
function mimeOf(b:Uint8Array){const first=(n:number)=>String.fromCharCode(...b.subarray(0,n));if(first(5)==='%PDF-')return'application/pdf';if(b[0]===255&&b[1]===216&&b[2]===255)return'image/jpeg';if([137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x))return'image/png';if(first(4)==='RIFF'&&String.fromCharCode(...b.subarray(8,12))==='WEBP')return'image/webp';throw Error('फोटो/PDF की असली फाइल नहीं मिली।');}
async function pack(bytes:Uint8Array,expectedMime?:string){if(!bytes.length||bytes.length>MAX_BYTES)throw Error('फाइल खाली है या 64 MB से बड़ी है।');const mime=mimeOf(bytes);if(expectedMime&&mime!==expectedMime)throw Error('फाइल का content और MIME अलग हैं।');const hash=await crypto.subtle.digest('SHA-256',bytes.buffer as ArrayBuffer);return{mime,base64:toBase64(bytes),sha256:[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join(''),size:bytes.length};}
export async function captureAttachments(value:any,onProgress?:(done:number,total:number)=>void){
 const groups=attachmentSources(value),files:AttachmentFile[]=[],missing:{source:string;error:string}[]=[];
 for(let i=0;i<groups.length;i++){
  const sources=groups[i],source=sources[0];
  try{let file:any;
   if(source.startsWith('data:')){const m=source.match(/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,(.*)$/s);if(!m)throw Error('Unsupported embedded file');file=await pack(bytesFromBase64(m[2]),m[1]);}
   else {
    try{file=await (window as any).electron?.attachment?.read(source);}catch{}
    if(!file){if(!/^https:/.test(source))throw Error('स्थानीय फोटो नहीं मिली या clinic image folder के बाहर है।');
     const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
     try{const signed=await refreshClinicalUrl(source),response=await fetch(signed,{signal:controller.signal});if(!response.ok)throw Error('फोटो download नहीं हुई ('+response.status+')');if(Number(response.headers.get('content-length')||0)>MAX_BYTES)throw Error('फाइल 64 MB से बड़ी है।');const reader=response.body?.getReader();if(!reader)throw Error('File stream unavailable');const chunks:Uint8Array[]=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES){await reader.cancel();throw Error('फाइल 64 MB से बड़ी है।');}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}file=await pack(bytes);try{await (window as any).electron?.attachment?.write({source,...file});}catch{}
     }finally{clearTimeout(timer);}
    }
    file=await pack(bytesFromBase64(file.base64),file.mime);
   }
   const prior=files.find(f=>f.sha256===file.sha256&&f.mime===file.mime);if(prior)prior.sources=[...new Set([...prior.sources,...sources])];else files.push({sources,...file});
   for(const alias of sources.filter(s=>s.startsWith('https:')))try{await (window as any).electron?.attachment?.write({source:alias,...file});}catch{}
  }catch(e:any){missing.push({source,error:e?.message||'फाइल उपलब्ध नहीं है'});}
  onProgress?.(i+1,groups.length);await new Promise(r=>setTimeout(r,0));
 }
 return{version:1,files,missing,total:groups.length,complete:missing.length===0};
}
export async function restoreAttachmentData(backup:any){
 if(!backup.attachmentFiles)return backup;
 const archive=backup.attachmentFiles;if(archive.version!==1||!Array.isArray(archive.files))throw Error('Invalid photo backup');
 const replacements=new Map<string,string>();
 for(const file of archive.files){if(!Array.isArray(file.sources)||file.sources.some((s:any)=>typeof s!=='string'))throw Error('Invalid attachment reference');const actual=await pack(bytesFromBase64(file.base64),file.mime);if(actual.sha256!==file.sha256||actual.size!==file.size)throw Error('फोटो checksum नहीं मिला; restore रोका गया।');const data=`data:${actual.mime};base64,${actual.base64}`;for(const source of file.sources){if(replacements.has(source)&&replacements.get(source)!==data)throw Error('Duplicate photo reference conflict');replacements.set(source,data);if(source.startsWith('https:'))try{await (window as any).electron?.attachment?.write({source,...actual});}catch{}}
 }
 const rewrite=(v:any,key=''):any=>{if(typeof v==='string')return FIELDS.has(key)?replacements.get(v)||v:v;if(Array.isArray(v))return v.map(x=>rewrite(x));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,rewrite(x,k)]));return v;};
 return{...backup,tables:rewrite(backup.tables),localSnapshot:{...backup.localSnapshot,cache:rewrite(backup.localSnapshot?.cache),queue:rewrite(backup.localSnapshot?.queue)}};
}
