/* Two loopback origins, one in-memory database; no credentials or cloud writes. */
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const tables=new Map();
let sequence=0;
const dataFor=table=>{if(!tables.has(table))tables.set(table,new Map());return tables.get(table);};
if(process.argv.includes('--together'))dataFor('universe_stories').set('11111111-1111-4111-8111-111111111111',{
  id:'11111111-1111-4111-8111-111111111111',story_date:'2026-07-13',title:'一起收藏日落',body:'这是预览用的故事，留言只保存在本地演示中',revision:require('node:crypto').randomUUID(),created_by:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',created_at:new Date().toISOString()
});
const allowed=new Set(['album_photos','universe_stories','universe_wishes','universe_letter','universe_letter_history','universe_legacy_backups','universe_privilege_uses','universe_date_ideas','universe_story_messages','universe_mail_letters','universe_mail_replies']);
if(process.argv.includes('--mailbox')){
  const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',partner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const examples=[['把今天的小事，也写成一封信','亲爱的小兰：\n\n今天的天空很好看，回家的路上又想起了你。那些平凡的小事，也想一件一件讲给你听。\n\n往后还想和你一起，收藏很多个这样的傍晚。\n\n管家 ♡','owner',owner],['你的信，我认真读完啦','管家：\n\n收到你的信，今天又多了一点开心。以后也想把我的小日常，一封一封寄给你。\n\n小兰 ♡','partner',partner]];
  examples.forEach(([title,body,author_role,created_by],index)=>{
    const id='31111111-1111-4111-8111-11111111111'+index;
    dataFor('universe_mail_letters').set(id,{id,title,body,author_role,created_by,created_at:`2026-11-0${6+index}T11:30:00Z`});
  });
  dataFor('universe_mail_replies').set('41111111-1111-4111-8111-111111111111',{id:'41111111-1111-4111-8111-111111111111',letter_id:'31111111-1111-4111-8111-111111111110',is_original:false,body:'那下次的傍晚，我们也一起看 ♡',author_role:'partner',created_by:partner,created_at:'2026-11-07T12:00:00Z'});
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.mp3':'audio/mpeg'};
function handleApi(input){
  if(!allowed.has(input.table))return {data:null,error:{message:'unknown table'}};
  const table=dataFor(input.table);
  if(input.operation==='upsert'){
    const items=Array.isArray(input.value)?input.value:[input.value];
    for(const item of items)if(!table.has(item.id)){
      if(input.table==='universe_privilege_uses' && [...table.values()].some(row=>row.coupon_key===item.coupon_key && row.status==='pending'))return {data:null,error:{code:'23505',message:'Already pending'}};
      if(input.table==='universe_story_messages' && !(item.is_origin && item.story_id===null) && !dataFor('universe_stories').has(item.story_id))return {data:null,error:{code:'23503',message:'Story missing'}};
      if(input.table==='universe_mail_replies' && !(item.is_original && item.letter_id===null) && !dataFor('universe_mail_letters').has(item.letter_id))return {data:null,error:{code:'23503',message:'Letter missing'}};
      const when=new Date(Date.now()+sequence++).toISOString();
      table.set(item.id,{...(['universe_stories','universe_date_ideas'].includes(input.table)?{revision:require('node:crypto').randomUUID()}:{}),...(input.table==='universe_privilege_uses'?{status:'pending',responded_at:null}:{}),...item,created_at:item.created_at||when,
        ...(input.table==='universe_date_ideas'?{created_by:input.userId,updated_by:input.userId,updated_at:when}:{}),
        ...(['universe_story_messages','universe_mail_letters','universe_mail_replies'].includes(input.table)?{created_by:input.userId,author_role:input.actor,created_at:when}:{})});
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
  if(input.operation==='update')for(const row of selected)Object.assign(row,input.value,input.table==='universe_privilege_uses'?{responded_at:input.value.status==='responded'?new Date().toISOString():null}:{},input.table==='universe_date_ideas'?{updated_by:input.userId,updated_at:new Date().toISOString(),revision:require('node:crypto').randomUUID()}:{});
  if(input.operation==='delete'){
    selected=selected.filter(row=>input.table==='universe_privilege_uses' && row.status==='responded' && ['owner','partner'].includes(input.actor));
    for(const row of selected)table.delete(row.id);
  }
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
