(() => {
  'use strict';
  const $=selector=>document.querySelector(selector);
  const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
  const name=role=>role==='owner'?'管家':'小兰';
  const recipient=role=>role==='owner'?'小兰':'管家';
  const date=value=>new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
  const replyKey=row=>row.is_original?'original':row.letter_id;
  const pageSize=6;

  function create({cloud,onLogin,notify,celebrate,getOriginal}) {
    const scrollBehavior=window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
    let state=cloud.state(),identity=null,generation=0,mutation=0;
    let letters=[],replyRefs=[],ready=false,error='',page=1,gridSignature='',flight=null;
    let selected=null,readRequest=0,replyRequest=0,postingNew=false,postingReply=false;
    let newPending=null;
    const bodies=new Map(),replies=new Map(),drafts=new Map();
    const reader=$('#mail-reader-dialog'),composer=$('#mail-compose-dialog');
    const composeForm=$('#mail-compose-form'),replyForm=$('#mail-reply-form');
    const titleInput=composeForm.elements.namedItem('title'),bodyInput=composeForm.elements.namedItem('body');
    const replyInput=replyForm.elements.namedItem('body');

    function access() {if(state.authorized)return true;onLogin();return false;}
    function replyCount(key) {return replyRefs.filter(row=>replyKey(row)===key).length;}
    function button(cls,text) {const e=node('button',cls,text);e.type='button';return e;}
    function envelope(letter) {
      const original=letter.id==='original',key=letter.id;
      const card=button('mail-envelope-card'+(original?' is-original':''),'');
      card.dataset.letterKey=key;card.setAttribute('aria-haspopup','dialog');card.setAttribute('aria-controls','mail-reader-dialog');
      if(original)card.id='open-letter';
      card.setAttribute('aria-label',`拆开${original?'我们的第一封信':letter.title}`);
      const label=node('span','mail-card-label',original?'THE FIRST LETTER':'A LETTER BETWEEN US');
      const stamp=node('span','mail-card-stamp','♡');stamp.setAttribute('aria-hidden','true');
      const shape=node('span','mail-envelope');shape.setAttribute('aria-hidden','true');shape.append(node('i','mail-envelope-flap'),node('b','mail-seal','♡'));
      const count=replyCount(key);
      const footer=node('span','mail-card-footer');
      footer.append(node('span','',count?`${count} 封回信`:'等一句回音'),node('span','mail-card-open','拆开这封信 ↗'));
      card.append(label,stamp,shape,node('span','mail-card-title',original?'我们的第一封信':letter.title),node('span','mail-card-to',`${name(letter.author_role)} 写给 ${recipient(letter.author_role)}`),node('span','mail-card-date',original?'从故事的开始，到很久很久以后':date(letter.created_at)),footer);
      card.addEventListener('click',()=>openLetter(key));return card;
    }
    function renderGrid() {
      const all=[{id:'original',author_role:'owner'},...(state.authorized?letters:[])];
      const pages=Math.max(1,Math.ceil(all.length/pageSize));page=Math.max(1,Math.min(page,pages));
      $('#mail-count').textContent=`已珍藏 ${all.length} 封信 · ${state.authorized?replyRefs.length:0} 封回信`;
      $('#mail-status').textContent=!state.authorized?'登录共同相册，把新信和回信留在我们的信箱里':error||(!ready?'正在取出我们的信件…':'我们的信件和回信已同步 ♡');
      $('#mail-refresh').hidden=!state.authorized;$('#mail-refresh').disabled=!!flight;
      const signature=JSON.stringify([state.userId,page,all.map(row=>[row.id,row.title,row.author_role,row.created_at,replyCount(row.id)])]);
      if(signature!==gridSignature) {
        gridSignature=signature;
        $('#mail-grid').replaceChildren(...all.slice((page-1)*pageSize,page*pageSize).map(envelope));
      }
      $('#mail-pagination').hidden=pages===1;
      $('#mail-page-info').textContent=`第 ${page} / ${pages} 页`;
      $('#mail-prev').disabled=page===1;$('#mail-next').disabled=page===pages;
    }
    function setNewBusy(busy) {titleInput.disabled=busy;bodyInput.disabled=busy;composeForm.querySelector('[type="submit"]').disabled=busy;}
    function setReplyBusy(busy) {replyInput.disabled=busy;replyForm.querySelector('[type="submit"]').disabled=busy;}
    function draft(key) {if(!drafts.has(key))drafts.set(key,{body:'',pending:null});return drafts.get(key);}
    function renderReplies(key) {
      if(key!==selected)return;
      const rows=replies.get(key)||[];
      const list=$('#mail-reply-list');list.replaceChildren();
      for(const row of rows) {
        const card=node('article','mail-reply-entry'+(row.created_by===state.userId?' is-mine':''));
        const meta=node('div','mail-reply-meta');const time=node('time','',date(row.created_at));time.dateTime=row.created_at;
        meta.append(node('b','',`${name(row.author_role)} 的回信`),time);
        card.append(meta,node('p','',row.body));list.append(card);
      }
      if(!rows.length)list.append(node('p','mail-reply-empty','这封信，等我们写下第一句回音'));
      $('#mail-reply-count').textContent=String(replyCount(key));
    }
    function renderOriginal() {
      if(selected!=='original')return;
      const original=getOriginal();
      $('#mail-letter-body').textContent=state.authorized&&!original.ready?'正在取出我们的第一封信…':original.body;
      $('#mail-letter-signature').textContent=state.authorized&&!original.ready?'':`永远偏爱你的，${original.sender}`;
    }
    async function refreshReplies(key,force=false) {
      if(!state.authorized||!key)return;
      if(postingReply&&!force)return;
      const current=generation,request=++replyRequest;
      try {
        const rows=await cloud.listMailReplies(key);
        if(current!==generation||request!==replyRequest)return;
        replies.set(key,rows);
        replyRefs=[...replyRefs.filter(row=>replyKey(row)!==key),...rows.map(({id,letter_id,is_original})=>({id,letter_id,is_original}))];
        renderGrid();renderReplies(key);
        if(key===selected)$('#mail-reader-status').textContent='这封信的回音已同步 ♡';
      } catch(err) {
        if(current===generation&&request===replyRequest&&key===selected)$('#mail-reader-status').textContent=err.message||'回信暂时没有同步，请稍后重试';
      }
    }
    async function refresh() {
      if(!state.authorized||postingNew||postingReply)return;
      if(flight?.generation===generation)return flight.promise;
      const current=generation,version=mutation;
      const operation=(async()=>{
        try {
          const next=await cloud.listMailbox();
          if(current!==generation||version!==mutation||postingNew||postingReply)return;
          letters=next.letters;replyRefs=next.replies;ready=true;error='';renderGrid();
          if(reader.open&&selected)await refreshReplies(selected);
        } catch(err) {if(current===generation){error=err.message||'信箱暂时没有同步，请检查网络后重试';renderGrid();}}
      })();
      flight={generation:current,promise:operation};
      renderGrid();
      try{await operation;}finally{if(flight?.promise===operation){flight=null;renderGrid();}}
    }
    async function openLetter(key) {
      if(key!=='original'&&!access())return;
      const letter=key==='original'?{title:'我们的第一封信',author_role:'owner'}:letters.find(row=>row.id===key);
      if(!letter){notify('这封信暂时没有找到，刷新信箱再试试');return;}
      selected=key;const current=generation,request=++readRequest;
      $('#mail-reader-title').textContent=letter.title;
      $('#mail-reader-meta').textContent=`${name(letter.author_role)} 写给 ${recipient(letter.author_role)}${letter.created_at?' · '+date(letter.created_at):' · 一直珍藏'}`;
      $('#mail-letter-body').textContent='正在拆开这封信…';$('#mail-letter-signature').textContent='';
      $('#mail-reader-status').textContent=state.authorized?'正在同步这封信和回信…':'登录后，我们可以给这封信写回信';
      $('#mail-reply-history').open=false;$('#mail-reply-composer').open=false;
      $('#mail-reply-history').hidden=!state.authorized;
      $('#mail-reply-composer').hidden=!state.authorized;
      $('#mail-reply-to').textContent=`想回给${recipient(state.role)}的话`;
      replyInput.value=draft(key).body;$('#mail-reply-feedback').textContent='';setReplyBusy(postingReply);
      renderReplies(key);
      if(!reader.open)reader.showModal();
      $('.mail-reader-scroll').scrollTop=0;
      if(key==='original')renderOriginal();
      else if(bodies.has(key)) {
        $('#mail-letter-body').textContent=bodies.get(key).body;
        $('#mail-letter-signature').textContent=`写信人：${name(letter.author_role)}`;
      } else {
        try {
          const full=await cloud.readMailboxLetter(key);
          if(current!==generation||request!==readRequest||selected!==key)return;
          bodies.set(key,full);$('#mail-letter-body').textContent=full.body;
          $('#mail-letter-signature').textContent=`写信人：${name(full.author_role)}`;
        } catch(err) {
          if(current===generation&&request===readRequest&&selected===key){$('#mail-letter-body').textContent='这封信暂时没有拆开';$('#mail-reader-status').textContent=err.message;return;}
        }
      }
      if(current===generation&&request===readRequest&&selected===key)refreshReplies(key);
    }
    function onState(next) {
      state=next;const nextIdentity=next.authorized?next.userId:null;
      if(identity!==nextIdentity) {
        const keepOriginal=identity===null&&nextIdentity!==null&&selected==='original'&&reader.open;
        identity=nextIdentity;generation++;mutation++;readRequest++;replyRequest++;
        letters=[];replyRefs=[];bodies.clear();replies.clear();drafts.clear();ready=false;error='';page=1;gridSignature='';selected=keepOriginal?'original':null;
        postingNew=false;postingReply=false;newPending=null;
        if(reader.open&&!keepOriginal)reader.close();if(composer.open)composer.close();
        composeForm.reset();replyForm.reset();setNewBusy(false);setReplyBusy(false);
        $('#mail-letter-body').textContent='';$('#mail-letter-signature').textContent='';$('#mail-reply-list').replaceChildren();
        $('#mail-compose-feedback').textContent='';$('#mail-reply-feedback').textContent='';
        if(keepOriginal){renderOriginal();$('#mail-reply-history').hidden=false;$('#mail-reply-composer').hidden=false;$('#mail-reply-to').textContent=`想回给${recipient(state.role)}的话`;}
      }
      renderGrid();if(next.authorized&&next.initialized)refresh();
    }

    $('#write-letter').addEventListener('click',()=>{
      if(!access())return;
      $('#mail-compose-to').textContent=`${name(state.role)} 写给 ${recipient(state.role)}`;
      if(!composer.open)composer.showModal();
    });
    $('#mail-refresh').addEventListener('click',refresh);
    $('#mail-reader-refresh').addEventListener('click',()=>{if(selected)openLetter(selected);});
    $('#mail-reply-shortcut').addEventListener('click',()=>{
      if(!access())return;
      $('#mail-reply-composer').open=true;replyInput.focus();
      $('#mail-reply-composer').scrollIntoView({behavior:scrollBehavior,block:'nearest'});
    });
    for(const [id,step] of [['#mail-prev',-1],['#mail-next',1]])$(id).addEventListener('click',()=>{page+=step;renderGrid();$('#mail-grid').scrollIntoView({behavior:scrollBehavior,block:'start'});});
    reader.addEventListener('close',()=>{selected=null;readRequest++;replyRequest++;});
    composeForm.addEventListener('input',()=>{
      if(newPending&&(newPending.title!==titleInput.value.trim()||newPending.body!==bodyInput.value.trim()))newPending=null;
    });
    replyInput.addEventListener('input',()=>{
      if(!selected)return;const item=draft(selected);item.body=replyInput.value;
      if(item.pending&&item.pending.body!==replyInput.value.trim())item.pending=null;
    });
    composeForm.addEventListener('submit',async event=>{
      event.preventDefault();if(!access()||postingNew)return;
      const title=titleInput.value.trim(),body=bodyInput.value.trim();if(!title||!body)return;
      const current=generation,payload=newPending||{id:crypto.randomUUID(),title,body};
      newPending=payload;postingNew=true;mutation++;setNewBusy(true);$('#mail-compose-feedback').textContent='正在封好这封信…';
      try {
        const saved=await cloud.sendMail(payload);if(current!==generation)return;
        bodies.set(saved.id,saved);letters=[saved,...letters.filter(row=>row.id!==saved.id)];
        composeForm.reset();newPending=null;page=1;$('#mail-compose-feedback').textContent='';renderGrid();composer.close();
        notify('新信已放进我们的信箱，我们都能拆开 ♡');celebrate(14);
      } catch(err) {if(current===generation)$('#mail-compose-feedback').textContent=err.message||'信暂时没有寄出，文字仍然保留';}
      finally {if(current===generation){postingNew=false;setNewBusy(false);refresh();}}
    });
    replyForm.addEventListener('submit',async event=>{
      event.preventDefault();if(!access()||postingReply||!selected)return;
      const key=selected,item=draft(key),body=replyInput.value.trim();if(!body)return;
      const current=generation,payload=item.pending||{id:crypto.randomUUID(),letterKey:key,body};
      item.pending=payload;postingReply=true;mutation++;setReplyBusy(true);$('#mail-reply-feedback').textContent='正在把回信送给你…';
      try {
        const saved=await cloud.sendMailReply(payload);if(current!==generation)return;
        replies.set(key,[...(replies.get(key)||[]).filter(row=>row.id!==saved.id),saved]);
        replyRefs=[...replyRefs.filter(row=>row.id!==saved.id),{id:saved.id,letter_id:saved.letter_id,is_original:saved.is_original}];
        item.body='';item.pending=null;
        if(selected===key){replyInput.value='';$('#mail-reply-feedback').textContent='回信已送到，我们都能看到 ♡';renderReplies(key);}
        renderGrid();celebrate(8);
      } catch(err) {if(current===generation&&selected===key)$('#mail-reply-feedback').textContent=err.message||'回信暂时未送达，文字仍然保留';}
      finally {if(current===generation){postingReply=false;setReplyBusy(false);refresh();}}
    });
    cloud.subscribe(onState);onState(state);
    const timer=setInterval(()=>{if(!document.hidden)refresh();},15000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
    window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
    return {updateOriginal:renderOriginal};
  }
  window.UniverseMailbox=Object.freeze({create});
})();
