'use strict';
// Actual Electron PDF renderer; no WhatsApp session or patient service is loaded.
const {app,BrowserWindow}=require('electron');
const {invoiceDocument}=require('../invoice-document.cjs');
const {familyLink}=require('../family-profile.cjs');
const assert=require('node:assert/strict');
const timer=setTimeout(()=>{console.error('PDF renderer timed out');app.exit(1);},45000);
app.whenReady().then(async()=>{
 let win;
 try {
  const id='11111111-1111-4111-8111-111111111111';
  const qr=await require('qrcode').toDataURL(familyLink(id),{width:256,margin:4});
  const html=invoiceDocument({id:'synthetic-bill',amount:1000,discount:100,amount_paid:200,service:'X-ray:1000',created_at:'2026-10-21T06:00:00Z'},{id,name:'Synthetic Patient',mobile:'9876543210'},qr);
  win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
  const content=await win.webContents.executeJavaScript('({text:document.body.innerText,qr:document.querySelector("img").complete&&document.querySelector("img").naturalWidth>0})');
  assert.ok(content.qr);assert.match(content.text,/₹700/);assert.match(content.text,/Synthetic Patient/);
  const pdf=await win.webContents.printToPDF({printBackground:true,pageSize:'A4',preferCSSPageSize:true});
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>10000);
  console.log('PASS native Electron invoice renders financial text, QR image and a nonempty PDF');
  win.destroy();clearTimeout(timer);app.exit(0);
 }catch(e){console.error(e);if(win&&!win.isDestroyed())win.destroy();clearTimeout(timer);app.exit(1);}
});
