(() => {
  'use strict';
  const maxWishes = 100, pageSize = 12;
  const $ = selector => document.querySelector(selector);
  const el = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  // Every wish has a point on the sphere. The enlarged globe shows full-text
  // callouts for the near-side stars, placed without overlapping one another.
  function globe(canvas, onPick) {
    const ctx = canvas.getContext('2d');
    const labelLayer=onPick ? $('#wish-globe-labels') : null;
    const labels=new Map();
    let points = [], projected = [], selected = null;
    let yaw = .45, pitch = -.18, zoom = 1, size = 0;
    let drag = null, onRotate = () => {};
    function rotate(p) {
      const x = p.x * Math.cos(yaw) + p.z * Math.sin(yaw);
      const z = -p.x * Math.sin(yaw) + p.z * Math.cos(yaw);
      return {x, y:p.y * Math.cos(pitch) - z * Math.sin(pitch),
        z:p.y * Math.sin(pitch) + z * Math.cos(pitch)};
    }
    function star(x, y, radius, color) {
      ctx.beginPath();
      for (let i=0; i<8; i++) {
        const angle = i * Math.PI / 4 - Math.PI / 2;
        const r = i % 2 ? radius * .27 : radius;
        const px = x + Math.cos(angle) * r, py = y + Math.sin(angle) * r;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    }
    function paintLabels() {
      if (!labelLayer) return;
      const occupied=[],width=Math.round(clamp(size*.4,100,144));
      const candidates=projected.filter(p=>p.z>=.08).sort((a,b)=>(Number(b.id===selected)-Number(a.id===selected))||b.z-a.z);
      for (const label of labels.values()) {label.hidden=true;label.setAttribute('aria-pressed','false');}
      for (const point of candidates) {
        if (occupied.length >= (size<300?4:6)) break;
        const label=labels.get(point.id);
        if (!label) continue;
        label.style.width=`${width}px`;label.hidden=false;
        const height=label.offsetHeight;
        const offsets=[
          [12,-height/2],[-width-12,-height/2],[-width/2,15],[-width/2,-height-15],
          [12,14],[-width-12,14],[12,-height-14],[-width-12,-height-14]
        ];
        const positions=offsets.map(([dx,dy])=>({
          x:clamp(point.sx+dx,6,size-width-6), y:clamp(point.sy+dy,6,size-height-6),width,height
        }));
        for (const x of [6,size-width-6]) for (const y of [6,size-height-6]) positions.push({x,y,width,height});
        const box=positions.find(box=>occupied.every(other=>box.x+box.width+8<other.x || other.x+other.width+8<box.x || box.y+box.height+8<other.y || other.y+other.height+8<box.y));
        if (!box) {label.hidden=true;continue;}
        occupied.push(box);
        label.style.transform=`translate(${Math.round(box.x)}px,${Math.round(box.y)}px)`;
        label.setAttribute('aria-pressed',String(point.id===selected));
        label.classList.toggle('is-complete',point.done);
        const x=clamp(point.sx,box.x,box.x+box.width),y=clamp(point.sy,box.y,box.y+box.height);
        ctx.beginPath();ctx.moveTo(point.sx,point.sy);ctx.lineTo(x,y);
        ctx.strokeStyle=point.id===selected?'#edb5a48c':'#bacbbb55';ctx.lineWidth=.8;ctx.stroke();
      }
    }
    function paint() {
      if (!ctx || !size) return;
      const center = size / 2, radius = size * .325 * zoom;
      ctx.clearRect(0, 0, size, size);
      for (let i=0; i<38; i++) {
        const x = ((i * 97.37 + 19) % 313) / 313 * size;
        const y = ((i * 61.83 + 43) % 307) / 307 * size;
        ctx.fillStyle = `rgba(222,205,174,${.1 + (i % 4) * .07})`;
        ctx.beginPath(); ctx.arc(x, y, i % 7 ? .7 : 1.25, 0, Math.PI*2); ctx.fill();
      }
      const halo = ctx.createRadialGradient(center, center, radius*.7, center, center, radius*1.25);
      halo.addColorStop(0, 'rgba(174,192,157,.04)'); halo.addColorStop(.65, 'rgba(165,182,145,.12)'); halo.addColorStop(1, 'rgba(165,182,145,0)');
      ctx.fillStyle=halo; ctx.fillRect(0, 0, size, size);
      const body=ctx.createRadialGradient(center-radius*.45, center-radius*.55, 0, center, center, radius*1.12);
      body.addColorStop(0,'#51625b'); body.addColorStop(.43,'#2c4142'); body.addColorStop(.82,'#192b35'); body.addColorStop(1,'#101c2a');
      ctx.beginPath(); ctx.arc(center,center,radius,0,Math.PI*2); ctx.fillStyle=body; ctx.fill();
      ctx.strokeStyle='rgba(196,204,173,.48)'; ctx.lineWidth=1; ctx.stroke();
      // Latitude and longitude lines share the stars' rotation.
      ctx.save(); ctx.beginPath(); ctx.arc(center,center,radius-.5,0,Math.PI*2); ctx.clip();
      const line = samples => {
        let started = false;
        ctx.beginPath();
        for (const sample of samples) {
          const p=rotate(sample);
          if (p.z < -.02) { started=false; continue; }
          const x=center+p.x*radius, y=center+p.y*radius;
          if (started) ctx.lineTo(x,y); else ctx.moveTo(x,y);
          started=true;
        }
        ctx.stroke();
      };
      ctx.lineWidth=.65; ctx.strokeStyle='rgba(183,199,179,.18)';
      for (let lat=-60; lat<=60; lat+=30) {
        const phi=lat*Math.PI/180;
        line(Array.from({length:97},(_,i)=>{const a=i/96*Math.PI*2;return{x:Math.cos(phi)*Math.sin(a),y:Math.sin(phi),z:Math.cos(phi)*Math.cos(a)};}));
      }
      for (let lon=0; lon<360; lon+=30) {
        const theta=lon*Math.PI/180;
        line(Array.from({length:65},(_,i)=>{const a=-Math.PI/2+i/64*Math.PI;return{x:Math.cos(a)*Math.sin(theta),y:Math.sin(a),z:Math.cos(a)*Math.cos(theta)};}));
      }
      ctx.restore();
      ctx.save(); ctx.translate(center,center); ctx.rotate(-.32);
      ctx.beginPath(); ctx.ellipse(0,0,radius*1.24,radius*.37,0,0,Math.PI*2);
      ctx.strokeStyle='rgba(222,186,152,.32)'; ctx.lineWidth=.85; ctx.stroke(); ctx.restore();
      projected=points.map(p=>({...p,...rotate(p)})).sort((a,b)=>a.z-b.z);
      for (const p of projected) {
        p.sx=center+p.x*radius; p.sy=center+p.y*radius;
        const front=p.z>=0, active=p.id===selected;
        ctx.globalAlpha=front ? .68+p.z*.32 : .12;
        const color=p.done ? '#f1d59c' : '#bacbbb';
        ctx.shadowColor=color; ctx.shadowBlur=front ? (p.done?13:4) : 0;
        star(p.sx,p.sy,(active?7:p.done?5:3.8)*(front?.85+p.z*.15:.7),color);
        ctx.shadowBlur=0;
        if (active && front) {
          ctx.beginPath(); ctx.arc(p.sx,p.sy,12,0,Math.PI*2);
          ctx.strokeStyle='#efb6a9'; ctx.lineWidth=1.2; ctx.stroke();
        }
      }
      ctx.globalAlpha=1;
      paintLabels();
    }
    function resize() {
      const next=canvas.getBoundingClientRect().width;
      if (!next) return;
      size=next;
      const dpr=Math.min(window.devicePixelRatio||1,2);
      canvas.width=Math.round(size*dpr); canvas.height=Math.round(size*dpr);
      ctx?.setTransform(dpr,0,0,dpr,0,0); paint();
    }
    new ResizeObserver(resize).observe(canvas);
    if (onPick) {
      canvas.addEventListener('pointerdown',event=>{
        if (event.button!==0) return;
        drag={id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false};
        canvas.setPointerCapture(event.pointerId); canvas.classList.add('is-dragging');
      });
      canvas.addEventListener('pointermove',event=>{
        if (!drag || event.pointerId!==drag.id) return;
        if (Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>6) drag.moved=true;
        yaw+=(event.clientX-drag.x)*.009; pitch=clamp(pitch+(event.clientY-drag.y)*.009,-1.45,1.45);
        drag.x=event.clientX; drag.y=event.clientY; paint(); onRotate();
      });
      const endDrag=event=>{
        if (!drag || event.pointerId!==drag.id) return;
        if (event.type==='pointerup' && !drag.moved) {
          const box=canvas.getBoundingClientRect(),x=event.clientX-box.left,y=event.clientY-box.top;
          const hit=projected.filter(p=>p.z>=0).map(p=>({...p,distance:Math.hypot(p.sx-x,p.sy-y)})).sort((a,b)=>a.distance-b.distance)[0];
          if (hit?.distance<24) onPick(hit.id);
        }
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        drag=null; canvas.classList.remove('is-dragging');
      };
      for (const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event,endDrag);
      canvas.addEventListener('keydown',event=>{
        const delta={ArrowLeft:[-.2,0],ArrowRight:[.2,0],ArrowUp:[0,-.2],ArrowDown:[0,.2]}[event.key];
        if (delta) {event.preventDefault();yaw+=delta[0];pitch=clamp(pitch+delta[1],-1.45,1.45);paint();onRotate();}
      });
    }
    return {
      setData(rows) {
        if (labelLayer) {
          const ids=new Set(rows.map(wish=>wish.id));
          for (const [id,label] of labels) if (!ids.has(id)) {label.remove();labels.delete(id);}
          for (const wish of rows) {
            let label=labels.get(wish.id);
            if (!label) {
              label=el('button','wish-globe-label');label.type='button';
              label.hidden=true;
              label.addEventListener('click',()=>onPick(wish.id));
              labelLayer.append(label);labels.set(wish.id,label);
            }
            label.textContent=wish.text;
            label.setAttribute('aria-label',`查看心愿：${wish.text}`);
          }
        }
        points=rows.map((wish,index)=>{
          const y=1-2*(index+.5)/rows.length, r=Math.sqrt(1-y*y),a=index*Math.PI*(3-Math.sqrt(5));
          return {...wish,x:Math.sin(a)*r,y,z:Math.cos(a)*r};
        }); paint();
      },
      select(id,face=false) {
        selected=id;
        const point=points.find(p=>p.id===id);
        if (face && point) {yaw=Math.atan2(-point.x,point.z);pitch=Math.atan2(point.y,Math.hypot(point.x,point.z));}
        paint();
      },
      rotate(delta) {yaw+=delta;paint();},
      zoom(delta) {zoom=clamp(zoom+delta,1,1.6);paint();return zoom;},
      resize,
      setOnRotate(fn) {onRotate=fn;}
    };
  }

  function create({onAdd,onToggle}) {
    const dialog=$('#wish-planet-dialog'),opener=$('#open-wish-planet');
    const preview=globe($('#wish-planet-preview'));
    const detail=globe($('#wish-planet-large'),id=>select(id,false));
    let rows=[],signature='',selectedId=null,page=1,filter='all',search='',busy=false;
    let visible=false,frame=null,lastTime=0;
    const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
    function animate(time) {
      preview.rotate(Math.min(time-lastTime,40)*.00012);lastTime=time;
      frame=requestAnimationFrame(animate);
    }
    function updateAnimation() {
      if (frame!==null) cancelAnimationFrame(frame);
      frame=null;
      if (visible && !dialog.open && !document.hidden && !reducedMotion.matches) {
        lastTime=performance.now();frame=requestAnimationFrame(animate);
      }
    }
    new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;updateAnimation();},{threshold:.05}).observe(opener);
    document.addEventListener('visibilitychange',updateAnimation);
    reducedMotion.addEventListener('change',updateAnimation);
    function matchingRows() {
      return rows.filter(wish=>(filter==='all'||(filter==='done'?wish.done:!wish.done)) && wish.text.toLocaleLowerCase().includes(search));
    }
    function renderSelected() {
      const wish=rows.find(item=>item.id===selectedId),button=$('#wish-toggle-selected');
      $('#wish-selected-label').textContent=wish ? (wish.done?'✦ 这颗心愿，已经被我们点亮':'✧ 留给以后的一份小期待') : '✧ 每个以后，都想有你';
      $('#wish-selected-text').textContent=wish?.text || '在星球上种下我们的第一个愿望吧';
      button.hidden=!wish;button.disabled=busy;
      button.textContent=busy?'正在保存…':wish?.done?'已实现 ✓ · 改为待实现':'点亮这个愿望 ✦';
      button.classList.toggle('is-complete',!!wish?.done);
      button.setAttribute('aria-pressed',String(!!wish?.done));
      detail.select(selectedId);
    }
    function renderList() {
      const filtered=matchingRows(),pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));
      page=clamp(page,1,pageCount);
      const list=$('#wish-list');
      list.replaceChildren();
      const start=(page-1)*pageSize;
      for (const wish of filtered.slice(start,start+pageSize)) {
        const button=el('button',`wish-list-item${wish.done?' is-complete':''}`);
        button.type='button';button.dataset.wishId=wish.id;
        button.setAttribute('aria-pressed',String(wish.id===selectedId));
        button.setAttribute('aria-label',`${wish.text}，${wish.done?'已点亮':'待实现'}，查看愿望`);
        const icon=el('span','wish-list-star',wish.done?'✦':'✧');icon.setAttribute('aria-hidden','true');
        button.append(icon,el('span','wish-list-text',wish.text),el('small','',wish.done?'已点亮':'待实现'));
        button.addEventListener('click',()=>select(wish.id,true));
        list.append(button);
      }
      if (!filtered.length) list.append(el('p','wish-list-empty',search?'没有找到这个心愿，换个词试试吧':filter==='done'?'我们的第一束愿望星光，等我们一起点亮':filter==='pending'?'这里的心愿都已点亮，真好 ♡':'在星球上种下我们的第一个愿望吧'));
      for (const button of document.querySelectorAll('[data-wish-filter]')) {
        const key=button.dataset.wishFilter;
        button.setAttribute('aria-pressed',String(filter===key));
        button.querySelector('span').textContent=rows.filter(w=>key==='all'||(key==='done'?w.done:!w.done)).length;
      }
      const selectPage=$('#wish-page-select');
      selectPage.replaceChildren(...Array.from({length:pageCount},(_,index)=>{
        const option=el('option','',String(index+1));option.value=String(index+1);return option;
      }));
      selectPage.value=String(page);
      $('#wish-page-total').textContent=pageCount;
      $('#wish-page-prev').disabled=page===1;$('#wish-page-next').disabled=page===pageCount;
      $('#wish-pagination').hidden=pageCount<=1;
      $('#wish-list-count').textContent=filtered.length ? `显示 ${start+1}–${Math.min(start+pageSize,filtered.length)} / ${filtered.length} 个心愿` : '0 个心愿';
    }
    function select(id,face) {
      if (!rows.some(wish=>wish.id===id)) return;
      selectedId=id;
      $('#wish-action-feedback').textContent='';
      detail.select(id,face);renderSelected();
      // Keep the focused catalog row intact while highlighting the selection.
      for (const button of $('#wish-list').querySelectorAll('button')) button.setAttribute('aria-pressed',String(button.dataset.wishId===id));
      if (face && matchMedia('(max-width:700px)').matches) $('#wish-selected').scrollIntoView({block:'nearest',behavior:reducedMotion.matches?'instant':'smooth'});
    }
    function render(next,options={}) {
      const nextSignature=JSON.stringify(next.map(w=>[w.id,w.text,w.done]));
      if (signature===nextSignature && !options.selectId) return;
      signature=nextSignature;rows=next.map(w=>({...w}));
      const done=rows.filter(w=>w.done).length;
      $('#wish-capacity').textContent=`已收藏 ${rows.length} / ${maxWishes} 个我们的心愿`;
      $('#wish-planet-count').textContent=`${rows.length} 个心愿 · ${done} 颗已点亮`;
      $('#wish-explorer-summary').textContent=`一颗星球，收藏 ${rows.length} 个我们的以后 · 已点亮 ${done} 颗`;
      if (options.selectId) {
        selectedId=options.selectId;filter='all';search='';$('#wish-search').value='';
        page=Math.floor(Math.max(0,rows.findIndex(w=>w.id===selectedId))/pageSize)+1;
      }
      if (!rows.some(w=>w.id===selectedId)) selectedId=rows.find(w=>!w.done)?.id || rows[0]?.id || null;
      preview.setData(rows);detail.setData(rows);
      if (options.selectId) detail.select(selectedId,true);
      renderSelected();renderList();
    }
    opener.addEventListener('click',()=>{
      if (dialog.open) return;
      dialog.showModal();detail.resize();detail.select(selectedId,true);updateAnimation();
    });
    dialog.addEventListener('close',()=>{updateAnimation();opener.focus({preventScroll:true});});
    $('#wish-planet-add').addEventListener('click',onAdd);
    $('#wish-toggle-selected').addEventListener('click',async()=>{
      if (busy || !selectedId) return;
      const id=selectedId;busy=true;$('#wish-action-feedback').textContent='';renderSelected();
      try {await onToggle(id);}
      catch (error) {$('#wish-action-feedback').textContent=error.message || '愿望暂时没有保存，请重试';}
      finally {busy=false;renderSelected();}
    });
    for (const button of document.querySelectorAll('[data-wish-filter]')) button.addEventListener('click',()=>{
      filter=button.dataset.wishFilter;page=1;renderList();
    });
    $('#wish-search').addEventListener('input',event=>{search=event.target.value.trim().toLocaleLowerCase();page=1;renderList();});
    $('#wish-page-select').addEventListener('change',event=>{page=Number(event.target.value);renderList();});
    $('#wish-page-prev').addEventListener('click',()=>{page--;renderList();});
    $('#wish-page-next').addEventListener('click',()=>{page++;renderList();});
    $('#wish-rotate-left').addEventListener('click',()=>detail.rotate(-.45));
    function zoom(delta) {
      const value=detail.zoom(delta);
      $('#wish-zoom-out').disabled=value<=1.001;$('#wish-zoom-in').disabled=value>=1.599;
    }
    $('#wish-zoom-out').addEventListener('click',()=>zoom(-.2));
    $('#wish-zoom-in').addEventListener('click',()=>zoom(.2));
    zoom(0);
    return {render};
  }
  window.UniverseWishPlanet=Object.freeze({create,maxWishes});
})();
