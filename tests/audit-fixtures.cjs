// Shared fixture dependencies for source-level VM tests (no real cloud).
const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript');
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/paymentLedger.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:m.exports,module:m});
function queryMock(value) {
  if (!value || typeof value !== 'object' || typeof value.then === 'function') return value;
  return new Proxy(value,{get(target,key){
    // Older mock query builders expose single() only. Both terminal methods
    // return the same populated response in these non-conflict fixtures.
    const member = key === 'maybeSingle' && !target[key] ? target.single : target[key];
    return typeof member === 'function' ? (...args)=>queryMock(member.apply(target,args)) : member;
  }});
}
module.exports={normalizeBill:m.exports.normalizeBill,queryMock};
