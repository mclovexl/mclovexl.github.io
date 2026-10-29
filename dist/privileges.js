(() => {
  'use strict';
  const root=document.querySelector('#priority');
  if (!root) return;
  const cloud=window.UniverseCloud;
  const $=selector=>document.querySelector(selector);
  const catalog={
    pause:{title:'游戏瞬间暂停召唤券',message:'小兰在召唤管家，这局游戏先等一等'},
    listen:{title:'无条件出租耳朵倾听券',message:'小兰有话想说，等管家认真听一听'},
    company:{title:'只属于你的陪伴券',message:'小兰想要一段完整的陪伴时间'}
  };
  const buttons=[...root.querySelectorAll('[data-use-privilege]')];
  const notice=$('#privilege-status'),refresh=$('#privilege-refresh');
  const pendingList=$('#privilege-pending'),history=$('#privilege-history'),historyList=$('#privilege-history-list');
  const signal=document.createElement('a');
  signal.id='privilege-signal'; signal.className='privilege-signal'; signal.href='#priority'; signal.hidden=true;
  const signalText=document.createElement('span'),signalTitle=document.createElement('span'),signalDetail=document.createElement('small'),signalHeart=document.createElement('span');
  signalTitle.textContent='小兰正在召唤你'; signalDetail.textContent='点击查看，留一句“我在”';signalHeart.textContent='♡';
  signalText.append(signalTitle,signalDetail);signal.append(signalText,signalHeart);document.body.append(signal);
  let account={authorized:false,userId:'',role:null},epoch=0,mutation=0,ready=false,writing=false,inFlight=null,items=[],signature=null;
  const pendingIds=new Map(),animationTimers=new Set();
  const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const say=(text,error=false)=>{notice.textContent=text;notice.dataset.error=String(error);};
  const when=value=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
  function renderButtons() {
    for(const button of buttons) {
      const pending=items.some(item=>item.coupon_key===button.dataset.usePrivilege && item.status==='pending');
      button.disabled=account.authorized && (!ready || writing || pending);
      const label=!account.authorized ? '登录后使用' : !ready ? '正在同步' : pending ? '已使用 · 等管家回应' : '使用这张特权券';
      button.replaceChildren(make('span','privilege-button-label',label),make('span','','↗'));
      button.setAttribute('aria-label',label+'：'+catalog[button.dataset.usePrivilege].title);
    }
    refresh.disabled=!account.authorized || writing || !!inFlight;
    for(const button of pendingList.querySelectorAll('button'))button.disabled=writing;
  }
  function renderRecords(force=false) {
    renderButtons();
    const pending=items.filter(item=>item.status==='pending' && catalog[item.coupon_key]);
    signal.hidden=!account.authorized || account.role!=='owner' || !pending.length;
    root.dataset.phase=pending.length ? 'waiting' : 'idle';
    $('#priority-core-status').textContent=pending.length ? '小兰已经发出召唤，等管家说一声“我在”' : '偏爱不是限时活动，是管家的长期设定';
    const nextSignature=JSON.stringify([items,account.role,account.userId]);
    if (!force && signature===nextSignature) return;
    signature=nextSignature;
    const focusedId=document.activeElement?.dataset?.privilegeRecord;
    pendingList.replaceChildren();historyList.replaceChildren();
    for(const item of pending) {
      const row=make('article','privilege-pending-row'),body=make('div');
      body.append(make('h4','',catalog[item.coupon_key].title),make('p','',catalog[item.coupon_key].message),make('small','',when(item.created_at)+' · 已发出，等待管家回应'));
      const actions=make('div','privilege-row-actions');
      if(account.role==='owner') {
        const answer=make('button','privilege-respond','我在，先陪你 ♡');
        answer.type='button';answer.dataset.privilegeRecord=item.id;
        answer.setAttribute('aria-label','回应：'+catalog[item.coupon_key].title);
        answer.addEventListener('click',()=>change(item,'responded'));
        actions.append(answer);
      }
      if(item.created_by===account.userId) {
        const cancel=make('button','privilege-cancel','撤回这次召唤');
        cancel.type='button';cancel.dataset.privilegeRecord=item.id;
        cancel.setAttribute('aria-label','撤回：'+catalog[item.coupon_key].title);
        cancel.addEventListener('click',()=>change(item,'cancelled'));
        actions.append(cancel);
      }
      row.append(body,actions);pendingList.append(row);
    }
    const answered=items.filter(item=>item.status==='responded' && catalog[item.coupon_key]).slice(0,6);
    history.hidden=!answered.length;
    for(const item of answered) {
      const row=make('div','privilege-history-row'),body=make('div');
      body.append(make('strong','',catalog[item.coupon_key].title),make('p','',when(item.responded_at || item.created_at)));
      row.append(body,make('span','','管家说：我在 ♡'));historyList.append(row);
    }
    if(focusedId)for(const button of pendingList.querySelectorAll('button'))if(button.dataset.privilegeRecord===focusedId){button.focus({preventScroll:true});break;}
    renderButtons();
  }
  async function sync(manual=false) {
    if (!account.authorized || writing || !cloud?.listPrivilegeUses) return;
    if (inFlight?.epoch===epoch) return inFlight.promise;
    const current=epoch,version=mutation;
    const task=(async()=>{
      try {
        const next=await cloud.listPrivilegeUses();
        if(current!==epoch || version!==mutation || writing)return;
        const previouslyReady=ready;
        const previousAnswers=new Set(items.filter(item=>item.status==='responded').map(item=>item.id));
        items=next;ready=true;renderRecords();
        if(previouslyReady && account.role==='partner' && next.some(item=>item.status==='responded' && !previousAnswers.has(item.id))) say('管家回应了：我在，先陪你 ♡');
        else if(manual || !previouslyReady || notice.dataset.error==='true')say(items.some(item=>item.status==='pending') ? '召唤已经留好，等一声温柔的“我在”' : '这些特权一直有效，有需要的时候就用掉一张');
      } catch(error) {if(current===epoch)say(error.message || '特权券暂时没有同步成功，请刷新重试',true);}
    })();
    inFlight={epoch:current,promise:task};renderButtons();
    try {await task;}finally {if(inFlight?.promise===task)inFlight=null;renderButtons();}
  }
  async function write(action,onSuccess) {
    if(writing)return;
    const current=epoch;writing=true;mutation++;renderButtons();
    say('正在把这份小小的偏爱留好……');
    try {
      const item=await action();
      if(current!==epoch)return;
      items=[item,...items.filter(old=>old.id!==item.id)];ready=true;renderRecords(true);onSuccess(item);
    } catch(error) {if(current===epoch)say(error.message || '这次操作还没有保存，请稍后重试',true);}
    finally {if(current===epoch){writing=false;renderButtons();sync();}}
  }
  function use(key) {
    if(!account.authorized){$('#cloud-account').click();return;}
    if(!ready || writing)return;
    const id=pendingIds.get(key) || crypto.randomUUID();pendingIds.set(key,id);
    write(()=>cloud.usePrivilege(key,id),item=>{
      if(item.status!=='pending'){pendingIds.delete(key);say('这张券已有了回应，刷新后可以再次使用');return;}
      pendingIds.delete(key);
      say('召唤已发出 ♡ 等管家看到后亲自回应你');
      const card=root.querySelector('[data-ticket="'+key+'"]');card.classList.add('is-used');
      const timer=setTimeout(()=>{card.classList.remove('is-used');animationTimers.delete(timer);},900);animationTimers.add(timer);
    });
  }
  function change(item,status) {
    write(()=>cloud.changePrivilegeUse(item.id,status),()=>{
      say(status==='responded' ? '管家回应了：我在，先陪你 ♡' : '这次召唤已撤回，特权券依然随时为你保留');
      notice.focus({preventScroll:true});
    });
  }
  function accountChanged(state) {
    const changed=account.userId!==state.userId || account.authorized!==state.authorized;
    account=state;
    if(changed){epoch++;mutation++;items=[];ready=false;writing=false;inFlight=null;pendingIds.clear();signature=null;}
    refresh.hidden=!state.authorized;
    if(!state.authorized){renderRecords(true);say('登录共同相册后，就能使用这些只属于小兰的特权');return;}
    renderRecords();sync();
  }
  buttons.forEach(button=>button.addEventListener('click',()=>use(button.dataset.usePrivilege)));
  refresh.addEventListener('click',()=>sync(true));
  cloud?.subscribe(accountChanged);accountChanged(cloud?.state() || account);
  const poll=()=>{if(!document.hidden)sync();};
  let timer=setInterval(poll,5000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
  window.addEventListener('pagehide',()=>{clearInterval(timer);animationTimers.forEach(clearTimeout);},{once:true});
  window.addEventListener('pageshow',event=>{if(event.persisted){clearInterval(timer);timer=setInterval(poll,5000);sync();}});
})();
