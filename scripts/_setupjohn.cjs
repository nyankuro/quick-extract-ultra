const fs=require('fs/promises'),path=require('path');
const {downloadTool,detectTools}=require('../electron/password-tools.cjs');
const {extractInto}=require('../electron/extraction.cjs');
const {path7z}=require('7zip-bin-full');
const ud='H:\Quick Extract Ultra\.john-test';
(async()=>{
  await fs.mkdir(ud,{recursive:true});
  try{
    const r=await downloadTool('john',{userDataDir:ud,sevenZipPath:path7z,extract:extractInto});
    const {tools}=await detectTools(ud);const j=tools.find(t=>t.id==='john');
    console.log('JOHN ready', j.installed, j.exePath, 'zip2john='+j.helpers.zip2john);
  }catch(e){console.log('ERR',e.message);}
})();
