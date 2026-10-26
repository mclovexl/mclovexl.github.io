const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const [mode,file,offset='0',length='24576']=process.argv.slice(2);
if(mode==='manifest'){
  const files=[];
  const walk=relative=>{
    const absolute=path.join(root,relative);
    if(!fs.existsSync(absolute)) return;
    for(const entry of fs.readdirSync(absolute,{withFileTypes:true})){
      const child=path.posix.join(relative,entry.name);
      if(entry.isDirectory()) walk(child);
      else if(entry.isFile()){const bytes=fs.readFileSync(path.join(root,child));files.push({path:child,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
    }
  };
  for(const folder of ['dist','scripts','supabase','.github']) walk(folder);
  for(const name of ['README.md','ASSETS.md','VERIFICATION.md','package.json','.gitignore','supabase-sdk-version.txt']) if(fs.existsSync(path.join(root,name))){const bytes=fs.readFileSync(path.join(root,name));files.push({path:name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
  process.stdout.write(JSON.stringify(files));
} else if(mode==='chunk' || mode==='text') {
  const absolute=path.resolve(root,file);
  if(!absolute.startsWith(root+path.sep) || /(?:^|[\\/])\.private(?:[\\/]|$)/.test(file)) throw new Error('Source path is not allowed');
  const bytes=fs.readFileSync(absolute);
  process.stdout.write(mode==='text' ? bytes.toString('utf8') : bytes.subarray(Number(offset),Number(offset)+Number(length)).toString('base64'));
} else throw new Error('Use manifest or chunk');
