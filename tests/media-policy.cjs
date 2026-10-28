const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const mod={exports:{}};let calls=0;
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/boundedFetch.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports,URL,Headers,Request,Response,AbortController,setTimeout,clearTimeout,fetch:async()=>{calls++;return new Response('{}',{status:400})}});
(async()=>{
 const f=mod.exports.boundedFetch;
 for(const route of ['/storage/v1/object/xray-files/a','/storage/v1/object/reports/a'])await assert.rejects(f('https://clinic.invalid'+route,{method:'POST'}),/disabled/);
 assert.equal(calls,0);
 await f('https://clinic.invalid/rest/v1/patients');await f('https://clinic.invalid/rest/v1/patients');assert.equal(calls,1);
 await f('https://clinic.invalid/rest/v1/patients',{headers:{authorization:'Bearer other-session'}});assert.equal(calls,2);
 await f('https://clinic.invalid/rest/v1/patients',{method:'POST'});assert.equal(calls,3);
 console.log('PASS media upload requests never reach network; rejected reads back off per session; data writes remain available');
})().catch(e=>{console.error(e);process.exitCode=1});
