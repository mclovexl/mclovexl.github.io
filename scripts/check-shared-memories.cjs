/* Isolated client integration checks. No real account, network or private data. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto').webcrypto;
const Time=require('../dist/time.js');
const source=fs.readFileSync(path.join(__dirname,'../dist/cloud.js'),'utf8');

function project() {
  const tables=new Map();
  let sequence=0, failTable=null;
  const rows=name=>{if(!tables.has(name))tables.set(name,new Map());return tables.get(name);};
  function client(actor) {
    let session={user:{id:actor.id,email:actor.email}};
    const listeners=[];
    class Query {
      constructor(table){this.table=table;this.operation='select';this.filters=[];this.start=0;this.end=Infinity;this.desc=false;}
      select(){return this;}
      order(field,opts){this.orderField=field;this.desc=opts?.ascending===false;return this;}
      range(start,end){this.start=start;this.end=end;return this;}
      gt(field,value){this.filters.push(row=>row[field]>value);return this;}
      eq(field,value){
        if(['universe_stories','universe_date_ideas'].includes(this.table) && this.operation==='update'){
          assert.ok(['id','revision'].includes(field),'Do not put long story text in URL filters');
        }
        this.filters.push(row=>row[field]===value);return this;
      }
      is(field,value){this.filters.push(row=>row[field]===value);return this;}
      upsert(items){this.operation='upsert';this.items=Array.isArray(items)?items:[items];return this;}
      update(values){this.operation='update';this.values=values;return this;}
      delete(){this.operation='delete';return this;}
      async run(single=false){
        if(!session || !actor.role) return {data:null,error:{message:'forbidden'}};
        if(failTable===this.table){failTable=null;return {data:null,error:{message:'offline'}};}
        const table=rows(this.table);
        if(this.operation==='upsert'){
          for(const item of this.items){
            if(!table.has(item.id)){
              if(this.table==='universe_privilege_uses' && [...table.values()].some(row=>row.coupon_key===item.coupon_key && row.status==='pending'))return {data:null,error:{code:'23505'}};
              const created_at=new Date(1700000000000+sequence++).toISOString();
              if(this.table==='universe_story_messages' && !(item.is_origin && item.story_id===null) && !rows('universe_stories').has(item.story_id))return {data:null,error:{code:'23503'}};
              table.set(item.id,structuredClone({...(['universe_stories','universe_date_ideas'].includes(this.table)?{revision:crypto.randomUUID()}:{}),...(this.table==='universe_privilege_uses'?{status:'pending',responded_at:null}:{}),...item,created_at:item.created_at||created_at,
                ...(this.table==='universe_date_ideas'?{created_by:actor.id,updated_by:actor.id,updated_at:created_at}:{}),
                ...(this.table==='universe_story_messages'?{created_by:actor.id,author_role:actor.role,created_at}:{})}));
            }
          }
          return {data:null,error:null};
        }
        let selected=[...table.values()].filter(row=>this.filters.every(filter=>filter(row)));
        if(this.table==='universe_privilege_uses' && this.operation==='update')selected=selected.filter(row=>row.status==='pending' && (this.values.status==='responded' ? actor.role==='owner' : row.created_by===actor.id));
        if(this.operation==='update') for(const row of selected)Object.assign(row,structuredClone(this.values),this.table==='universe_privilege_uses'?{responded_at:this.values.status==='responded'?new Date().toISOString():null}:{},this.table==='universe_date_ideas'?{updated_by:actor.id,updated_at:new Date().toISOString(),revision:crypto.randomUUID()}:{});
        if(this.operation==='delete'){
          selected=selected.filter(row=>this.table==='universe_privilege_uses' && row.status==='responded');
          for(const row of selected)table.delete(row.id);
        }
        if(this.orderField)selected.sort((a,b)=>String(a[this.orderField]).localeCompare(String(b[this.orderField]))*(this.desc?-1:1));
        selected=selected.slice(this.start,this.end+1);
        return {data:structuredClone(single?(selected[0]||null):selected),error:null};
      }
      maybeSingle(){return this.run(true);}
      then(ok,fail){return this.run().then(ok,fail);}
    }
    return {
      auth:{
        onAuthStateChange(fn){listeners.push(fn);},
        async getSession(){return {data:{session},error:null};},
        async signOut(){session=null;listeners.forEach(fn=>fn('SIGNED_OUT',null));return {error:null};}
      },
      async rpc(name){assert.equal(name,'current_album_role');return {data:actor.role,error:null};},
      from(table){return new Query(table);}
    };
  }
  return {client,rows,failOnce(name){failTable=name;}};
}

async function createActor(db,id,role){
  const actor={id,email:role+'@example.invalid',role};
  const fakeClient=db.client(actor);
  const window={
    UNIVERSE_CLOUD_CONFIG:{enabled:true,url:'https://testproject.supabase.co',publishableKey:'test-public-key',bucket:'test',album:'our-universe'},
    UniverseTime:Time,
    supabase:{createClient:()=>fakeClient}
  };
  const context=vm.createContext({window,location:{hash:'',pathname:'/',search:''},history:{replaceState(){}},
    URLSearchParams,crypto,TextEncoder,Uint8Array,queueMicrotask,Date,Set,Map,Promise,JSON,Array,Error,String,Object,RegExp,Number,Math,fetch});
  new vm.Script(source,{filename:'cloud.js'}).runInContext(context);
  await window.UniverseCloud.init();
  return window.UniverseCloud;
}
const defaults=[
  {id:'wish-sea',text:'一起去看海',done:false},
  {id:'wish-stars',text:'牵着手看星星',done:false}
];
const empty={stories:[],wishes:null,letter:''};
const storyId='11111111-1111-4111-8111-111111111111';
const old={stories:[{id:storyId,date:'2026-06-24',title:'旧故事',body:'本机的回忆'}],
  wishes:[{id:'wish-sea',text:'一起去看海',done:true}],letter:'本机旧情书'};

async function main(){
  const db=project();
  const a=await createActor(db,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner');
  const b=await createActor(db,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','partner');
  const outsider=await createActor(db,'cccccccc-cccc-4ccc-8ccc-cccccccccccc',null);
  await assert.rejects(()=>outsider.listSharedMemories());

  await a.migrateSharedMemories(old,defaults,'默认情书');
  await b.migrateSharedMemories(empty,defaults,'默认情书');
  await a.migrateSharedMemories(old,defaults,'默认情书');
  let left=await a.listSharedMemories(), right=await b.listSharedMemories();
  assert.equal(left.stories.length,1); assert.equal(right.stories[0].body,'本机的回忆');
  assert.equal(right.wishes.find(w=>w.id==='wish-sea').done,true);
  assert.equal(right.letter.body,'本机旧情书');
  assert.equal(db.rows('universe_legacy_backups').size,1);
  assert.equal(right.history.filter(h=>h.source==='legacy').length,1);

  const callId=crypto.randomUUID();
  const call=await b.usePrivilege('pause',callId);
  assert.equal(call.status,'pending');
  assert.equal((await a.listPrivilegeUses()).find(item=>item.id===callId).coupon_key,'pause');
  assert.equal((await b.usePrivilege('pause',callId)).id,callId);
  assert.equal((await a.usePrivilege('pause',crypto.randomUUID())).id,callId);
  assert.equal(db.rows('universe_privilege_uses').size,1);
  await assert.rejects(()=>outsider.listPrivilegeUses());
  await assert.rejects(()=>outsider.usePrivilege('pause',crypto.randomUUID()));
  await assert.rejects(()=>b.usePrivilege('unknown',crypto.randomUUID()));
  await assert.rejects(()=>b.changePrivilegeUse(callId,'responded'));
  const answer=await a.changePrivilegeUse(callId,'responded');
  assert.equal(answer.status,'responded');assert.ok(answer.responded_at);
  assert.equal((await a.changePrivilegeUse(callId,'responded')).id,callId);
  const secondCall=await b.usePrivilege('pause',crypto.randomUUID());
  assert.notEqual(secondCall.id,callId);
  db.failOnce('universe_privilege_uses');
  await assert.rejects(()=>a.changePrivilegeUse(secondCall.id,'responded'));
  assert.equal(db.rows('universe_privilege_uses').get(secondCall.id).status,'pending');
  await b.changePrivilegeUse(secondCall.id,'cancelled');
  assert.ok((await b.usePrivilege('pause',crypto.randomUUID())).id);
  const ownerCall=await a.usePrivilege('listen',crypto.randomUUID());
  await assert.rejects(()=>b.changePrivilegeUse(ownerCall.id,'cancelled'));
  const keptPending=(await a.listPrivilegeUses()).filter(item=>item.status==='pending').map(item=>item.id);
  for(let i=0;i<20;i++){const id=crypto.randomUUID();db.rows('universe_privilege_uses').set(id,{id,coupon_key:'company',status:'responded',created_by:call.created_by,created_at:new Date(Date.now()+i).toISOString(),responded_at:new Date().toISOString()});}
  const privilegeRows=await a.listPrivilegeUses();
  assert.equal(privilegeRows.filter(item=>item.status==='responded').length,6);
  for(const id of keptPending)assert.ok(privilegeRows.some(item=>item.id===id),'Old pending calls stay visible');
  const removedHistory=privilegeRows.find(item=>item.status==='responded');
  const historyTable=db.rows('universe_privilege_uses'),sizeBeforeDelete=historyTable.size;
  await assert.rejects(()=>outsider.deletePrivilegeUse(removedHistory.id));
  db.failOnce('universe_privilege_uses');
  await assert.rejects(()=>a.deletePrivilegeUse(removedHistory.id));
  assert.ok(historyTable.has(removedHistory.id),'A failed delete must retain the record');
  await a.deletePrivilegeUse(removedHistory.id);
  assert.equal(historyTable.size,sizeBeforeDelete-1);
  assert.ok(!(await b.listPrivilegeUses()).some(item=>item.id===removedHistory.id));
  await b.deletePrivilegeUse(removedHistory.id);
  const partnerRemoved=(await b.listPrivilegeUses()).find(item=>item.status==='responded');
  await b.deletePrivilegeUse(partnerRemoved.id);
  assert.ok(!(await a.listPrivilegeUses()).some(item=>item.id===partnerRemoved.id));
  await assert.rejects(()=>a.deletePrivilegeUse(keptPending[0]));
  assert.ok(historyTable.has(keptPending[0]),'Pending calls cannot be deleted');
  await assert.rejects(()=>b.deletePrivilegeUse(secondCall.id));
  console.log('PASS: both members remove redeemed history; failures preserve records, retries are safe, pending/cancelled calls and outsider access are protected.');
  console.log('PASS: private privilege uses sync; duplicate retries, owner-only responses, own cancellations, failed writes and old pending calls.');

  const newStory={id:'22222222-2222-4222-8222-222222222222',date:'2026-10-27',title:'新故事',body:'共同看到'};
  const createdStory=await a.addSharedStory(newStory);
  await b.setSharedWish('wish-sea',false);
  right=await b.listSharedMemories(); left=await a.listSharedMemories();
  assert.equal(right.stories.find(s=>s.id===newStory.id).body,'共同看到');
  assert.equal(left.wishes.find(w=>w.id==='wish-sea').done,false);

  // Either member can edit the same record; stale editors cannot overwrite
  // a newer version, and a retry after a lost response stays idempotent.
  const changedStory={...newStory,date:'2026-07-20',title:'修改后的旅行',body:'第一行回忆\n第二行回忆'};
  const created=db.rows('universe_stories').get(newStory.id);
  const author=created.created_by, createdAt=created.created_at;
  const savedStory=await b.updateSharedStory(changedStory,createdStory);
  left=await a.listSharedMemories();
  assert.deepEqual(JSON.parse(JSON.stringify(left.stories.find(s=>s.id===newStory.id))),JSON.parse(JSON.stringify(savedStory)));
  assert.notEqual(savedStory.revision,createdStory.revision);
  assert.equal(left.stories.length,2);
  assert.equal(created.created_by,author); assert.equal(created.created_at,createdAt);
  await b.updateSharedStory(changedStory,createdStory);
  await assert.rejects(()=>a.updateSharedStory({...newStory,body:'不能覆盖对方的新版本'},createdStory),error=>
    error.name==='StoryConflict' && error.latestStory.body===changedStory.body);
  assert.equal((await a.listSharedMemories()).stories.find(s=>s.id===newStory.id).body,changedStory.body);
  await assert.rejects(()=>outsider.updateSharedStory(newStory,savedStory));
  await assert.rejects(()=>a.updateSharedStory({...changedStory,date:'2026-02-30'},savedStory));
  await assert.rejects(()=>a.updateSharedStory({...changedStory,title:'   '},savedStory));
  await assert.rejects(()=>a.updateSharedStory({...changedStory,body:'x'.repeat(2001)},savedStory));
  db.failOnce('universe_stories');
  await assert.rejects(()=>a.updateSharedStory({...changedStory,body:'稍后重试'},savedStory));
  assert.equal(created.body,changedStory.body);
  const longStory=await a.updateSharedStory({...changedStory,body:'回'.repeat(2000)},savedStory);
  assert.equal(longStory.body.length,2000);
  const legacyVersion=(await a.listSharedMemories()).stories.find(s=>s.id===storyId);
  const changedLegacy={...old.stories[0],body:'旧故事也能修改'};
  await b.updateSharedStory(changedLegacy,legacyVersion);
  await a.migrateSharedMemories(old,defaults,'默认情书');
  assert.equal((await a.listSharedMemories()).stories.find(s=>s.id===storyId).body,changedLegacy.body);

  const previous=left.letter.revision;
  await a.saveSharedLetter('甲的新情书',previous);
  await assert.rejects(()=>b.saveSharedLetter('乙未覆盖的情书',previous),error=>error.name==='LetterConflict');
  right=await b.listSharedMemories();
  assert.equal(right.letter.body,'甲的新情书');
  assert.ok(right.history.some(h=>h.body==='乙未覆盖的情书'));

  const second=project();
  const firstVisit=await createActor(second,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner');
  const oldDevice=await createActor(second,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','partner');
  await firstVisit.migrateSharedMemories(empty,defaults,'默认情书');
  await oldDevice.migrateSharedMemories(old,defaults,'默认情书');
  assert.equal((await firstVisit.listSharedMemories()).wishes.find(w=>w.id==='wish-sea').done,true);
  const seeded=(await oldDevice.listSharedMemories()).letter;
  assert.equal(seeded.source,'seed');
  await oldDevice.promoteLegacyLetter(old.letter,seeded.revision);
  assert.equal((await firstVisit.listSharedMemories()).letter.body,old.letter);
  const edited=await firstVisit.saveSharedLetter('明确修改的内容',(await firstVisit.listSharedMemories()).letter.revision);
  assert.equal(await oldDevice.promoteLegacyLetter('另一封旧信',edited.revision),null);
  assert.equal((await oldDevice.listSharedMemories()).letter.body,'明确修改的内容');
  await firstVisit.setSharedWish('wish-sea',false);
  await oldDevice.migrateSharedMemories(old,defaults,'默认情书');
  assert.equal((await firstVisit.listSharedMemories()).wishes.find(w=>w.id==='wish-sea').done,false);

  const retry=project();
  const member=await createActor(retry,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner');
  retry.failOnce('universe_wishes');
  await assert.rejects(()=>member.migrateSharedMemories(old,defaults,'默认情书'));
  await member.migrateSharedMemories(old,defaults,'默认情书');
  assert.equal((await member.listSharedMemories()).stories.length,1);

  for(let i=0;i<205;i++){
    const id='00000000-0000-4000-8000-'+String(i).padStart(12,'0');
    db.rows('universe_stories').set(id,{id,story_date:'2026-06-24',title:'分页',body:'回忆'});
  }
  assert.equal((await a.listSharedMemories()).stories.length,207);
  console.log('PASS: both members edit stories in place; conflicts, retries, validation, immutable authorship, legacy import, shared wishes/letters and 200+ rows.');

  const dateDefaults=[
    {id:'date-01',title:'一起收藏日落',body:'带上喜欢的饮料，一起慢慢说话',tag:'户外',icon:'☀'},
    {id:'date-02',title:'一起去散步',body:'走一条没走过的路',tag:'日常',icon:'♡'}
  ];
  await a.seedDateIdeas(dateDefaults);await b.seedDateIdeas(dateDefaults);
  const originalDate=(await a.listDateIdeas()).find(idea=>idea.id==='date-01');
  assert.equal((await b.listDateIdeas()).length,2);
  const originalDateAuthor=db.rows('universe_date_ideas').get('date-01').created_by;
  const dateEdit={...dateDefaults[0],body:'小兰想带上登山杖一起去徒步'};
  const editedDate=await b.saveDateIdea(dateEdit,originalDate.revision);
  assert.notEqual(editedDate.revision,originalDate.revision);
  await a.seedDateIdeas(dateDefaults);
  assert.equal((await a.listDateIdeas()).find(idea=>idea.id==='date-01').body,dateEdit.body);
  assert.equal(db.rows('universe_date_ideas').get('date-01').created_by,originalDateAuthor);
  assert.equal(db.rows('universe_date_ideas').get('date-01').updated_by,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  await b.saveDateIdea(dateEdit,originalDate.revision); // exact retry after a lost response
  await assert.rejects(()=>a.saveDateIdea({...dateEdit,body:'过期版本不能覆盖'},originalDate.revision),error=>error.name==='DateIdeaConflict'&&error.latestIdea.body===dateEdit.body);
  db.failOnce('universe_date_ideas');
  await assert.rejects(()=>a.saveDateIdea({...dateEdit,body:'断网时保留'},editedDate.revision));
  assert.equal((await b.listDateIdeas()).find(idea=>idea.id==='date-01').body,dateEdit.body);
  const customDate={id:crypto.randomUUID(),title:'一起去麦霸',body:'听小兰唱歌',tag:'音乐夜',icon:'♫'};
  await a.saveDateIdea(customDate);await a.saveDateIdea(customDate);
  assert.equal((await b.listDateIdeas()).length,3);
  for(const idea of [{...customDate,title:' '},{...customDate,body:'字'.repeat(601)},{...customDate,title:'字'.repeat(41)},{...customDate,icon:'<script>'}])await assert.rejects(()=>a.saveDateIdea(idea));
  await assert.rejects(()=>outsider.listDateIdeas());await assert.rejects(()=>outsider.seedDateIdeas(dateDefaults));await assert.rejects(()=>outsider.saveDateIdea(customDate));

  const originMessage={id:crypto.randomUUID(),storyKey:'origin',body:'小兰，每一段回忆都还想再讲给你听'};
  const reply={id:crypto.randomUUID(),storyKey:newStory.id,body:'管家，那天我也很开心 ♡'};
  const sent=await a.addStoryMessage(originMessage),replied=await b.addStoryMessage(reply);
  assert.equal(sent.author_role,'owner');assert.equal(replied.author_role,'partner');
  assert.equal(sent.created_by,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(replied.story_id,newStory.id);assert.equal(sent.is_origin,true);
  await a.addStoryMessage(originMessage);
  assert.equal((await b.listStoryMessages()).length,2,'retry must not duplicate a message');
  assert.equal(JSON.stringify(await a.listStoryMessages()),JSON.stringify(await b.listStoryMessages()));
  await assert.rejects(()=>b.addStoryMessage(originMessage));
  await assert.rejects(()=>outsider.listStoryMessages());await assert.rejects(()=>outsider.addStoryMessage(originMessage));
  for(const message of [{...reply,id:'invalid'},{...reply,id:crypto.randomUUID(),storyKey:'missing'},{...reply,id:crypto.randomUUID(),body:' '}])await assert.rejects(()=>a.addStoryMessage(message));
  await assert.rejects(()=>a.addStoryMessage({...reply,id:crypto.randomUUID(),storyKey:crypto.randomUUID()}),'a missing story is not a valid message target');
  const retryMessage={id:crypto.randomUUID(),storyKey:'origin',body:'网络恢复后再送给你'};
  db.failOnce('universe_story_messages');await assert.rejects(()=>a.addStoryMessage(retryMessage));
  await a.addStoryMessage(retryMessage);await a.addStoryMessage(retryMessage);
  assert.equal((await b.listStoryMessages()).filter(row=>row.id===retryMessage.id).length,1);
  const longMessage={id:crypto.randomUUID(),storyKey:'origin',body:'把很长的话慢慢说给你听 ♡\n'.repeat(2000).trim()};
  await a.addStoryMessage(longMessage);
  assert.equal((await b.listStoryMessages()).find(row=>row.id===longMessage.id).body,longMessage.body,'long messages must sync without a character limit or truncation');
  for(let i=0;i<205;i++){
    const id='10000000-0000-4000-8000-'+String(i).padStart(12,'0');
    db.rows('universe_story_messages').set(id,{id,is_origin:true,story_id:null,body:'较早的留言',created_by:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',author_role:'owner',created_at:new Date(1600000000000+i).toISOString()});
  }
  assert.equal((await a.listStoryMessages()).length,209);
  await b.logout();await assert.rejects(()=>b.listStoryMessages());await assert.rejects(()=>b.listDateIdeas());
  console.log('PASS: two-person editable date boxes, seed preservation, conflicts, safe retries, story-linked messages, author labels, validation, logout and 200+ messages.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
