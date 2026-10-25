'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const store=require('../sqlite-store.cjs'), KEY='patient-registration:last-number';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'balaji-registration-'));
try {
store.init(dir);
const insert=(id,name='Synthetic')=>store.commitMutation({table:'patients',op:'insert',tempId:id,payload:{id,name}},{id,name,created_at:'2026-10-26',_pendingSync:true});
const pending=insert('local_early');assert.equal(pending.registration_number,null);
// A partial cache write must never initialize numbering.
store.cacheUpsertRow('patients',{id:'partial',registration_number:'BAOR0999'},'id');
assert.equal(store.metaGet(KEY),undefined);
const historic=Array.from({length:1108},(_,i)=>({id:'p'+i,name:'Synthetic',created_at:'2026-01-01',updated_at:'2026-01-02',registration_number:'BAOR'+String(i+1).padStart(4,'0')}));
store.metaSet('patient-registration:scope','test');
store.metaSet('patient-registration:leases',[{requestId:'pc',scope:'test',numbers:Array.from({length:32},(_,i)=>'BAOR'+(1110+i))}]);
store.cacheReplaceTable('patients',[...historic,{...pending,id:'early',registration_number:'BAOR1109'}],'id');
assert.equal(store.cacheGetRow('patients','local_early').registration_number,'BAOR1109');
assert.equal(store.queueGetAll().find(m=>m.tempId==='local_early').payload.registration_number,'BAOR1109');
assert.equal(insert('local_new').registration_number,'BAOR1110');
const update=store.commitMutation({table:'patients',op:'update',rowId:'p0',payload:{name:'Edited'}},{name:'Edited'});
assert.equal(update.registration_number,'BAOR0001');assert.equal(update.updated_at,'2026-01-02');
assert.throws(()=>store.commitMutation({table:'patients',op:'update',rowId:'p0',payload:{registration_number:'BAOR7777'}},{registration_number:'BAOR7777'}),/cannot be edited/);
store.cacheReplaceTable('patients',historic,'id');assert.equal(store.cacheGetRow('patients','p0').name,'Edited');
assert.equal(store.cacheGetRow('patients','p0').registration_number,'BAOR0001');
store.close();store.init(dir);assert.equal(insert('local_restart').registration_number,'BAOR1111');
// A failed durable queue write must roll back both the row and sequence.
const db=store.init(dir);db.exec("CREATE TRIGGER fail_queue BEFORE INSERT ON mutation_queue BEGIN SELECT RAISE(ABORT,'disk full'); END");
assert.throws(()=>insert('local_fail'),/disk full/);assert.equal(store.cacheGetRow('patients','local_fail'),undefined);assert.equal(store.metaGet('patient-registration:used:pc'),2);
db.exec('DROP TRIGGER fail_queue');assert.equal(insert('local_retry').registration_number,'BAOR1112');
// Never reuse the highest number after deletion.
store.commitMutation({table:'patients',op:'delete',rowId:'local_retry'},null);
assert.equal(insert('local_after_delete').registration_number,'BAOR1113');
// Pending demographic edits still acquire an authoritative registration on first full refresh.
store.cacheUpsertRow('patients',{id:'legacy',name:'Local edit',_pendingSync:true},'id');
store.queueAdd({table:'patients',op:'update',rowId:'legacy',payload:{name:'Local edit'}});
store.cacheReplaceTable('patients',[...historic,{id:'legacy',name:'Cloud name',registration_number:'BAOR1300'}],'id');
assert.equal(store.cacheGetRow('patients','legacy').name,'Local edit');assert.equal(store.cacheGetRow('patients','legacy').registration_number,'BAOR1300');
assert.equal(insert('local_next').registration_number,'BAOR1114');
// A second device uses a different reserved pool, never its own max+1.
store.metaSet('patient-registration:leases',[{requestId:'apk',scope:'test',numbers:['BAOR1400','BAOR1401']}]);
assert.equal(insert('local_apk').registration_number,'BAOR1400');
const before=store.snapshot();assert.equal(before.cache.billing,undefined);
const freshDir=fs.mkdtempSync(path.join(os.tmpdir(),'balaji-registration-restore-'));store.close();store.init(freshDir);store.restoreSnapshot(before);assert.equal(insert('restored_new').registration_number,null);store.close();fs.rmSync(freshDir,{recursive:true,force:true});
console.log('PASS durable registration: complete initialization, pending saves, BAOR sequence, restart, immutable edits, refresh protection, deletion high watermark, queue failure rollback; no billing writes');
} finally {store.close();fs.rmSync(dir,{recursive:true,force:true});}
