/* Cloud adapter contract tests. No network or real album mutations. */
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/cloud.js'),'utf8');
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const own='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const row=(id,created_by)=>({id,created_by,album_id:'our-universe',object_path:`our-universe/${id}.jpg`,title:'测试',category:'日常可爱',photo_date:null,created_at:'2026-10-01',deleted_at:null});
const rows=[row(own,owner),row(other,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')];
const requests=[];let failUpdate=false,lostResponse=false,pauseUpdate=null;
class Query {
  constructor(){this.filters=[];this.action='select';this.start=0;this.end=59;}
  select(){return this;}
  update(values){this.action='update';this.values=values;return this;}
  eq(key,value){this.filters.push([key,value,false]);return this;}
  is(key,value){this.filters.push([key,value,false]);return this;}
  not(key,op,value){assert.equal(op,'is');this.filters.push([key,value,true]);return this;}
  order(){return this;}
  limit(n){this.end=n-1;return this;}
  range(start,end){this.start=start;this.end=end;return this;}
  maybeSingle(){this.single=true;return this;}
  async run(){
    requests.push(this);
    const matched=rows.filter(row=>this.filters.every(([k,v,neg])=>neg ? row[k]!==v : row[k]===v));
    if(this.action==='update'){
      if(pauseUpdate)await pauseUpdate;
      if(failUpdate)return{data:null,error:new Error('network failure')};
      const owned=matched.filter(row=>row.created_by===owner);
      for(const row of owned)Object.assign(row,this.values);
      if(lostResponse){lostResponse=false;return{data:null,error:new Error('response lost')};}
      return{data:owned[0]?{id:owned[0].id}:null,error:null};
    }
    const selected=matched.slice(this.start,this.end+1).map(row=>({...row}));
    return{data:this.single?selected[0]||null:selected,error:null};
  }
  then(resolve,reject){return this.run().then(resolve,reject);}
}
const client={
  auth:{onAuthStateChange(){},getSession:async()=>({data:{session:{user:{id:owner,email:'test@example.invalid'}}}}),signOut:async()=>({})},
  rpc:async()=>({data:'owner'}),from(table){assert.equal(table,'album_photos');return new Query();},
  storage:{from(){return{createSignedUrls:async paths=>({data:paths.map(path=>({path,signedUrl:`https://local.invalid/${path}`}))}),remove(){throw new Error('Trash must never remove an original');}};}}
};
const window={UNIVERSE_CLOUD_CONFIG:{url:'https://test.supabase.co',publishableKey:'public-test-key',album:'our-universe',bucket:'our-universe-private'},supabase:{createClient:()=>client}};
vm.runInNewContext(source,{window,location:{hash:'',pathname:'/',search:''},history:{},URLSearchParams,queueMicrotask,Date});
const cloud=window.UniverseCloud;
(async()=>{
  await cloud.init();
  let photos=await cloud.listPhotos();assert.equal(photos.length,2);assert.equal(photos[0].canManage,true);assert.equal(photos[1].canManage,false);
  await cloud.movePhotoToTrash(own);assert.ok(rows[0].deleted_at);assert.equal((await cloud.listPhotos()).length,1);
  assert.equal((await cloud.listTrashedPhotos()).length,1);
  const update=requests.find(r=>r.action==='update');
  assert.deepEqual(Object.keys(update.values),['deleted_at']);assert.ok(update.filters.some(([k,v])=>k==='created_by'&&v===owner));assert.ok(update.filters.some(([k,v])=>k==='album_id'&&v==='our-universe'));
  await cloud.movePhotoToTrash(own); // Idempotent repeated request.
  await cloud.restorePhoto(own);assert.equal(rows[0].deleted_at,null);
  await cloud.restorePhoto(own);assert.equal((await cloud.listTrashedPhotos()).length,0);
  await assert.rejects(cloud.movePhotoToTrash(other),/只能管理/);assert.equal(rows[1].deleted_at,null);
  await assert.rejects(cloud.movePhotoToTrash('not-a-photo'),/没有找到/);
  failUpdate=true;await assert.rejects(cloud.movePhotoToTrash(own),/未移入/);assert.equal(rows[0].deleted_at,null);failUpdate=false;
  lostResponse=true;await cloud.movePhotoToTrash(own);assert.ok(rows[0].deleted_at);await cloud.restorePhoto(own);
  await cloud.listTrashedPhotos(30);const page=requests.at(-1);assert.equal(page.start,30);assert.equal(page.end,59);
  let release;pauseUpdate=new Promise(resolve=>{release=resolve;});
  const inFlight=cloud.movePhotoToTrash(own);await Promise.resolve();await cloud.logout();release();
  await assert.rejects(inFlight,/登录状态已改变/);pauseUpdate=null;
  await assert.rejects(cloud.listPhotos(),/先登录/);
  console.log('PASS: active/trash filtering, uploader scope, restore, idempotency, denied row, failed request, lost response, pagination, logout race; originals untouched.');
})().catch(error=>{console.error(error);process.exitCode=1;});
