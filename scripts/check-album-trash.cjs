/* Cloud adapter contract tests. No network or real album mutations. */
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/cloud.js'),'utf8');
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const own='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const row=(id,created_by)=>({id,created_by,album_id:'our-universe',object_path:`our-universe/${id}.jpg`,title:'测试',category:'日常可爱',photo_date:null,created_at:'2026-10-01',deleted_at:null});
const rows=[row(own,owner),row(other,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')];
const requests=[],signedBatches=[];
let failUpdate=false,lostResponse=false,pauseUpdate=null,serverCap=1000,failReadAfter=0,readCount=0,afterRead=null;
let clockNow=Date.now();
class TestDate extends Date { static now(){return clockNow;} }
class Query {
  constructor(){this.filters=[];this.orders=[];this.action='select';this.start=0;this.end=999;}
  select(){return this;}
  update(values){this.action='update';this.values=values;return this;}
  eq(key,value){this.filters.push([key,value,false]);return this;}
  is(key,value){this.filters.push([key,value,false]);return this;}
  not(key,op,value){assert.equal(op,'is');this.filters.push([key,value,true]);return this;}
  order(key,{ascending=true}={}){this.orders.push({key,ascending});return this;}
  or(filters){
    const match=/^created_at\.lt\.("[^"]*"),and\(created_at\.eq\.\1,id\.lt\.([0-9a-f-]+)\)$/.exec(filters);
    assert.ok(match,'Expected a timestamp and UUID cursor');
    this.cursor={time:JSON.parse(match[1]),id:match[2]};return this;
  }
  limit(n){this.end=n-1;return this;}
  range(start,end){this.start=start;this.end=end;return this;}
  maybeSingle(){this.single=true;return this;}
  async run(){
    requests.push(this);
    let matched=rows.filter(row=>this.filters.every(([k,v,neg])=>neg ? row[k]!==v : row[k]===v));
    if(this.action==='update'){
      if(pauseUpdate)await pauseUpdate;
      if(failUpdate)return{data:null,error:new Error('network failure')};
      const owned=matched.filter(row=>row.created_by===owner);
      for(const row of owned)Object.assign(row,this.values);
      if(lostResponse){lostResponse=false;return{data:null,error:new Error('response lost')};}
      return{data:owned[0]?{id:owned[0].id}:null,error:null};
    }
    if(this.cursor)matched=matched.filter(row=>row.created_at<this.cursor.time||(row.created_at===this.cursor.time&&row.id<this.cursor.id));
    matched.sort((a,b)=>{for(const {key,ascending} of this.orders){const order=a[key]===b[key]?0:a[key]<b[key]?-1:1;if(order)return ascending?order:-order;}return 0;});
    if(failReadAfter&&++readCount===failReadAfter)return{data:null,error:new Error('read interrupted')};
    const selected=matched.slice(this.start,Math.min(this.end+1,this.start+serverCap)).map(row=>({...row}));
    if(afterRead)afterRead(this,selected);
    return{data:this.single?selected[0]||null:selected,error:null};
  }
  then(resolve,reject){return this.run().then(resolve,reject);}
}
const client={
  auth:{onAuthStateChange(){},getSession:async()=>({data:{session:{user:{id:owner,email:'test@example.invalid'}}}}),signOut:async()=>({})},
  rpc:async()=>({data:'owner'}),from(table){assert.equal(table,'album_photos');return new Query();},
  storage:{from(){return{createSignedUrls:async paths=>{signedBatches.push([...paths]);return{data:paths.map(path=>({path,signedUrl:`https://local.invalid/${path}`}))};},remove(){throw new Error('Trash must never remove an original');}};}}
};
const window={UNIVERSE_CLOUD_CONFIG:{url:'https://test.supabase.co',publishableKey:'public-test-key',album:'our-universe',bucket:'our-universe-private'},supabase:{createClient:()=>client}};
vm.runInNewContext(source,{window,location:{hash:'',pathname:'/',search:''},history:{},URLSearchParams,queueMicrotask,Date:TestDate});
const cloud=window.UniverseCloud;
(async()=>{
  await cloud.init();
  let photos=await cloud.listPhotos();assert.equal(photos.length,2);assert.equal(photos.find(p=>p.id===own).canManage,true);assert.equal(photos.find(p=>p.id===other).canManage,false);
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
  // Over 1,000 rows, repeated timestamps, and a server cap below our batch size.
  const original=rows.map(r=>({...r}));
  const largeRows=Array.from({length:1007},(_,i)=>({...row(i.toString(16).padStart(8,'0')+'-0000-4000-8000-000000000000',owner),created_at:i%2?'2026-10-01T10:00:00.123456+00:00':'2026-10-02T10:00:00.123456+00:00'}));
  rows.splice(0,rows.length,...largeRows);serverCap=123;
  photos=await cloud.listPhotos();assert.equal(photos.length,1007);assert.equal(new Set(photos.map(p=>p.id)).size,1007);
  assert.ok(photos.every(p=>p.src));assert.ok(signedBatches.every(batch=>batch.length<=100));
  const signedBefore=signedBatches.length;await cloud.listPhotos();assert.equal(signedBatches.length,signedBefore,'Reuse valid photo links');
  clockNow+=56*60000;await cloud.listPhotos();assert.ok(signedBatches.length>signedBefore,'Refresh expiring photo links');
  failReadAfter=2;readCount=0;await assert.rejects(cloud.listPhotos(),/没有读到/);failReadAfter=0;
  // Inserting a new leading row and removing an unread row must not shift the cursor.
  let changed=false;
  const newRow={...row('ffffffff-0000-4000-8000-000000000000',owner),created_at:'2026-11-01T00:00:00+00:00'};
  afterRead=(_query,data)=>{if(changed||!data.length)return;changed=true;rows.shift();rows.push(newRow);};
  photos=await cloud.listPhotos();afterRead=null;
  assert.equal(photos.length,1006);assert.equal(new Set(photos.map(p=>p.id)).size,1006);assert.ok(!photos.some(p=>p.id===newRow.id));
  assert.equal((await cloud.listPhotos()).length,1007);
  rows.splice(0,rows.length,...original);serverCap=1000;
  let release;pauseUpdate=new Promise(resolve=>{release=resolve;});
  const inFlight=cloud.movePhotoToTrash(own);await Promise.resolve();await cloud.logout();release();
  await assert.rejects(inFlight,/登录状态已改变/);pauseUpdate=null;
  await assert.rejects(cloud.listPhotos(),/先登录/);
  console.log('PASS: 1,007 photos without truncation, tied timestamps, smaller server page cap, concurrent inserts/deletes, batched/cached signing, failed reads; trash, restore and logout checks passed; originals untouched.');
})().catch(error=>{console.error(error);process.exitCode=1;});
