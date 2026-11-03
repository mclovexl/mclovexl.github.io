(() => {
  'use strict';
  const $=selector=>document.querySelector(selector);
  const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const button=(className,text)=>{const node=el('button',className,text);node.type='button';return node;};
  const show=id=>{const dialog=$(id);if(!dialog.open)dialog.showModal();};
  const messageKey=row=>row.is_origin?'origin':row.story_id;
  const orderedMessages=rows=>rows.sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));

  function create({cloud,defaults,onLogin,notify,celebrate}) {
    const seedIdeas=defaults.map((idea,index)=>({id:`date-${String(index+1).padStart(2,'0')}`,title:idea[0],body:idea[1],tag:idea[2],icon:idea[3]}));
    const seedOrder=new Map(seedIdeas.map((idea,index)=>[idea.id,index]));
    const orderIdeas=rows=>rows.sort((a,b)=>(seedOrder.get(a.id)??seedIdeas.length)-(seedOrder.get(b.id)??seedIdeas.length)||(a.created_at||'').localeCompare(b.created_at||'')||a.id.localeCompare(b.id));
    const threads=new Map();
    let state=cloud?.state()||{authorized:false},identity=null,generation=0,mutation=0;
    let ready=false,seeded=false,inFlight=null,writing=0,syncError='';
    let ideas=seedIdeas.map(idea=>({...idea})),messages=[],chosenId=null;
    let editingIdea=null,latestIdea=null,dateSaving=false;

    function access() {
      if (!state.authorized) {onLogin();return false;}
      if (!ready) {notify('正在同步我们的约会和留言，请稍后再试');refresh().catch(()=>{});return false;}
      return true;
    }
    function renderDraw() {
      const idea=ideas.find(item=>item.id===chosenId);
      $('#date-box-icon').textContent=idea?.icon||'✧';
      $('#date-box-tag').textContent=idea?.tag||'FOR THE TWO OF US';
      $('#date-box-idea-title').textContent=idea?.title||'下一次，和你做什么呢？';
      $('#date-box-body').textContent=idea?.body||'把想和你做的事，一起装进我们的浪漫盲盒';
      $('#date-box-draw').textContent=idea?'再拆一份浪漫 ↻':'拆开我们的惊喜 ↗';
      $('#edit-drawn-date').hidden=!idea;
      $('#date-sync-status').textContent=!state.authorized?'登录相册后，一起编辑和收藏我们的约会':syncError||(!ready?'正在打开我们的约会清单…':'我们的约会已同步 ♡');
      $('#date-sync-retry').hidden=!state.authorized||!syncError;
    }
    function renderManager() {
      const list=$('#date-idea-list');list.replaceChildren();
      for (const idea of ideas) {
        const card=el('article','date-idea-card');
        const icon=el('span','date-idea-icon',idea.icon);icon.setAttribute('aria-hidden','true');
        const copy=el('div','date-idea-copy');
        copy.append(el('small','',idea.tag),el('h3','',idea.title),el('p','',idea.body));
        const edit=button('date-idea-edit','编辑');edit.setAttribute('aria-label',`编辑约会：${idea.title}`);
        edit.addEventListener('click',()=>openEditor(idea.id));
        card.append(icon,copy,edit);list.append(card);
      }
      $('#date-manage-feedback').textContent=syncError||(!state.authorized?'登录后，我们可以一起编辑这份清单':!ready?'正在同步我们的约会…':`已收藏 ${ideas.length} 份属于我们的约会`);
    }
    function renderThread(thread) {
      const rows=state.authorized?messages.filter(row=>messageKey(row)===thread.key):[];
      thread.count.textContent=String(rows.length);
      thread.form.hidden=!state.authorized;
      thread.login.hidden=state.authorized;
      thread.historyLogin.hidden=state.authorized;
      thread.refresh.hidden=!state.authorized;
      thread.note.textContent=!state.authorized?'登录后，把想对彼此说的话留在这段回忆里':syncError||(!ready?'正在翻开我们的留言…':'');
      thread.to.textContent=`想对${state.role==='owner'?'小兰':'管家'}说`;
      thread.textarea.placeholder=state.role==='owner'?'小兰，还记得那天吗……':'管家，那天我还想告诉你……';
      const signature=JSON.stringify([state.userId,state.authorized,ready,thread.shown,rows]);
      if (signature===thread.signature) return;
      thread.signature=signature;thread.list.replaceChildren();
      const visible=rows.slice(-thread.shown);
      for (const row of visible) {
        const item=el('article',`story-message${row.created_by===state.userId?' is-mine':''}`);
        const header=el('div','story-message-meta');
        const who=el('b','',row.author_role==='owner'?'管家':'小兰');
        const time=el('time','',new Date(row.created_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}));
        time.dateTime=row.created_at;header.append(who,time);
        item.append(header,el('p','',row.body));thread.list.append(item);
      }
      if (state.authorized && ready && !rows.length) thread.list.append(el('p','story-messages-empty','这段回忆，还有一句话想说给你听 ♡'));
      thread.more.hidden=rows.length<=thread.shown;
    }
    function renderAll() {renderDraw();renderManager();for(const thread of threads.values())renderThread(thread);}

    async function refresh() {
      if (!state.authorized || writing) return;
      const current=generation,version=mutation;
      if (inFlight?.generation===current) return inFlight.promise;
      const operation=(async()=>{
        try {
          if (!seeded) {
            await cloud.seedDateIdeas(seedIdeas);
            if (current!==generation) return;
            seeded=true;
          }
          const [nextIdeas,nextMessages]=await Promise.all([cloud.listDateIdeas(),cloud.listStoryMessages()]);
          if (current!==generation || version!==mutation || writing) return;
          ideas=orderIdeas(nextIdeas);
          messages=orderedMessages(nextMessages);ready=true;syncError='';renderAll();
        } catch (error) {
          if (current===generation) {syncError=error.message||'暂时没有同步成功，请稍后重试';renderAll();}
          throw error;
        }
      })();
      inFlight={generation:current,promise:operation};
      try {return await operation;} finally {if(inFlight?.promise===operation)inFlight=null;}
    }
    function onState(next) {
      const nextIdentity=next.authorized?next.userId:null;
      state=next;
      if (nextIdentity!==identity) {
        identity=nextIdentity;generation++;mutation++;ready=false;seeded=false;writing=0;dateSaving=false;syncError='';
        ideas=seedIdeas.map(idea=>({...idea}));messages=[];chosenId=null;editingIdea=null;latestIdea=null;
        for (const id of ['#date-edit-dialog','#date-manage-dialog']) if($(id).open)$(id).close();
        $('#date-edit-form').reset();setDateSaving(false);
        for (const thread of threads.values()) {
          thread.pendingId=null;thread.pendingBody=null;thread.sending=false;thread.signature='';thread.textarea.value='';thread.textarea.disabled=false;thread.submit.disabled=false;thread.feedback.textContent='';
          thread.historyPanel.hidden=true;thread.composePanel.hidden=true;
          thread.historyToggle.setAttribute('aria-expanded','false');thread.composeToggle.setAttribute('aria-expanded','false');
        }
      }
      renderAll();
      if (next.authorized && next.initialized) refresh().catch(()=>{});
    }
    function setDateSaving(value) {
      const form=$('#date-edit-form');
      for (const field of ['title','body','tag','icon']) form.elements.namedItem(field).disabled=value;
      form.querySelector('button[type="submit"]').disabled=value;
    }
    function fillEditor(idea) {
      const form=$('#date-edit-form');
      for (const field of ['title','body','tag','icon']) form.elements.namedItem(field).value=idea?.[field]||(field==='icon'?'♡':'');
    }
    function openEditor(id=null) {
      if (!access() || dateSaving) return;
      const idea=id?ideas.find(item=>item.id===id):null;
      if(id && !idea){notify('这份约会刚刚有了变化，请刷新后再试');return;}
      editingIdea=idea?{...idea}:null;latestIdea=null;
      const form=$('#date-edit-form');form.reset();delete form.dataset.pendingId;
      fillEditor(idea);setDateSaving(false);
      $('#date-edit-title').textContent=idea?'编辑我们的约会':'写一份新约会';
      $('#date-edit-feedback').textContent='';$('#reload-date-idea').hidden=true;
      show('#date-edit-dialog');
    }
    $('#date-box-draw').addEventListener('click',()=>{
      const pool=ideas.filter(idea=>ideas.length===1||idea.id!==chosenId);
      if (!pool.length) return;
      chosenId=pool[Math.floor(Math.random()*pool.length)].id;renderDraw();celebrate(10);
    });
    $('#manage-dates').addEventListener('click',()=>{renderManager();show('#date-manage-dialog');if(state.authorized)refresh().catch(()=>{});});
    $('#add-date-idea').addEventListener('click',()=>openEditor());
    $('#edit-drawn-date').addEventListener('click',()=>openEditor(chosenId));
    for (const id of ['#refresh-dates','#date-sync-retry']) $(id).addEventListener('click',()=>{if(!state.authorized)onLogin();else refresh().catch(()=>{});});
    $('#reload-date-idea').addEventListener('click',()=>{
      if (!latestIdea || !access()) return;
      editingIdea={...latestIdea};fillEditor(editingIdea);latestIdea=null;
      $('#date-edit-feedback').textContent='已载入最新内容，改好后再保存';$('#reload-date-idea').hidden=true;
    });
    $('#date-edit-form').addEventListener('submit',async event=>{
      event.preventDefault();
      if (!access() || dateSaving) return;
      const form=event.currentTarget,current=generation;
      const idea={id:editingIdea?.id||form.dataset.pendingId||crypto.randomUUID()};
      for (const field of ['title','body','tag','icon']) idea[field]=form.elements.namedItem(field).value.trim();
      if (!idea.title || !idea.body || !idea.tag) return;
      form.dataset.pendingId=idea.id;dateSaving=true;writing++;mutation++;setDateSaving(true);
      $('#date-edit-feedback').textContent='正在保存这份浪漫…';$('#reload-date-idea').hidden=true;
      try {
        const saved=await cloud.saveDateIdea(idea,editingIdea?.revision||null);
        if(current!==generation)return;
        ideas=orderIdeas([...ideas.filter(item=>item.id!==saved.id),saved]);chosenId=saved.id;renderAll();
        $('#date-edit-dialog').close();notify('我们的约会已同步，下次就可能抽到它 ♡');
      } catch(error) {
        if(current!==generation)return;
        $('#date-edit-feedback').textContent=error.message||'约会暂时没有保存，你写的内容仍然保留';
        latestIdea=error.name==='DateIdeaConflict'?error.latestIdea:null;
        $('#reload-date-idea').hidden=!latestIdea;
      } finally {
        if(current===generation){writing--;dateSaving=false;setDateSaving(false);refresh().catch(()=>{});}
      }
    });

    function mountStoryMessages(card,key) {
      let thread=threads.get(key);
      if (!thread) {
        const root=el('div','story-messages');root.dataset.storyKey=key;root.setAttribute('role','group');root.setAttribute('aria-label','留给彼此的话');
        const controls=el('div','story-message-controls');
        const historyToggle=button('story-message-toggle message-history-toggle','');
        const count=el('span','story-messages-count','0');historyToggle.append(el('span','','历史留言'),count);
        const composeToggle=button('story-message-toggle message-compose-toggle','写新留言');
        const historyPanel=el('div','story-messages-content message-history-panel');historyPanel.hidden=true;historyPanel.id=`story-history-${key}`;
        const composePanel=el('div','story-messages-content message-compose-panel');composePanel.hidden=true;composePanel.id=`story-compose-${key}`;
        for (const [toggle,panel,name] of [[historyToggle,historyPanel,'history'],[composeToggle,composePanel,'compose']]) {
          toggle.id=`story-${name}-toggle-${key}`;toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',panel.id);
          panel.setAttribute('role','region');panel.setAttribute('aria-labelledby',toggle.id);
          toggle.addEventListener('click',()=>{
            panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));
            if(!panel.hidden && state.authorized)refresh().catch(()=>{});
          });
        }
        controls.append(historyToggle,composeToggle);
        const tools=el('div','story-message-tools');
        const refreshButton=button('message-refresh','刷新留言 ↻');refreshButton.addEventListener('click',()=>refresh().catch(()=>{}));
        const note=el('p','message-sync-note');note.setAttribute('role','status');
        tools.append(note,refreshButton);
        const list=el('div','story-message-list');
        const more=button('message-more','再看更早的留言');
        const login=button('message-login','登录后，留句话给彼此 ♡');login.addEventListener('click',onLogin);
        const historyLogin=button('message-login','登录后，翻开我们的留言 ♡');historyLogin.addEventListener('click',onLogin);
        const form=el('form','story-message-form'),label=el('label','');
        const to=el('span','message-to'),textarea=el('textarea','');
        textarea.rows=3;textarea.required=true;textarea.setAttribute('aria-label','给彼此的留言');
        label.append(to,textarea);
        const footer=el('div','story-message-form-footer');
        const submit=el('button','message-send','把这句话留给你 ♡');submit.type='submit';
        footer.append(submit);
        const feedback=el('p','message-feedback');feedback.setAttribute('role','status');
        form.append(label,footer,feedback);historyPanel.append(tools,more,list,historyLogin);composePanel.append(login,form);root.append(controls,historyPanel,composePanel);
        thread={key,root,count,note,refresh:refreshButton,list,more,login,historyLogin,form,to,textarea,submit,feedback,historyToggle,composeToggle,historyPanel,composePanel,shown:3,signature:'',pendingId:null,pendingBody:null,sending:false};
        threads.set(key,thread);
        more.addEventListener('click',()=>{thread.shown+=6;renderThread(thread);});
        textarea.addEventListener('input',()=>{
          if(thread.pendingBody && textarea.value.trim()!==thread.pendingBody){thread.pendingId=null;thread.pendingBody=null;}
        });
        form.addEventListener('submit',async event=>{
          event.preventDefault();if(!access()||thread.sending)return;
          const body=textarea.value.trim();if(!body)return;
          const current=generation;
          const message={id:thread.pendingId||crypto.randomUUID(),storyKey:key,body};
          thread.pendingId=message.id;thread.pendingBody=body;thread.sending=true;textarea.disabled=true;submit.disabled=true;writing++;mutation++;
          feedback.textContent='正在把这句话留给你…';
          try {
            const saved=await cloud.addStoryMessage(message);
            if(current!==generation)return;
            messages=orderedMessages([...messages.filter(row=>row.id!==saved.id),saved]);
            textarea.value='';thread.pendingId=null;thread.pendingBody=null;feedback.textContent='这句话已经送到，我们都能看到 ♡';
            renderThread(thread);
          } catch(error) {
            if(current===generation)feedback.textContent=error.message||'这句话暂时未送达，文字已经保留，请稍后重试';
          } finally {
            if(current===generation){writing--;thread.sending=false;textarea.disabled=false;submit.disabled=false;refresh().catch(()=>{});}
          }
        });
      }
      card.append(thread.root);renderThread(thread);
    }

    cloud?.subscribe(onState);onState(state);
    const timer=setInterval(()=>{if(!document.hidden&&state.authorized)refresh().catch(()=>{});},15000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.authorized)refresh().catch(()=>{});});
    window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
    return {mountStoryMessages,openDate(){renderDraw();show('#date-box-dialog');if(state.authorized)refresh().catch(()=>{});}};
  }
  window.UniverseTogether=Object.freeze({create});
})();
