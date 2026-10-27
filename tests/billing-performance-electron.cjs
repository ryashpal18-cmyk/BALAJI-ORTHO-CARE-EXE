'use strict';
const {app,BrowserWindow}=require('electron'),path=require('path'),fs=require('fs'),os=require('os');
const {buildFixture,verifyBillingUI}=require('./billing-performance-fixture.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'billing-perf-'));app.setPath('userData',dir);let win;
const timer=setTimeout(()=>app.exit(1),60000);
app.whenReady().then(async()=>{try{const code=await buildFixture(path.resolve(__dirname,'..'));win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{contextIsolation:false,nodeIntegration:false}});await win.loadURL('data:text/html,<html><body><div id="root"></div></body></html>');await win.webContents.executeJavaScript(code);const result=await win.webContents.executeJavaScript('('+verifyBillingUI.toString()+')()');console.log('PASS actual Billing React/Radix performance and full export',JSON.stringify(result));clearTimeout(timer);app.exit(0);}catch(e){console.error(e);clearTimeout(timer);app.exit(1);}});
