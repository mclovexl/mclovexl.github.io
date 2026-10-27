/* Local UI fixture only: no credentials, cloud requests, or real photo changes. */
const fs=require('node:fs'), path=require('node:path'), http=require('node:http');
const root=path.resolve(__dirname,'..'), dist=path.join(root,'dist');
const uncapped=process.argv.includes('--uncapped');
const fixtureCount=uncapped ? 76 : process.argv.includes('--pagination') ? 31 : 2;
const mock=`(() => {
  let authorized=true, offline=false;
  const subscribers=new Set();
  const state=()=>({enabled:true,configured:true,initialized:true,authenticated:authorized,authorized,email:'local-test@example.invalid',userId:'local-owner',role:'owner'});
  const photos=[
    {id:'11111111-1111-4111-8111-111111111111',src:'assets/memory-sea.jpg',title:'本地测试 A · 我上传的照片',category:'一起出发',date:'2026-06-24',demo:false,canManage:true,deletedAt:null},
    {id:'22222222-2222-4222-8222-222222222222',src:'assets/memory-sunset.jpg',title:'本地测试 B · 另一位上传的照片',category:'心动限定',date:'',demo:false,canManage:false,deletedAt:null}
  ];
  for(let i=2;i<${fixtureCount};i++) photos.push({id:'30000000-0000-4000-8000-'+String(i).padStart(12,'0'),src:window.UNIVERSE_CONFIG.photos[i%6].src,title:'分页测试 '+String(i+1).padStart(2,'0'),category:['日常可爱','一起出发','心动限定'][i%3],date:'2026-06-24',demo:false,canManage:true,deletedAt:null});
  // Model an old exported setting; the current app must ignore this start hour.
  window.UNIVERSE_BOOTSTRAP={settings:{startTime:'19:30'}};
  if(${uncapped}) photos[photos.length-1].deletedAt=new Date().toISOString();
  const check=()=>{if(offline)throw new Error('本地模拟：网络未连接，请稍后重试');if(!authorized)throw new Error('请先登录');};
  const copy=a=>a.map(p=>({...p}));
  window.UniverseCloud={enabled:true,state,init:async()=>{for(const fn of subscribers)fn(state());},subscribe(fn){subscribers.add(fn);return()=>subscribers.delete(fn);},
    listPhotos:async()=>{check();return copy(photos.filter(p=>!p.deletedAt));},
    listTrashedPhotos:async(offset=0)=>{check();return copy(photos.filter(p=>p.canManage&&p.deletedAt).slice(offset,offset+30));},
    addPhotos:async items=>{check();photos.unshift(...items.map(p=>({...p,canManage:true,deletedAt:null})));return{committed:items.length};},
    movePhotoToTrash:async id=>{check();const p=photos.find(p=>p.id===id&&p.canManage);if(!p)throw new Error('没有权限');p.deletedAt=new Date().toISOString();},
    restorePhoto:async id=>{check();const p=photos.find(p=>p.id===id&&p.canManage);if(!p)throw new Error('没有权限');p.deletedAt=null;},
    logout:async()=>{authorized=false;for(const fn of subscribers)fn(state());}
  };
  document.addEventListener('DOMContentLoaded',()=>{
    const bar=document.createElement('div');bar.style='position:fixed;bottom:8px;left:8px;z-index:99999;padding:7px 10px;background:#fff9e9;color:#8b6554;font:11px sans-serif;border:1px solid #cbbfa6;border-radius:4px';
    bar.textContent='仅本地模拟 · 不连接真实相册 ';
    const label=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';toggle.addEventListener('change',()=>{offline=toggle.checked;});label.append(toggle,'模拟断网');bar.append(label);document.body.append(bar);
  });
})();`;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg'};
http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(pathname==='/qa-fixture.js'){res.writeHead(200,{'Content-Type':mime['.js']});res.end(mock);return;}
  let file=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(dist+path.sep)){res.writeHead(403);res.end();return;}
  try{
    let content=fs.readFileSync(file);
    if(file===path.join(dist,'index.html')) content=content.toString('utf8').replace(/\s*<script src="(?:cloud-config\.js|cloud\.js|vendor\/supabase\.js)" defer><\/script>/g,'').replace('<script src="app.js" defer></script>','<script src="qa-fixture.js" defer></script><script src="app.js" defer></script>');
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(content);
  }catch{res.writeHead(404);res.end();}
}).listen(4178,'127.0.0.1',()=>console.log('Local-only album fixture: http://127.0.0.1:4178/'));
