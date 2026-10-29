/* Two loopback origins, one in-memory database; no credentials or cloud writes. */
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const tables=new Map();
let sequence=0;
const dataFor=table=>{if(!tables.has(table))tables.set(table,new Map());return tables.get(table);};
const allowed=new Set(['album_photos','universe_stories','universe_wishes','universe_letter','universe_letter_history','universe_legacy_backups','universe_privilege_uses']);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.mp3':'audio/mpeg'};
function handleApi(input){
  if(!allowed.has(input.table))return {data:null,error:{message:'unknown table'}};
  const table=dataFor(input.table);
  if(input.operation==='upsert'){
    const items=Array.isArray(input.value)?input.value:[input.value];
    for(const item of items)if(!table.has(item.id)){
      if(input.table==='universe_privilege_uses' && [...table.values()].some(row=>row.coupon_key===item.coupon_key && row.status==='pending'))return {data:null,error:{code:'23505',message:'Already pending'}};
      table.set(item.id,{...(input.table==='universe_stories'?{revision:require('node:crypto').randomUUID()}:{}),...(input.table==='universe_privilege_uses'?{status:'pending',responded_at:null}:{}),...item,created_at:item.created_at||new Date(Date.now()+sequence++).toISOString()});
    }
    return {data:null,error:null};
  }
  let selected=[...table.values()].filter(row=>input.filters.every(filter=>{
    if(filter.op==='eq')return row[filter.field]===filter.value;
    if(filter.op==='gt')return row[filter.field]>filter.value;
    if(filter.op==='is')return (row[filter.field]??null)===filter.value;
    if(filter.op==='not')return (row[filter.field]??null)!==filter.value;
    return false;
  }));
  if(input.table==='universe_privilege_uses' && input.operation==='update')selected=selected.filter(row=>row.status==='pending' && (input.value.status==='responded' ? input.actor==='owner' : row.created_by===input.userId));
  if(input.operation==='update')for(const row of selected)Object.assign(row,input.value,input.table==='universe_privilege_uses'?{responded_at:input.value.status==='responded'?new Date().toISOString():null}:{});
  for(const order of [...input.orders].reverse())selected.sort((a,b)=>String(a[order.field]??'').localeCompare(String(b[order.field]??''))*(order.ascending?1:-1));
  selected=selected.slice(input.first,input.last+1);
  return {data:input.single?(selected[0]||null):selected,error:null};
}
function serve(req,res){
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(pathname==='/__qa_api' && req.method==='POST'){
    let body='';
    req.setEncoding('utf8');
    req.on('data',chunk=>body+=chunk);
    req.on('end',()=>{try{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(handleApi(JSON.parse(body))));}catch{res.writeHead(400);res.end('{}');}});
    return;
  }
  if(pathname==='/qa-supabase.js'){
    res.writeHead(200,{'Content-Type':mime['.js'],'Cache-Control':'no-store'});
    res.end(fs.readFileSync(path.join(__dirname,'preview-shared-sdk.js')));
    return;
  }
  const file=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(dist+path.sep)){res.writeHead(403);res.end();return;}
  try{
    let content=fs.readFileSync(file);
    if(file===path.join(dist,'index.html'))content=content.toString('utf8').replace('<script src="vendor/supabase.js" defer></script>','<script src="qa-supabase.js" defer></script>');
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(content);
  }catch{res.writeHead(404);res.end();}
}
for(const port of [4178,4179])http.createServer(serve).listen(port,'127.0.0.1',()=>console.log('Local shared-memory fixture: http://127.0.0.1:'+port+'/'));
