'use strict';
// Actual Electron PDF renderer; no WhatsApp session or patient service is loaded.
const {app,BrowserWindow}=require('electron');
const {invoiceDocument}=require('../invoice-document.cjs');
const {loadPdfDocument}=require('../pdf-renderer.cjs');
const {familyLink}=require('../family-profile.cjs');
const assert=require('node:assert/strict');
const timer=setTimeout(()=>{console.error('PDF renderer timed out');app.exit(1);},45000);
app.whenReady().then(async()=>{
 let win;
 try {
  const id='11111111-1111-4111-8111-111111111111';
  const qr=await require('qrcode').toDataURL(familyLink(id),{width:256,margin:4});
  const html=invoiceDocument({id:'synthetic-bill',amount:1000,discount:100,amount_paid:200,service:'X-ray:1000',created_at:'2026-10-21T06:00:00Z'},{id,name:'Synthetic Patient',mobile:'9876543210',registration_number:'BAOR1123',address:'DEWALI AHUWA'},qr);
  win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  await loadPdfDocument(win,html);
  await win.webContents.executeJavaScript('Promise.all([...document.images].map(i=>i.decode()))');
  const content=await win.webContents.executeJavaScript(`({text:document.body.innerText,qr:document.querySelector('img[alt="Clinic family profile QR"]').naturalWidth>0,brand:document.querySelector('img[alt="Balaji clinic letterhead"]').naturalWidth>0,overflow:[...document.querySelectorAll(".sheet-main")].some(e=>e.scrollHeight>e.clientHeight+2)})`);
  assert.ok(content.qr);assert.ok(content.brand);assert.equal(content.overflow,false);assert.match(content.text,/BAOR1123/);assert.match(content.text,/INV-SYNTHETIC-BILL/);assert.doesNotMatch(content.text,/Ramesh Kumar/);assert.match(content.text,/₹700/);assert.match(content.text,/Synthetic Patient/);
  const pdf=await win.webContents.printToPDF({printBackground:true,pageSize:'A4',preferCSSPageSize:true});
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>10000);
  const longHtml=invoiceDocument({id:'long-bill',amount:1700,discount:0,amount_paid:700,service:Array.from({length:17},(_,i)=>'Synthetic service '+(i+1)+':100').join('|'),created_at:'2026-10-21T06:00:00Z'},{id,name:'Synthetic Patient'},qr);
  await loadPdfDocument(win,longHtml);
  const multi=await win.webContents.executeJavaScript('({pages:document.querySelectorAll(".invoice-page").length,overflow:[...document.querySelectorAll(".sheet-main")].some(e=>e.scrollHeight>e.clientHeight+2),totals:document.querySelectorAll(".totals").length})');
  assert.equal(multi.pages,3);assert.equal(multi.overflow,false);assert.equal(multi.totals,1);const longPdf=await win.webContents.printToPDF({printBackground:true,pageSize:'A4',preferCSSPageSize:true});assert.equal(longPdf.subarray(0,5).toString(),'%PDF-');assert.ok(longPdf.length>pdf.length);
  console.log('PASS native branded invoice: financial amounts, distinct registration/bill number, QR and brand images, nonempty PDF and 17-service pagination without overflow');
  win.destroy();clearTimeout(timer);app.exit(0);
 }catch(e){console.error(e);if(win&&!win.isDestroyed())win.destroy();clearTimeout(timer);app.exit(1);}
});
