const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const {createOffline}=require(root+'/offline-login.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'owner-ui-')),key=crypto.randomBytes(32);
const safeStorage={isEncryptionAvailable:()=>true,
 encryptString:s=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);const b=Buffer.concat([c.update(s,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),b])},
 decryptString:b=>{const d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString()}};
let principal=null,api,cloudCalls=0;
const access={getPrincipal:()=>principal,setPrincipal:p=>{principal=p}};
const restart=()=>{principal=null;api=createOffline({file:path.join(dir,'offline-admin.json'),safeStorage,access,fetchCloud:()=>{cloudCalls++;throw Error('offline')}})};
restart();
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || undefined,args:JSON.parse(process.env.CHROMIUM_ARGS || '["--no-sandbox"]'),headless:true});
 try {
 const context=await browser.newContext();
 await context.exposeFunction('__auth',async(op,args)=>{
  if(op==='check')return {valid:!!(principal||api.restore()),principal};
  return api[op](args);
 });
 await context.addInitScript(()=>{
  Object.defineProperty(navigator,'onLine',{get:()=>false});
  const id='11111111-1111-4111-8111-111111111111';
  const tables=JSON.parse(localStorage.getItem('ui-test-db') || 'null') || {beds:[{id:'bed-1',bed_number:'1',bed_type:'Ward',status:'available',patient_id:null},{id:'bed-2',bed_number:'2',bed_type:'Ward',status:'available',patient_id:null}],branches:[{id,name:'Clinic',is_active:true}],patients:[{id,name:'Saved Patient',mobile:'9123456780',branch_id:id,created_at:new Date().toISOString()}],billing:[{id,patient_id:id,branch_id:id,amount:1000,amount_paid:200,status:'Partial',service:'Test',created_at:new Date().toISOString(),patients:{name:'Saved Patient',mobile:'9123456780'}}]};
  window.__testTables=tables;window.__testQueue=[];localStorage.setItem('bocc_selected_branch',id);
  localStorage.setItem('bocc_daily_backup_enabled','false');
  window.electron={checkAuth:()=>window.__auth('check'),offlineStatus:()=>window.__auth('status'),offlineSetup:a=>window.__auth('setup',a),offlineLogin:a=>window.__auth('login',a),logout:()=>window.__auth('logout'),syncSession:()=>window.__auth('connect'),isOnline:async()=>({online:false}),
   offline:{commitMutation:async(m,row)=>{if(window.__failSave)return {success:false,error:'Test disk write failed'};const target=tables[m.table].find(r=>r.id===m.rowId);Object.assign(target,row);window.__testQueue.push(m);localStorage.setItem('ui-test-db',JSON.stringify(tables));return {success:true,data:target}},cacheGetAll:async t=>({success:true,data:tables[t]||[]}),cacheGetRow:async(t,id)=>({success:true,data:tables[t]?.find(r=>r.id===id)}),queueGetAll:async()=>({success:true,data:[]}),metaGet:async()=>({success:true}),isLegacyMigrated:async()=>({success:true,migrated:true}),snapshot:async()=>({success:true,data:{cache:tables,queue:[],meta:{}}})},
   backupGetDir:async()=>({success:true,path:'/test'}),backupList:async()=>({success:true,files:[]}),getAppVersion:async()=>({version:'test'}),getLogsDir:async()=>'/test',getSafetySnapshotDir:async()=>'/test'};
 });
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/#/login');
 await page.getByRole('button',{name:'Admin banayein aur shuru karein'}).waitFor();
 await page.getByPlaceholder('Email or staff username').fill('owner@example.test');
 await page.getByPlaceholder('Enter password').fill('UI-Test-Only-Password');
 await page.getByLabel('Confirm password').fill('UI-Test-Only-Password');
 await page.getByRole('button',{name:'Admin banayein aur shuru karein'}).click();
 await page.waitForURL('**/#/dashboard');
 assert.equal(principal.role,'admin');assert.equal(cloudCalls,0);
 
 const id='11111111-1111-4111-8111-111111111111';
 await page.goto('http://127.0.0.1:4173/#/ipd');
 await page.getByRole('button',{name:'New Admission',exact:true}).click();await page.getByLabel('Bed',{exact:true}).selectOption('bed-1');await page.getByLabel('Patient',{exact:true}).selectOption(id);await page.getByRole('button',{name:'Save Bed',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>window.__testTables.beds[0].status),'occupied');assert.equal(await page.evaluate(()=>window.__testQueue.length),1);await page.getByRole('button',{name:'Bed 1, occupied',exact:true}).getByText('Saved Patient').waitFor();
 await page.reload();await page.getByRole('button',{name:'Bed 1, occupied',exact:true}).waitFor();
 await page.getByRole('button',{name:'Bed 2, available',exact:true}).click();await page.getByLabel('Patient',{exact:true}).selectOption(id);await page.getByRole('button',{name:'Save Bed',exact:true}).click();await page.getByText('Patient pehle se bed 1 par assigned hai.',{exact:true}).first().waitFor();assert.equal(await page.evaluate(()=>window.__testQueue.length),0);await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Bed 1, occupied',exact:true}).click();await page.getByLabel('Status',{exact:true}).selectOption('available');await page.evaluate(()=>window.__failSave=true);await page.getByRole('button',{name:'Save Bed',exact:true}).click();await page.getByText('Test disk write failed',{exact:true}).first().waitFor();assert.equal(await page.getByRole('dialog').count(),1);assert.equal(await page.evaluate(()=>window.__testTables.beds[0].status),'occupied');
 await page.evaluate(()=>window.__failSave=false);await page.getByRole('button',{name:'Save Bed',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.__testTables.beds[0].patient_id),null);assert.equal(await page.evaluate(()=>window.__testTables.patients.length),1);assert.equal(await page.evaluate(()=>window.__testTables.billing.length),1);
 await page.getByRole('button',{name:'Bed 2, available',exact:true}).click();await page.getByLabel('Status',{exact:true}).selectOption('reserved');await page.getByLabel('Patient',{exact:true}).selectOption(id);await page.getByRole('button',{name:'Save Bed',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.getByRole('button',{name:'Bed 2, reserved',exact:true}).click();await page.getByLabel('Status',{exact:true}).selectOption('occupied');await page.getByRole('button',{name:'Save Bed',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 for(const width of [1366,1024,800]) {await page.setViewportSize({width,height:600});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert.ok(overflow<=1,`overflow at ${width}: ${overflow}`);}
 assert.deepEqual(errors,[]);console.log('PASS: offline admit/reload, patient name, duplicate allocation blocked, failure retains form and bed, release retains patient/bill, reserve/admit, 1366/1024/800px layouts.');
 }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exit(1)});
