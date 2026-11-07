'use strict';
const Database=require('better-sqlite3'),{createHash}=require('crypto');
const {assertBackupJsonSize,validateBackupShape,summarizeBackupRecords}=require('./backup-shape.cjs');
const MAX_ATTACHMENT_BYTES=64*1024*1024;
function attachmentBytes(file){
 const text=file.base64||'';
 if(typeof text!=='string'||!text||text.length>Math.ceil(MAX_ATTACHMENT_BYTES*4/3)+8||!/^[A-Za-z0-9+/]*={0,2}$/.test(text)||text.length%4)throw Error('Invalid attachment bytes');
 const bytes=Buffer.from(text,'base64');
 if(!bytes.length||bytes.length>MAX_ATTACHMENT_BYTES)throw Error('Attachment exceeds the 64 MB limit');
 return bytes;
}
function verifyBackup(json){
 assertBackupJsonSize(json);
 const b=JSON.parse(json),validation=validateBackupShape(b);
 const db=new Database(':memory:');
 try{db.exec('CREATE TABLE records(t TEXT,id TEXT,data TEXT,PRIMARY KEY(t,id))');const put=db.prepare('INSERT INTO records VALUES(?,?,?)');const counts={};
 db.transaction(()=>{for(const [t,rows]of Object.entries(b.tables)){if(!Array.isArray(rows))throw Error('Invalid table '+t);counts[t]=rows.length;for(const r of rows){if(!r||!r.id)throw Error(t+': record ID missing');put.run(t,String(r.id),JSON.stringify(r));}}})();
 for(const [t,n]of Object.entries(counts))if(db.prepare('SELECT count(*) n FROM records WHERE t=?').get(t).n!==n)throw Error('Restore count mismatch');
 for(const f of b.attachmentFiles?.files||[]){const bytes=attachmentBytes(f);if(bytes.length!==f.size||createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error('Attachment checksum mismatch');}
 const summary=summarizeBackupRecords(b);
 for(const [table,count]of Object.entries(summary.counts))if(counts[table]!==count)throw Error('Restore count mismatch');
 return{...summary,...validation};
 }finally{db.close();}
}
module.exports={verifyBackup};
