'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const meta=new Map(),rows=new Map(),queue=[];let online=true,connected=true,schemaError=null,server=null,rpcFails=false,rpcCalls=[],user='owner';
const supabase={supabaseUrl:'https://synthetic.invalid',auth:{getSession:async()=>({data:{session:{user:{id:user}}}})},rpc:async(_name,args)=>{rpcCalls.push(args);if(rpcFails)return{error:{message:'Network timeout'}};return{data:{numbers:Array.from({length:32},(_,i)=>'BAOR'+(1109+i))}}},from:()=>({select:()=>({limit:async()=>({error:schemaError}),eq:()=>({maybeSingle:async()=>({data:server,error:null})})})})};
const deps={
 '@/integrations/supabase/client':{supabase},'./localSession':{ensureCloudSession:async()=>connected},
 './offlineDb':{cacheGetAll:async()=>[...rows.values()],cacheGetRow:async(_t,id)=>rows.get(id),cacheUpsertRowFromServer:async(_t,row)=>{const key=[...rows.keys()].find(k=>k.replace(/^local_/,'')===row.id)||row.id;rows.set(key,{...rows.get(key),registration_number:row.registration_number});},metaGet:async k=>meta.get(k),metaSet:async(k,v)=>meta.set(k,v),queueGetAll:async()=>queue},
 './queryClient':{queryClient:{invalidateQueries:async()=>{}}}
};
const moduleHelper={exports:{}};const globals={module:moduleHelper,exports:moduleHelper.exports,require:n=>{if(!deps[n])throw Error(n);return deps[n]},navigator:{get onLine(){return online}},crypto:require('node:crypto').webcrypto,Date,console};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/patientRegistration.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,globals);
const service=moduleHelper.exports;
(async()=>{
rows.set('local_p',{id:'local_p',name:'Pending local edit'});
online=false;await assert.rejects(()=>service.refreshPatientRegistration('local_p'),/इंटरनेट/);online=true;
connected=false;await assert.rejects(()=>service.refreshPatientRegistration('local_p'),/cloud जुड़ा/);connected=true;
schemaError={message:'registration_number missing from schema cache'};await assert.rejects(()=>service.refreshPatientRegistration('local_p'),/कॉलम नहीं/);schemaError=null;
server={id:'p',registration_number:null};await assert.rejects(()=>service.refreshPatientRegistration('local_p'),/backfill/);
server=null;queue.push({table:'patients',op:'insert',tempId:'local_p'});await assert.rejects(()=>service.refreshPatientRegistration('local_p'),/upload नहीं/);
server={id:'p',name:'Old cloud name',registration_number:'BAOR1108'};assert.match((await service.refreshPatientRegistration('local_p')).message,/BAOR1108/);assert.equal(rows.get('local_p').name,'Pending local edit');
rpcFails=true;await assert.rejects(()=>service.warmRegistrationNumbers(true),/timeout/);const request=rpcCalls[0].p_request;
rpcFails=false;await service.warmRegistrationNumbers(true);assert.equal(rpcCalls[1].p_request,request);assert.equal(meta.get('patient-registration:leases').length,1);
await service.warmRegistrationNumbers(true);assert.equal(rpcCalls.length,2);
assert.equal(meta.get('patient-registration:used:'+request),undefined); // Reservation never consumes a patient's number.
console.log('PASS registration service: offline/login/schema/backfill/pending diagnoses, number hydration preserves pending edits, idempotent lost-response reservation, no duplicate refill or foreground allocation');
})().catch(e=>{console.error(e);process.exitCode=1;});
