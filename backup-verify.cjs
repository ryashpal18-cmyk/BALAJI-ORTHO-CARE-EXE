'use strict';
const Database=require('better-sqlite3'),{createHash}=require('crypto');
function verifyBackup(json){
 if(typeof json!=='string'||Buffer.byteLength(json)>200*1024*1024)throw Error('Backup छोटा JSON होना चाहिए (अधिकतम 200 MB)');
 const b=JSON.parse(json),validation=require('./backup-shape.cjs').validateBackupShape(b);
 const db=new Database(':memory:');
 try{db.exec('CREATE TABLE records(t TEXT,id TEXT,data TEXT,PRIMARY KEY(t,id))');const put=db.prepare('INSERT INTO records VALUES(?,?,?)');const counts={};
 db.transaction(()=>{for(const [t,rows]of Object.entries(b.tables)){if(!Array.isArray(rows))throw Error('Invalid table '+t);counts[t]=rows.length;for(const r of rows){if(!r||!r.id)throw Error(t+': record ID missing');put.run(t,String(r.id),JSON.stringify(r));}}})();
 for(const [t,n]of Object.entries(counts))if(db.prepare('SELECT count(*) n FROM records WHERE t=?').get(t).n!==n)throw Error('Restore count mismatch');
 for(const f of b.attachmentFiles?.files||[]){const bytes=Buffer.from(f.base64||'','base64');if(bytes.length!==f.size||createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error('Attachment checksum mismatch');}
 const bills=(b.tables.billing||[]).filter(x=>x.status!=='Cancelled');const totals=bills.reduce((a,x)=>{for(const [k,v]of Object.entries({gross:x.amount||0,discount:x.discount||0,paid:x.amount_paid||0})){if(!Number.isFinite(Number(v))||Number(v)<0)throw Error('Invalid bill amount');a[k]+=Math.round(Number(v)*100);}return a;},{gross:0,discount:0,paid:0});
 return{...validation,counts,totals,records:Object.values(counts).reduce((a,n)=>a+n,0),pending:b.localSnapshot.queue.length,missing:b.attachmentFiles?.missing?.length||0,attachments:b.attachmentFiles?.files?.length||0};
 }finally{db.close();}
}
module.exports={verifyBackup};
