const { app, BrowserWindow } = require('electron'); const fs=require('fs'),os=require('os'),path=require('path')
app.whenReady().then(async()=>{const t=path.join(os.tmpdir(),'s.html');fs.writeFileSync(t,'<meta charset=utf-8>');const w=new BrowserWindow({show:false});await w.loadFile(t)
const r=await w.webContents.executeJavaScript(`new Promise(res=>{const i=new Image();i.onload=()=>res(i.width+'x'+i.height);i.src='file:///'+${JSON.stringify(process.argv[2])}})`)
process.stdout.write('\n@@OUT '+r+'\n');app.quit()})
