'use strict';
// Real Electron renderer + actual monitor/React component, isolated synthetic IPC. No clinic login/data/network.
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),assert=require('assert/strict'),os=require('os');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'balaji-diag-renderer-'));app.setPath('userData',path.join(dir,'profile'));
let win;
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{nodeIntegration:true,contextIsolation:false}});
  await win.loadURL('data:text/html,<html><body><div id="root"></div></body></html>');
  const result=await win.webContents.executeJavaScript(`(async()=>{
    const path=require('path'),fs=require('fs'),ts=require(${JSON.stringify(require.resolve('typescript'))}),root=${JSON.stringify(path.resolve(__dirname,'..'))};
    const React=require(path.join(root,'node_modules/react')),ReactDOM=require(path.join(root,'node_modules/react-dom/client'));
    const events=[],opened=[],modes=[];let calls=0,failNext=false;
    const report={success:true,runId:'synthetic-run',generatedAt:new Date().toISOString(),durationMs:12,mode:'quick',summary:{passed:1,warnings:1,errors:1,skipped:1},checks:[{code:'UI-002',status:'error',title:'Synthetic missing function',evidence:{stack:'Synthetic stack'},action:'Check import',verification:'recorded-runtime'},{code:'UI-012',status:'skipped',title:'Other screens not checked',evidence:'Manual test required',action:'Device test',verification:'checked'},{code:'DB-001',status:'pass',title:'SQLite check',evidence:'ok',action:'',verification:'checked'}],text:'Synthetic support report',reportName:'diagnostic-synthetic.txt',jsonName:'diagnostic-synthetic.json',limits:[]};
    window.electron={logRendererError:async e=>{events.push(e);},diagnosticHistory:async()=>[],runDiagnostics:async o=>{calls++;modes.push(o.mode);await new Promise(r=>setTimeout(r,30));if(failNext)return{success:false,error:'DIAG-001 synthetic save failure'};return report;},diagnosticOpenReport:async n=>opened.push(n)};
    const loaded={};
    function load(file){if(loaded[file])return loaded[file];const module={exports:{}};const js=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
      const req=n=>{if(n==='./clientLogger')return load('src/lib/clientLogger.ts');if(n==='react')return React;if(n==='react/jsx-runtime')return require(path.join(root,'node_modules/react/jsx-runtime'));if(n==='@/components/ui/button')return {Button:({children,variant,size,...props})=>React.createElement('button',props,children)};if(n==='@/components/ui/card')return Object.fromEntries(['Card','CardContent','CardHeader','CardTitle'].map(k=>[k,({children,...props})=>React.createElement('div',props,children)]));if(n==='lucide-react')return{Activity:()=>null,Loader2:()=>null};throw Error('Unknown fixture dependency '+n);};
      new Function('require','module','exports',js)(req,module,module.exports);return loaded[file]=module.exports;
    }
    let rejectFetch=false;window.fetch=async()=>{if(rejectFetch)throw new TypeError('synthetic offline');return {ok:false,status:503};};
    const monitor=load('src/lib/errorLogging.ts');monitor.initErrorLogging();monitor.initErrorLogging();
    window.dispatchEvent(new ErrorEvent('error',{message:'ReferenceError: syntheticMissing is not defined',error:new Error('synthetic stack')}));
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection',{promise:Promise.resolve(),reason:new Error('synthetic rejected')}));
    const image=document.createElement('img');document.body.append(image);image.dispatchEvent(new Event('error'));
    await window.fetch('https://synthetic.invalid/rest/v1/patients?name=PATIENT_SECRET');rejectFetch=true;try{await window.fetch('https://synthetic.invalid/secret?api_key=SECRET')}catch{}
    const captured=events.filter(e=>e.source==='ui-runtime');if(captured.length!==1)throw Error('Duplicate runtime listeners');if(events.filter(e=>e.source==='ui-promise').length!==1)throw Error('Promise event missing/duplicate');if(!events.some(e=>e.code==='UI-011'))throw Error('Resource failure missing');if(!events.some(e=>e.code==='NET-001'&&e.detail?.status===503))throw Error('HTTP failure missing');if(JSON.stringify(events).includes('PATIENT_SECRET'))throw Error('Network query leaked');
    const {DiagnosticsPanel}=load('src/components/DiagnosticsPanel.tsx');ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(DiagnosticsPanel));
    const wait=()=>new Promise(r=>setTimeout(r,80));await wait();
    const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
    button('Run Diagnostics').click();await new Promise(r=>setTimeout(r,10));if(!document.querySelector('button[disabled]'))throw Error('Running button not disabled');await wait();if(!document.body.textContent.includes('UI-002'))throw Error('Error code not rendered');
    button('Open TXT').click();button('Open JSON').click();await wait();if(opened.length!==2)throw Error('Report buttons broken');
    const filter=document.querySelector('[aria-label="Diagnostic results filter"]');filter.value='skipped';filter.dispatchEvent(new Event('change',{bubbles:true}));await wait();if(!document.body.textContent.includes('UI-012'))throw Error('Skipped filter broken');
    const mode=document.querySelector('[aria-label="Diagnostic scan mode"]');mode.value='deep';mode.dispatchEvent(new Event('change',{bubbles:true}));await wait();button('Run Diagnostics').click();await wait();if(modes[1]!=='deep')throw Error('Deep mode not forwarded');
    failNext=true;button('Run Diagnostics').click();await wait();if(!document.querySelector('[role="alert"]')?.textContent.includes('DIAG-001'))throw Error('Report save failure not shown');
    // Logger promise rejection is handled, avoiding a recursive unhandled-error storm.
    window.electron.logRendererError=()=>Promise.reject(new Error('synthetic IPC unavailable'));load('src/lib/clientLogger.ts').cLog.error('synthetic','test');await wait();
    return {events:events.length,calls,opened:opened.length,checks:10};
  })()`);
  assert.equal(result.calls,3);assert.equal(result.opened,2);console.log('PASS 10 native Electron diagnostic UI/monitor checks',JSON.stringify(result));
  win.destroy();app.quit();
}).catch(e=>{console.error(e);process.exitCode=1;if(win)win.destroy();app.exit(1);});
app.on('will-quit',()=>{try{fs.rmSync(dir,{recursive:true,force:true})}catch{}});
setTimeout(()=>{console.error('Diagnostic native smoke test timed out');app.exit(1)},45000).unref();
