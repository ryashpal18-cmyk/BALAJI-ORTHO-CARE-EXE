const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),loaded=new Map();
function load(file){file=path.resolve(file);if(loaded.has(file))return loaded.get(file);const mod={exports:{}};loaded.set(file,mod.exports);const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(js,{module:mod,exports:mod.exports,require:n=>n==='dompurify'?{default:{sanitize:s=>s}}:n.startsWith('.')?load(path.resolve(path.dirname(file),n+'.ts')):require(n)});return mod.exports;}
const {buildPrescriptionHtml,PRESCRIPTION_DOCTOR_QUALIFICATION}=load(path.join(root,'src/lib/prescriptionPrint.ts'));
const input={patient:{name:'Synthetic <Patient>',registration_number:'BAOR0861',mobile:'9876543210',age:61,gender:'female'},diagnosis:'First line\nSecond <line>',medicines:[{name:'Synthetic medicine',dose:'1-0-1',duration:'5 days'},{name:'',dose:'',duration:''}],advice:'Synthetic advice\nKeep follow-up',date:'2026-10-25',followupDate:'2026-10-31'};
const html=buildPrescriptionHtml(input);
for(const text of ['BAOR0861','Synthetic medicine','1-0-1','5 days','Synthetic advice','31/10/2026','25/10/2026','61 years','female'])assert.ok(html.includes(text),text);
assert.ok(html.includes('Synthetic &lt;Patient&gt;'));assert.ok(html.includes('Second &lt;line&gt;'));assert.doesNotMatch(html,/<textarea|<input|<button|<script|M\.S\. Orthopaedics|window\.print/);assert.equal(PRESCRIPTION_DOCTOR_QUALIFICATION,'BPT, MPT, DMRT');
assert.equal((html.match(/<tbody><tr>/g)||[]).length,1);assert.match(html,/@page\{size:A4/);
const empty=buildPrescriptionHtml({...input,diagnosis:'',medicines:[],advice:'',followupDate:''});assert.doesNotMatch(empty,/<h2>Diagnosis|<table|Next follow-up/);
console.log('PASS readonly A4 prescription contains the exact draft, escaped patient/clinical text, registration, dates and supplied doctor qualification; empty rows/sections omitted');
