'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),vm=require('vm'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'balaji-directory-'));
class Adapter{constructor(file){this.db=new DatabaseSync(file);this.depth=0}pragma(s){this.db.exec('PRAGMA '+s)}exec(s){this.db.exec(s)}close(){this.db.close()}prepare(s){const q=this.db.prepare(s);return{all:(...a)=>q.all(...a),get:(...a)=>q.get(...a),run:(...a)=>q.run(...a)}}transaction(fn){return(...a)=>{const id='t'+(++this.depth);this.db.exec('SAVEPOINT '+id);try{const v=fn(...a);this.db.exec('RELEASE '+id);return v}catch(e){this.db.exec('ROLLBACK TO '+id);this.db.exec('RELEASE '+id);throw e}finally{--this.depth}}}}
const mod={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../sqlite-store.cjs'),'utf8'),{module:mod,require:n=>n==='better-sqlite3'?Adapter:n==='./logger.cjs'?{logInfo(){},logError(){}}:require(n)});const store=mod.exports;store.init(dir);const up=(t,r)=>store.cacheUpsertRow(t,r,'id');let passes=0;const pass=s=>{passes++;console.log('PASS '+s)};

const helper={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/lib/patientDirectory.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(require,helper,helper.exports);const H=helper.exports;
try {
 const p={id:'p1',name:'Ram Kumar',mobile:'+91 98765 43210',address:' Khinwara ',branch_id:'a'};
 up('patients',p);up('patients',{...p,id:'local_p1',address:'Rani'});
 up('patients',{...p,id:'p2',name:'Family person',address:'khinwara'});
 up('patients',{id:'p3',name:'सीता देवी',mobile:'९१२३४५६७८०',address:'खिंवाड़ा',branch_id:'b'});
 up('patients',{id:'p4',name:'No Phone',mobile:'9999999999',address:null});
 assert.equal(store.patientDirectoryRows().length,4);assert.equal(store.patientDirectoryRows().find(p=>p.id==='p1').address,' Khinwara ');pass('local/canonical duplicates count once; family members stay separate');
 up('patients',{...p,id:'local_p1',address:' Khinwara ',name:'Updated Ram',_pendingSync:true});
 up('patients',{...p,id:'old-patient'});store.metaSet('alias:patients:old-patient','p1');
 const before=JSON.stringify(store.snapshot()),rows=store.patientDirectoryRows();
 assert.equal(rows.length,4);assert.equal(rows.find(p=>p.id==='p1').name,'Updated Ram');assert.equal(JSON.stringify(store.snapshot()),before);pass('aliases and pending changes resolved without any database/queue mutation');
 assert.equal(H.filterPatients(rows,'ram','',null).length,1);assert.equal(H.filterPatients(rows,'सीता','',null).length,1);pass('English and Hindi partial-name search');
 assert.equal(H.filterPatients(rows,'98765-43210','',null).length,2);assert.equal(H.filterPatients(rows,'९१२३','',null).length,1);assert.equal(H.filterPatients(rows,'+91 9876543210','',null).length,2);pass('formatted phones, country code and Hindi digits');
 const opts=H.villageOptions(rows);assert.equal(opts.find(o=>o.key==='khinwara').count,2);assert.equal(opts.find(o=>o.key==='').count,1);pass('case/space normalized village counts and missing address choice');
 assert.equal(H.filterPatients(rows,'','khin',null).length,2);assert.equal(H.filterPatients(rows,'ram','','khinwara').length,1);assert.equal(H.filterPatients(rows,'','','').length,1);assert.equal(H.filterPatients(rows,'','khinwara','खिंवाड़ा').length,0);pass('combined village/name filters; no invented Hindi-English spelling match');
 const selected=H.filterPatients(rows,'','','khinwara');assert.deepEqual(H.uniqueSmsNumbers(selected),['9876543210']);assert.deepEqual(H.uniqueSmsNumbers(rows).sort(),['9123456780','9876543210']);pass('unique valid SMS numbers, invalid/dummy excluded, families not duplicated');
 assert.equal(H.filterPatients(rows.filter(p=>p.branch_id==='a'),'','',null).length,2);pass('branch selection applied before search and village counts');
 const handlers={}, {EventEmitter}=require('events'),app=new EventEmitter();app.quit=()=>{};app.getPath=()=>dir;app.setAsDefaultProtocolClient=()=>{};let authorized=false;
 const timer=global.setInterval;global.setInterval=()=>0;
 try{require('../pc-messaging.cjs').registerPcMessaging({app,BrowserWindow:function(){},ipcMain:{handle:(n,f)=>handlers[n]=f},dialog:{},shell:{},store,access:{getPrincipal:()=>authorized?{role:'admin'}:{role:'staff'}}});assert.throws(()=>handlers['patients:directory'](),/Administrator/);authorized=true;assert.equal(handlers['patients:directory']().length,4);}finally{global.setInterval=timer;app.emit('before-quit',{preventDefault(){}});}
 pass('main-process patient directory rejects non-admin and returns local data for admin');
 console.log(passes+' patient directory checks passed');
}finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
