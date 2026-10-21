'use strict';
const path=require('path'),fs=require('fs');
const {parseFamilyLink,familyGroups,familyRecords}=require('./family-profile.cjs');
function registerPcMessaging({app,BrowserWindow,ipcMain,dialog,shell,store,access}) {
  let pending=null;
  const accept=args=>{for(const arg of args||[]){const id=parseFamilyLink(arg);if(id)pending=id;}};
  accept(process.argv);
  app.on('second-instance',(_e,args)=>accept(args));
  app.on('open-url',(e,url)=>{if(parseFamilyLink(url)){e.preventDefault();accept([url]);}});
  if(process.defaultApp)app.setAsDefaultProtocolClient('balajiclinic',process.execPath,[path.resolve(process.argv[1]||'.')]);
  else app.setAsDefaultProtocolClient('balajiclinic');
  const allowed=()=>access.getPrincipal()?.role==='admin';
  async function renderPdf(html) {
    const win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,partition:'invoice-pdf'}});
    let timer;
    try {
      const task=(async()=>{await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));return win.webContents.printToPDF({printBackground:true,pageSize:'A4',preferCSSPageSize:true});})();
      return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('PDF rendering timed out')),30000);})]);
    }finally{clearTimeout(timer);if(!win.isDestroyed())win.destroy();}
  }
  const service=require('./whatsapp-service.cjs').createWhatsAppService({store,root:path.join(app.getPath('userData'),'clinic-messaging'),allowed,renderPdf});
  const admin=fn=>(...args)=>{if(!allowed())throw Error('Administrator login required');return fn(...args);};
  ipcMain.handle('family:list',admin(()=>familyGroups(store.cacheGetAll('patients'))));
  ipcMain.handle('family:profile',admin((_e,id)=>familyRecords(store,id)));
  ipcMain.handle('family:pending',admin(()=>{const id=pending;pending=null;return id;}));
  ipcMain.handle('whatsapp:status',admin(()=>service.status()));
  ipcMain.handle('whatsapp:connect',admin(()=>service.connect()));
  ipcMain.handle('whatsapp:disconnect',admin(()=>service.disconnect()));
  ipcMain.handle('whatsapp:auto',admin((_e,value)=>service.setAuto(value)));
  ipcMain.handle('whatsapp:enqueue',admin((_e,billId)=>service.enqueue(billId)));
  ipcMain.handle('whatsapp:review',admin((_e,{id,action})=>service.review(id,action)));
  ipcMain.handle('whatsapp:pdf',admin(async(_e,{billId,save})=>{
    const file=await service.createPdf(billId);
    if(!allowed())throw Error('Administrator login required');
    if(save){const result=await dialog.showSaveDialog({defaultPath:'Balaji-Bill.pdf',filters:[{name:'PDF',extensions:['pdf']}]});if(result.canceled)return{cancelled:true};fs.copyFileSync(file,result.filePath);return{success:true};}
    const error=await shell.openPath(file);if(error)throw Error(error);return{success:true};
  }));
  const timer=setInterval(()=>{void service.tick().catch(()=>{});},15000);
  app.on('before-quit',()=>{clearInterval(timer);service.stop();});
  return service;
}
module.exports={registerPcMessaging};
