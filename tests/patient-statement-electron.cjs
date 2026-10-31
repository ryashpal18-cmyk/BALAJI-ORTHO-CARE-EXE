'use strict';
// Actual Electron PDF renderer and actual React statement component; synthetic data/IPC only.
const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),path=require('path'),fs=require('fs'),os=require('os');
const {buildStatement,statementDocument}=require('../patient-statement.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'balaji-statement-render-'));app.setPath('userData',path.join(dir,'profile'));
let win;const timer=setTimeout(()=>app.exit(1),45000);
// Keep the process alive between the PDF window and the React UI window.
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{try{
  const patient={id:'synthetic-patient',name:'Synthetic <script>Patient</script>',mobile:'9876543210'};
  const bills=Array.from({length:70},(_,i)=>({id:'synthetic-bill-'+i,patient_id:patient.id,amount:1000,discount:100,amount_paid:200,service:'X-ray:1000',created_at:'2026-10-01T06:00:00Z',payment_history:[{id:'synthetic-receipt-'+i,amount:200,paid_at:'2026-10-02T06:00:00Z',payment_mode:'UPI'}]}));
  const statement=buildStatement({patient,bills});
  win=new BrowserWindow({show:false,width:1050,height:900,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(statementDocument(statement)));
  const content=await win.webContents.executeJavaScript('({text:document.body.innerText,tables:document.querySelectorAll("table").length,scripts:document.scripts.length})');
  assert.match(content.text,/₹49,000.00/);assert.match(content.text,/synthetic-bill-69/i);assert.equal(content.tables,2);assert.equal(content.scripts,0);
  const pdf=await win.webContents.printToPDF({printBackground:true,pageSize:'A4',preferCSSPageSize:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>15000);assert.ok((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length>=2);
  console.log('PASS real multi-page statement PDF renders all 70 bills/receipts, totals and escaped patient text');win.destroy();
  win=new BrowserWindow({show:false,width:1050,height:900,webPreferences:{nodeIntegration:true,contextIsolation:false}});
  await win.loadURL('data:text/html,<html><body><div id="root"></div></body></html>');
  const result=await win.webContents.executeJavaScript(`(async()=>{
    const path=require('path'),fs=require('fs'),root=${JSON.stringify(path.resolve(__dirname,'..'))},ts=require(${JSON.stringify(require.resolve('typescript'))});
    const React=require(path.join(root,'node_modules/react')),ReactDOM=require(path.join(root,'node_modules/react-dom/client'));
    let source={patient:{id:'selected-patient',name:'Synthetic Patient',mobile:'9876543210'},billCount:2,paymentCount:2,totals:{gross:100000,discount:10000,net:90000,paid:20000,due:70000,credit:0},warnings:[],pending:1,excluded:0,fingerprint:'expected-revision',scope:'Selected patient only',generatedAt:new Date().toISOString()};
    let stale=false,cancelSave=false;const calls=[],toasts=[],routes=[];
    window.electron={statement:{preview:async id=>{calls.push(['preview',id]);return source;},pdf:async(id,fingerprint,save)=>{calls.push(['pdf',id,fingerprint,save]);if(stale)throw Error('STATEMENT-004: changed');return cancelSave?{cancelled:true}:{success:true};},enqueue:async(id,fingerprint)=>{calls.push(['enqueue',id,fingerprint]);return{state:'queued'};}}};
    const module={exports:{}},code=ts.transpileModule(fs.readFileSync(path.join(root,'src/components/PatientStatement.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
    const req=n=>{if(n==='react')return React;if(n==='react/jsx-runtime')return require(path.join(root,'node_modules/react/jsx-runtime'));if(n==='react-router-dom')return{useNavigate:()=>p=>routes.push(p)};if(n==='@/hooks/use-toast')return{toast:t=>toasts.push(t)};if(n==='@/components/ui/button')return{Button:({children,variant,size,...props})=>React.createElement('button',props,children)};if(n==='@/components/ui/dialog')return{Dialog:({open,children})=>open?React.createElement('div',null,children):null,DialogContent:({children,...props})=>React.createElement('div',props,children),DialogHeader:({children})=>React.createElement('div',null,children),DialogTitle:({children})=>React.createElement('h2',null,children)};throw Error(n);};
    new Function('require','module','exports',code)(req,module,module.exports);
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(module.exports.PatientStatement,{patientId:'selected-patient'}));
    const wait=()=>new Promise(r=>setTimeout(r,80)),button=t=>[...document.querySelectorAll('button')].find(b=>b.textContent===t);await wait();
    button('Patient Statement / पूरा हिसाब PDF').click();await wait();if(!document.body.textContent.includes('₹700.00'))throw Error('Balance not shown');
    button('PDF खोलें').click();await wait();button('PDF Save करें').click();await wait();if(calls.filter(c=>c[0]==='pdf').length!==2)throw Error('PDF actions missing');
    const toastCount=toasts.length;cancelSave=true;button('PDF Save करें').click();await wait();if(toasts.length!==toastCount)throw Error('Cancelled dialog claims success');cancelSave=false;
    stale=true;button('PDF खोलें').click();await wait();if(!document.querySelector('[role="alert"]')?.textContent.includes('STATEMENT-004'))throw Error('Stale revision failure hidden');stale=false;
    button('हिसाब फिर पढ़ें').click();await wait();button('इसी मरीज को WhatsApp भेजें').click();await wait();const send=calls.find(c=>c[0]==='enqueue');if(send[1]!=='selected-patient'||send[2]!=='expected-revision'||routes[0]!=='/whatsapp')throw Error('Recipient/revision route incorrect');
    source={...source,patient:{...source.patient,mobile:''}};button('Patient Statement / पूरा हिसाब PDF').click();await wait();if(!button('इसी मरीज को WhatsApp भेजें').disabled)throw Error('Missing phone still sends');if(button('PDF खोलें').disabled)throw Error('Missing phone blocks local PDF');
    return{checks:7,pdfActions:calls.filter(c=>c[0]==='pdf').length};
  })()`);
  assert.equal(result.checks,7);console.log('PASS 7 native patient statement UI checks',JSON.stringify(result));
  win.destroy();clearTimeout(timer);app.exit(0);
}catch(e){console.error(e);if(win&&!win.isDestroyed())win.destroy();clearTimeout(timer);app.exit(1);}});
app.on('will-quit',()=>{try{fs.rmSync(dir,{recursive:true,force:true})}catch{}});
