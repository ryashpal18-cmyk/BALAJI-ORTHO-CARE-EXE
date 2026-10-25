'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{fileURLToPath}=require('url');
const MAX_BYTES=64*1024*1024;
function identity(source){const u=new URL(source);if(u.protocol!=='https:'||!u.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/(?:invoices|prescriptions|reports|xray-files)\//))throw Error('Unsupported clinical file URL');return u.origin+u.pathname.replace(/\/object\/(?:public|sign|authenticated)\//,'/object/');}
function mimeOf(bytes){if(bytes.subarray(0,5).toString()==='%PDF-')return'application/pdf';if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return'image/jpeg';if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return'image/png';if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return'image/webp';throw Error('JPEG, PNG, WebP या PDF की असली फाइल चाहिए।');}
function createAttachmentCache({cacheRoot,localRoots,cloudOrigin}){
 const roots=localRoots.map(p=>path.resolve(p));
 const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
 function remoteKey(source){const id=identity(source);if(new URL(source).origin!==cloudOrigin)throw Error('यह फाइल configured clinic storage की नहीं है।');return hash(id);}
 function pack(bytes){if(!bytes.length||bytes.length>MAX_BYTES)throw Error('फाइल खाली है या 64 MB से बड़ी है।');const mime=mimeOf(bytes);return{base64:bytes.toString('base64'),mime,sha256:hash(bytes),size:bytes.length};}
 function read(source){if(typeof source!=='string')throw Error('Invalid attachment source');
  if(/^https:/i.test(source)){try{identity(source);}catch{return null;}const key=remoteKey(source);if(!fs.existsSync(path.join(cacheRoot,key+'.bin'))||!fs.existsSync(path.join(cacheRoot,key+'.json')))return null;const data=pack(fs.readFileSync(path.join(cacheRoot,key+'.bin'))),meta=JSON.parse(fs.readFileSync(path.join(cacheRoot,key+'.json'),'utf8'));if(data.sha256!==meta.sha256)throw Error('फोटो cache checksum नहीं मिला।');return data;}
  const value=source.startsWith('file:')?fileURLToPath(source):source;if(!path.isAbsolute(value))throw Error('Absolute clinical file path required');const real=fs.realpathSync(value);
  if(!roots.some(root=>{try{const rel=path.relative(fs.realpathSync(root),real);return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);}catch{return false;}}))throw Error('फाइल clinic image folders के बाहर है।');
  const stat=fs.statSync(real);if(!stat.isFile()||stat.size>MAX_BYTES)throw Error('फाइल 64 MB से बड़ी है।');return pack(fs.readFileSync(real));
 }
 function write({source,base64,mime}){const key=remoteKey(source);if(typeof base64!=='string'||base64.length>Math.ceil(MAX_BYTES*4/3)+8||!base64||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)||base64.length%4)throw Error('Invalid attachment bytes');const bytes=Buffer.from(base64,'base64'),data=pack(bytes);if(data.mime!==mime)throw Error('फाइल का MIME और content अलग हैं।');fs.mkdirSync(cacheRoot,{recursive:true});for(const [ext,value] of [['bin',bytes],['json',JSON.stringify({sha256:data.sha256,mime:data.mime,size:data.size})]]){const file=path.join(cacheRoot,key+'.'+ext);fs.writeFileSync(file+'.tmp',value);fs.renameSync(file+'.tmp',file);}return{sha256:data.sha256,size:data.size};}
 return{read,write};
}
module.exports={createAttachmentCache,mimeOf,identity,MAX_BYTES};
