(() => {
  'use strict';
  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
  const base = window.UNIVERSE_CONFIG;
  const shared = window.UNIVERSE_BOOTSTRAP || {};
  const Time = window.UniverseTime;
  const cloud = window.UniverseCloud;
  const cloudMode = !!cloud?.enabled;
  const storagePrefix = 'our-universe-v1:';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const safeRead = (key, fallback) => { try { return JSON.parse(localStorage.getItem(storagePrefix + key)) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => localStorage.setItem(storagePrefix + key, JSON.stringify(value));
  const node = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };
  const dotted = (date) => date.replaceAll('-', '.');
  const initialSettings = Object.fromEntries(['me', 'her', 'startDate', 'promise', 'letter'].map(key => [key, base[key]]));
  let settings = { ...initialSettings, ...shared.settings, ...safeRead('settings', {}) };
  delete settings.startTime; // Ignore the previous version's browser-saved hour.
  try { Time.dateParts(settings.startDate); } catch { settings.startDate = base.startDate; }
  for (const key of ['me', 'her', 'promise', 'letter']) if (typeof settings[key] !== 'string' || !settings[key].trim()) settings[key] = base[key];
  let customStories = safeRead('stories', shared.stories || []);
  if (!Array.isArray(customStories)) customStories = [];
  let wishes = safeRead('wishes', shared.wishes || [
    { id: 'wish-sea', text: '一起去看海', done: false },
    { id: 'wish-sunset', text: '收藏一百次日落', done: false },
    { id: 'wish-city', text: '去彼此想去的城市', done: false },
    { id: 'wish-home', text: '把小日子过成诗', done: false },
    { id: 'wish-stars', text: '牵着手看一场流星雨', done: false },
    { id: 'wish-forever', text: '一起到很久很久以后', done: false }
  ]);
  if (!Array.isArray(wishes)) wishes = [];
  let photos = shared.photos?.length ? shared.photos : base.photos;
  let currentFilter = 'all';
  const photosPerPage = 12;
  let currentPhotoPage = 1;
  let filteredPhotos = photos;
  let lightboxIndex = 0;
  let toastTimeout;
  let gameCleanup = () => {};
  let databasePromise;
  let cloudGeneration = 0;
  let syncInFlight = null;
  let pendingDelete = null, photoMutation = false;
  let trashPhotos = [], trashRequest = 0, trashHasMore = false;

  function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 4200);
  }
  function celebrate(amount = 25) {
    if (reducedMotion) return;
    const colors = ['#edb5a7', '#d4c49d', '#b8c3a0', '#e7cbbb'];
    const area = $('#celebration');
    for (let i = 0; i < amount; i++) {
      const heart = node('span', 'confetti-heart', i % 3 ? '♡' : '✦');
      heart.style.setProperty('--x', `${Math.random() * 100}%`);
      heart.style.setProperty('--c', colors[i % colors.length]);
      heart.style.setProperty('--size', `${15 + Math.random() * 20}px`);
      heart.style.setProperty('--duration', `${3 + Math.random() * 2}s`);
      heart.style.setProperty('--delay', `${Math.random() * .65}s`);
      heart.style.setProperty('--drift', `${Math.random() * 150 - 75}px`);
      area.append(heart);
      setTimeout(() => heart.remove(), 6000);
    }
  }
  function openDialog(id) {
    const el = typeof id === 'string' ? $(id) : id;
    if (!el.open) el.showModal();
  }
  $$('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $$('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  }));
  $('#game-dialog').addEventListener('close', () => gameCleanup());

  function renderSettings() {
    $$('[data-me]').forEach(el => el.textContent = settings.me);
    $$('[data-her]').forEach(el => el.textContent = settings.her);
    $$('[data-me-initial]').forEach(el => el.textContent = [...settings.me][0]);
    $$('[data-her-initial]').forEach(el => el.textContent = [...settings.her][0]);
    $$('[data-start]').forEach(el => el.textContent = dotted(settings.startDate));
    const [y, m, d] = settings.startDate.split('-').map(Number);
    $$('[data-start-chinese]').forEach(el => el.textContent = `${String(y).slice(-2)} 年 ${m} 月 ${d} 日`);
    $$('[data-promise]').forEach(el => el.textContent = settings.promise);
    $('#letter-body').textContent = settings.letter;
    document.title = `你就是我的宇宙 · ${settings.me} × ${settings.her}`;
    $('meta[name="description"]').content = `${settings.me}与${settings.her}的专属小宇宙。从 ${dotted(settings.startDate)}，到每一个永远。`;
    renderClock();
    renderStories();
  }
  function renderClock() {
    const now = Date.now();
    const clock = Time.clock(now, settings.startDate);
    $('#love-days').textContent = clock.days;
    for (const unit of ['hours', 'minutes', 'seconds']) $(`#love-${unit}`).textContent = String(clock[unit]).padStart(2, '0');
    $('#clock-intro').textContent = clock.future ? '距离我们的故事开始，还有' : '我们在一起的第';
    const next = Time.anniversary(now, settings.startDate);
    $('#anniversary-days').textContent = next.days;
    $('#anniversary-date').textContent = `${dotted(next.date)} · ${next.today ? '今天也要好好相爱' : '继续相爱'}`;
    $('#anniversary-title').textContent = next.today ? (next.years > 0 ? `今天是我们的第 ${next.years} 个周年 ♡` : '今天，我们的故事开始了 ♡') : next.futureStart ? '距离我们的故事开始' : '距离我们的下一个周年';
  }
  $('#customize').addEventListener('click', () => {
    const form = $('#settings-form');
    form.elements.namedItem('letter').value = settings.letter;
    openDialog('#settings-dialog');
  });
  $('#settings-form').addEventListener('submit', event => {
    event.preventDefault();
    const letter = event.currentTarget.elements.namedItem('letter').value.trim();
    if (!letter) { toast('写下想对她说的话，再保存吧。'); return; }
    const next = { ...settings, letter };
    try { save('settings', next); } catch (err) { toast(`暂时无法保存：${err.message}`); return; }
    settings = next;
    renderSettings();
    $('#settings-dialog').close();
    toast('这封情书，已经替你好好收藏。♡');
    celebrate(15);
  });

  function renderPhotos() {
    filteredPhotos = photos.filter(photo => currentFilter === 'all' || photo.category === currentFilter);
    const pageCount = Math.max(1, Math.ceil(filteredPhotos.length / photosPerPage));
    currentPhotoPage = Math.min(pageCount, Math.max(1, currentPhotoPage));
    const offset = (currentPhotoPage - 1) * photosPerPage;
    const visiblePhotos = filteredPhotos.slice(offset, offset + photosPerPage);
    const grid = $('#photo-grid');
    grid.replaceChildren();
    $('#photo-count').textContent = String(photos.length).padStart(2, '0');
    $('#demo-note').hidden = !photos.some(photo => photo.demo);
    if (!filteredPhotos.length) grid.append(node('p', 'empty-photos', '这一页，等我们下一次心动来填满。♡'));
    const rotations = [-2.3, 1.5, -1.1, 1.3, -1.8, 2];
    visiblePhotos.forEach((photo, index) => {
      const photoIndex = offset + index;
      const button = node('button', 'polaroid');
      button.type = 'button';
      button.setAttribute('aria-label', `查看照片：${photo.title}${photo.demo ? '（氛围示例）' : ''}`);
      button.style.setProperty('--tilt', `${rotations[photoIndex % rotations.length]}deg`);
      const imageWrap = node('div', 'polaroid-image');
      const image = node('img');
      image.src = photo.src;
      image.alt = `${photo.demo ? '氛围示例：' : ''}${photo.title}`;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.width = 800;
      image.height = 600;
      imageWrap.append(image);
      if (photo.demo) imageWrap.append(node('span', 'photo-demo-tag', '氛围示例'));
      const info = node('div', 'polaroid-info');
      const caption = node('div');
      caption.append(node('h3', '', photo.title), node('p', '', photo.date ? dotted(photo.date) : `${photo.category} / LITTLE MOMENTS`));
      info.append(caption, node('span', 'photo-heart', '♡'));
      button.append(imageWrap, info);
      button.addEventListener('click', () => { lightboxIndex = photoIndex; renderLightbox(); openDialog('#lightbox'); });
      grid.append(button);
    });
    $('#photo-pagination').hidden = pageCount <= 1;
    $('#photo-page-status').textContent = `第 ${currentPhotoPage} / ${pageCount} 页`;
    $('#photo-page-meta').textContent = `共 ${filteredPhotos.length} 张 · 每页 ${photosPerPage} 张`;
    $('#photo-page-prev').disabled = currentPhotoPage <= 1;
    $('#photo-page-next').disabled = currentPhotoPage >= pageCount;
  }
  function turnPhotoPage(step) {
    currentPhotoPage += step;
    renderPhotos();
    const grid = $('#photo-grid');
    grid.focus({preventScroll:true});
    grid.scrollIntoView({behavior:reducedMotion ? 'instant' : 'smooth',block:'start'});
  }
  $('#photo-page-prev').addEventListener('click', () => turnPhotoPage(-1));
  $('#photo-page-next').addEventListener('click', () => turnPhotoPage(1));
  $$('.filter-tabs button').forEach(button => button.addEventListener('click', () => {
    currentFilter = button.dataset.filter;
    currentPhotoPage = 1;
    $$('.filter-tabs button').forEach(tab => { const active = tab === button; tab.classList.toggle('selected', active); tab.setAttribute('aria-pressed', String(active)); });
    renderPhotos();
  }));
  function renderLightbox() {
    const photo = filteredPhotos[lightboxIndex];
    if (!photo) return;
    const photoPage = Math.floor(lightboxIndex / photosPerPage) + 1;
    if (currentPhotoPage !== photoPage) { currentPhotoPage = photoPage; renderPhotos(); }
    $('#lightbox-image').src = photo.src;
    $('#lightbox-image').alt = photo.title;
    $('#lightbox-caption').textContent = `${photo.title}${photo.demo ? '\n氛围示例 · 等待我们的真实照片' : photo.date ? `\n${dotted(photo.date)}` : ''}`;
    $('#lightbox-counter').textContent = `${lightboxIndex + 1} / ${filteredPhotos.length}`;
    $('#delete-lightbox-photo').hidden = !(cloudMode && cloud.state().authorized && photo.canManage && !photo.demo);
  }
  function shiftPhoto(step) { if (!filteredPhotos.length) return; lightboxIndex = (lightboxIndex + step + filteredPhotos.length) % filteredPhotos.length; renderLightbox(); }
  $('#photo-prev').addEventListener('click', () => shiftPhoto(-1));
  $('#photo-next').addEventListener('click', () => shiftPhoto(1));
  $('#lightbox').addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); shiftPhoto(event.key === 'ArrowLeft' ? -1 : 1); } });
  let touchStart;
  $('#lightbox-image').addEventListener('touchstart', e => { touchStart = e.touches[0].clientX; }, { passive: true });
  $('#lightbox-image').addEventListener('touchend', e => { if (touchStart == null) return; const delta = e.changedTouches[0].clientX - touchStart; if (Math.abs(delta) > 50) shiftPhoto(delta > 0 ? -1 : 1); touchStart = null; }, { passive: true });
  $('#delete-lightbox-photo').addEventListener('click', () => {
    const photo=filteredPhotos[lightboxIndex];
    if (photoMutation || !cloudMode || !cloud.state().authorized || !photo?.canManage || photo.demo) return;
    pendingDelete={id:photo.id,title:photo.title};
    $('#delete-photo-title').textContent=photo.title;
    $('#delete-photo-feedback').textContent='';
    openDialog('#photo-delete-dialog');
  });
  $('#photo-delete-dialog').addEventListener('close', () => { pendingDelete=null; });
  $('#confirm-delete-photo').addEventListener('click',async () => {
    if (!pendingDelete || photoMutation) return;
    const photo=pendingDelete, button=$('#confirm-delete-photo');
    photoMutation=true; button.disabled=true; button.textContent='正在移入回收站……';
    let moved=false;
    try {
      await cloud.movePhotoToTrash(photo.id);
      moved=true; cloudGeneration++;
      $('#photo-delete-dialog').close(); $('#lightbox').close();
      photos=photos.filter(item=>item.id!==photo.id); renderPhotos();
      await syncCloudAlbum();
      toast('已移入回收站。想找回时，点照片墙旁的「回收站」即可。');
    } catch(err) {
      const message=moved ? '照片已移入回收站；相册刷新暂未完成，请稍后刷新。' : err.message;
      if($('#photo-delete-dialog').open) $('#delete-photo-feedback').textContent=message; else toast(message);
    }
    finally { photoMutation=false; button.disabled=false; button.textContent='移入回收站'; if($('#photo-trash-dialog').open) renderTrash(); }
  });
  function renderTrash() {
    const list=$('#trash-photo-list'); list.replaceChildren();
    if (!trashPhotos.length) list.append(node('p','trash-empty','回收站空空的，美好都被好好收藏着 ♡'));
    for (const photo of trashPhotos) {
      const item=node('li','trash-photo');
      const image=node('img'); image.src=photo.src; image.alt=photo.title; image.loading='lazy'; image.width=76; image.height=76;
      const info=node('div','trash-photo-info');
      info.append(node('h3','',photo.title),node('p','',`移入时间 · ${new Date(photo.deletedAt).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'})}`));
      const button=node('button','trash-restore','恢复照片'); button.type='button'; button.disabled=photoMutation;
      button.setAttribute('aria-label',`恢复照片：${photo.title}`);
      button.addEventListener('click',() => restoreTrashedPhoto(photo.id,button));
      item.append(image,info,button); list.append(item);
    }
    $('#trash-load-more').hidden=!trashHasMore;
  }
  async function refreshTrash(append = false) {
    if (!cloudMode || !cloud.state().authorized) return;
    const request=++trashRequest, generation=cloudGeneration;
    $('#trash-feedback').textContent='正在整理回收站……';
    $('#refresh-trash').disabled=true; $('#trash-load-more').disabled=true;
    try {
      const next=await cloud.listTrashedPhotos(append ? trashPhotos.length : 0);
      if (request!==trashRequest || generation!==cloudGeneration || !cloud.state().authorized || !$('#photo-trash-dialog').open) return;
      trashPhotos=append ? [...trashPhotos,...next.filter(photo=>!trashPhotos.some(old=>old.id===photo.id))] : next;
      trashHasMore=next.length===30;
      renderTrash(); $('#trash-feedback').textContent=trashPhotos.length ? `已显示 ${trashPhotos.length} 张 · 可恢复到共享照片墙` : '';
    } catch(err) { if(request===trashRequest) $('#trash-feedback').textContent=err.message; }
    finally { if(request===trashRequest) { $('#refresh-trash').disabled=false; $('#trash-load-more').disabled=false; } }
  }
  async function restoreTrashedPhoto(id,button) {
    if (photoMutation || !cloudMode || !cloud.state().authorized) return;
    photoMutation=true; button.disabled=true; button.textContent='正在恢复……';
    let restored=false;
    try {
      await cloud.restorePhoto(id);
      restored=true; cloudGeneration++; trashRequest++;
      trashPhotos=trashPhotos.filter(photo=>photo.id!==id); renderTrash();
      await syncCloudAlbum(true);
      await refreshTrash();
      toast('照片已回到我们的共享照片墙。♡');
    } catch(err) {
      const message=restored ? '照片已恢复；相册刷新暂未完成，请稍后刷新。' : err.message;
      if($('#photo-trash-dialog').open) $('#trash-feedback').textContent=message; else toast(message);
    }
    finally { photoMutation=false; if($('#photo-trash-dialog').open) renderTrash(); }
  }
  $('#open-trash').addEventListener('click',() => {
    if (!cloudMode || !cloud.state().authorized) return;
    trashPhotos=[]; trashHasMore=false; $('#trash-photo-list').replaceChildren();
    openDialog('#photo-trash-dialog'); refreshTrash();
  });
  $('#refresh-trash').addEventListener('click',() => refreshTrash());
  $('#trash-load-more').addEventListener('click',() => refreshTrash(true));
  $('#photo-trash-dialog').addEventListener('close',() => { trashRequest++; trashPhotos=[]; $('#trash-photo-list').replaceChildren(); $('#trash-feedback').textContent=''; });
  function database() {
    if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('our-little-universe-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('album');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('请关闭其他旧版网站页面后重试'));
    });
    return databasePromise;
  }
  async function photoStore(mode, value) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('album', mode === 'get' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('album');
      const request = mode === 'get' ? store.get('photos') : store.put(value, 'photos');
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error || new Error('照片存储失败'));
      transaction.onabort = () => reject(transaction.error || new Error('照片存储空间不足'));
    });
  }
  const albumReady = cloudMode ? Promise.resolve() : photoStore('get').then(stored => {
    if (Array.isArray(stored) && stored.length) { photos = stored; renderPhotos(); }
  }).catch(() => { /* 无可用存储时仍可浏览预置内容，上传时显示具体错误。 */ });
  $('#add-photo').addEventListener('click', () => {
    if (cloudMode && !cloud.state().authorized) { showAccount(); return; }
    $('#photo-form').reset();
    $('#file-status').textContent = cloudMode ? '照片会保存到我们的私有云端相册。另一台设备登录后，打开或刷新就能看见。' : '照片保存在当前浏览器。点击「打包送给她」，可以把照片和网站一起带走。';
    openDialog('#upload-dialog');
  });
  $('#photo-files').addEventListener('change', event => {
    const files = event.currentTarget.files;
    $('#file-status').textContent = files.length ? `已选 ${files.length} 张照片。${files.length > 12 ? '每次最多 12 张，请重新选择。' : '准备好把美好收藏起来了吗？'}` : '还没有选择照片。';
  });
  async function preparePhoto(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 照片');
    if (file.size > 20 * 1024 * 1024) throw new Error('单张照片请小于 20 MB');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const context = canvas.getContext('2d');
      context.fillStyle = '#fffaf1';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', .87);
    } finally { URL.revokeObjectURL(url); }
  }
  $('#photo-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const title = form.elements.namedItem('title').value.trim();
    if (!title) { toast('给这组照片写一句话吧。'); return; }
    const files = [...$('#photo-files').files];
    if (!files.length || files.length > 12) { toast('每次请选择 1 到 12 张照片。'); return; }
    const previous = photos.filter(photo => !photo.demo);
    const submit = $('#photo-submit');
    submit.disabled = true;
    submit.textContent = '正在收藏美好……';
    try {
      const next = [...previous];
      for (let i = 0; i < files.length; i++) next.push({ id: crypto.randomUUID(), src: await preparePhoto(files[i]), title: files.length > 1 ? `${title} · ${i + 1}` : title, category: form.elements.namedItem('category').value, date: form.elements.namedItem('date').value, demo: false });
      if (cloudMode) {
        await cloud.addPhotos(next.slice(previous.length));
        await syncCloudAlbum();
      } else {
        await photoStore('put', next);
        photos = next;
      }
      currentFilter = 'all';
      currentPhotoPage = 1;
      $$('.filter-tabs button').forEach(tab => { tab.classList.toggle('selected', tab.dataset.filter === 'all'); tab.setAttribute('aria-pressed', String(tab.dataset.filter === 'all')); });
      renderPhotos();
      $('#upload-dialog').close();
      toast(`${files.length} 个心动瞬间，已经${cloudMode ? '保存到共享相册' : '好好收藏'}。♡`);
      celebrate(14);
    } catch (err) {
      if (cloudMode) await syncCloudAlbum(true).catch(() => {});
      toast(err.committed ? `已有 ${err.committed} 张保存到云端，其余未完成：${err.message}` : `照片未保存：${err.message || '请检查浏览器存储空间'}`);
    }
    finally { submit.disabled = false; submit.textContent = '放进我们的相册 ＋'; }
  });

  function accountFeedback(message) { $('#account-feedback').textContent = message; }
  async function showAccount() {
    if (!cloudMode) return;
    const state = cloud.state();
    $('#account-login-form').hidden = state.authorized || state.hasInvite;
    $('#account-enroll-form').hidden = !state.hasInvite;
    $('#account-member-panel').hidden = !state.authorized;
    $('#account-title').textContent = state.authorized ? '我们的共享相册' : state.hasInvite ? '开通专属相册' : '登录我们的相册';
    $('#account-member-email').textContent = state.email;
    accountFeedback('');
    openDialog('#account-dialog');
    if (state.hasInvite) {
      accountFeedback('正在确认专属开通链接……');
      try {
        const invite=await cloud.inspectInvite();
        $('#account-enroll-form').elements.namedItem('email').value=invite.email;
        accountFeedback('请自己设置相册密码。开通链接只使用一次。');
      } catch (err) { accountFeedback(err.message); }
    }
  }
  async function syncCloudAlbum(silent = false) {
    if (!cloudMode || !cloud.state().authorized) return;
    const generation=cloudGeneration;
    if (syncInFlight?.generation===generation) return syncInFlight.promise;
    const operation=(async () => {
      $('#sync-album').disabled=true;
      if (!silent) $('#cloud-status-text').textContent='正在和云端的心动碰头……';
      try {
        const next=await cloud.listPhotos();
        if (generation!==cloudGeneration || !cloud.state().authorized) return;
        const viewed=filteredPhotos[lightboxIndex]?.id;
        photos=next;
        renderPhotos();
        if ($('#lightbox').open) {
          lightboxIndex=filteredPhotos.findIndex(photo=>photo.id===viewed);
          if (lightboxIndex<0) $('#lightbox').close(); else renderLightbox();
        }
        $('#cloud-status-text').textContent=next.length ? `我们的共享相册 · ${next.length} 个心动瞬间 · 刚刚已同步` : '共享相册已连接，放进我们的第一张合照吧。';
      } catch (err) {
        if (generation===cloudGeneration) $('#cloud-status-text').textContent=err.message;
        if (!silent) toast(err.message);
        throw err;
      } finally {
        if (generation===cloudGeneration) $('#sync-album').disabled=!cloud.state().authorized;
      }
    })();
    syncInFlight={generation,promise:operation};
    try { return await operation; } finally { if(syncInFlight?.promise===operation) syncInFlight=null; }
  }
  function updateCloudState(state) {
    cloudGeneration++;
    $('#cloud-account').hidden=false;
    $('#cloud-status').hidden=false;
    $('#sync-album').disabled=!state.authorized;
    $('#open-trash').hidden=!state.authorized;
    $('#cloud-account').textContent=state.authorized ? '共享相册 ♡' : '登录相册';
    if (!state.authorized) {
      photos=base.photos;
      currentPhotoPage=1;
      renderPhotos();
      if ($('#lightbox').open) $('#lightbox').close();
      if ($('#upload-dialog').open) $('#upload-dialog').close();
      for (const id of ['photo-trash-dialog','photo-delete-dialog']) if ($(`#${id}`).open) $(`#${id}`).close();
      pendingDelete=null; trashRequest++; trashPhotos=[]; $('#trash-photo-list').replaceChildren();
      $('#lightbox-image').removeAttribute('src');
      $('#delete-lightbox-photo').hidden=true;
      $('#cloud-status-text').textContent=!state.configured ? '相册尚未连接，请完成云端配置。' : !state.initialized ? '正在确认相册登录状态……' : state.authenticated ? '此账号还没有相册访问权限。' : '登录后，打开我们共同的私密照片。';
    } else {
      syncCloudAlbum().catch(()=>{});
      if ($('#account-dialog').open && (!$('#account-login-form').hidden || !$('#account-enroll-form').hidden)) {
        $('#account-login-form').reset(); $('#account-enroll-form').reset();
        $('#account-dialog').close();
      }
    }
  }
  $('#cloud-account').addEventListener('click',showAccount);
  $('#sync-album').addEventListener('click',() => {
    if (!cloud.state().authorized) showAccount(); else syncCloudAlbum().catch(()=>{});
  });
  $('#account-login-form').addEventListener('submit',async event => {
    event.preventDefault();
    const form=event.currentTarget, submit=$('button[type="submit"]',form);
    submit.disabled=true; accountFeedback('正在打开我们的相册……');
    try { await cloud.login(form.elements.namedItem('email').value,form.elements.namedItem('password').value); form.reset(); $('#account-dialog').close(); toast('欢迎回到我们的共享相册。♡'); }
    catch(err) { accountFeedback(err.message); }
    finally { submit.disabled=false; }
  });
  $('#account-enroll-form').addEventListener('submit',async event => {
    event.preventDefault();
    const form=event.currentTarget, submit=$('button[type="submit"]',form);
    const password=form.elements.namedItem('password').value;
    if (password!==form.elements.namedItem('confirmPassword').value) { accountFeedback('两次输入的密码需要相同。'); return; }
    submit.disabled=true; accountFeedback('正在开通我们的相册……');
    try { await cloud.enroll(password); form.reset(); $('#account-dialog').close(); toast('相册开通好了，现在就放进第一张合照吧。♡'); }
    catch(err) { accountFeedback(err.message); }
    finally { submit.disabled=false; }
  });
  $('#account-logout').addEventListener('click',async () => {
    try { await cloud.logout(); $('#account-dialog').close(); $('#account-login-form').reset(); toast('当前设备已退出相册。'); }
    catch(err) { accountFeedback(err.message); }
  });

  function renderStories() {
    const entries = [
      { date: settings.startDate, title: '从这一天起，有了「我们」', body: `${settings.me} × ${settings.her}\n故事从这里开始。${settings.promise}。`, tag: '我们的起点', icon: '♡' },
      ...customStories.map(story => ({ ...story, tag: '属于我们的回忆', icon: '✧' }))
    ].sort((a, b) => a.date.localeCompare(b.date));
    entries.push({ date: 'THE NEXT LITTLE ADVENTURE', title: '下一次，想和你一起出发', body: '去哪里都好，身边是你就好。\n这一页，等我们一起写下。', tag: '未来计划 · 待我们书写', icon: '↗', future: true }, { date: 'TO BE CONTINUED · ∞', title: '还有好多好多的以后', body: '故事还在继续，主角一直是我们。', tag: '未完待续', icon: '∞', future: true });
    const timeline = $('#timeline');
    timeline.replaceChildren();
    entries.forEach(story => {
      const item = node('article', `timeline-item${story.future ? ' future' : ''}`);
      item.append(node('span', 'timeline-dot'));
      const date = node('span', 'story-date', story.future ? story.date : dotted(story.date));
      const card = node('div', 'story-note');
      card.append(node('h3', '', story.title), node('p', '', story.body), node('span', 'story-chip', story.tag), node('span', 'story-illustration', story.icon));
      item.append(date, card);
      timeline.append(item);
    });
  }
  $('#add-story').addEventListener('click', () => { const form = $('#story-form'); form.reset(); form.elements.namedItem('date').value = Time.todayShanghai(); openDialog('#story-dialog'); });
  $('#story-form').addEventListener('submit', event => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    fields.title = fields.title.trim();
    fields.body = fields.body.trim();
    if (!fields.title || !fields.body) { toast('把故事写完整，再收藏吧。'); return; }
    try {
      Time.dateParts(fields.date);
      const next = [...customStories, { ...fields, id: crypto.randomUUID() }];
      save('stories', next);
      customStories = next;
      renderStories();
      $('#story-dialog').close();
      toast('这段回忆，已经住进我们的星座。✧');
    } catch (err) { toast(`故事未保存：${err.message}`); }
  });

  function renderWishes() {
    const sky = $('#wish-sky');
    sky.replaceChildren();
    const positions = wishes.length > 8
      ? wishes.map((_, index) => [18 + (index % 3) * 32, 3 + Math.floor(index / 3) * 24])
      : [[22, 6], [75, 17], [48, 41], [18, 66], [80, 62], [50, 83], [15, 33], [79, 38]];
    wishes.forEach((wish, index) => {
      const button = node('button', `wish-star${wish.done ? ' complete' : ''}`);
      button.type = 'button';
      const position = positions[index % positions.length];
      button.style.left = `${position[0]}%`;
      button.style.top = `${position[1]}%`;
      button.setAttribute('aria-label', `${wish.text}，${wish.done ? '已实现，点击标为待实现' : '待实现，点击点亮'}`);
      button.setAttribute('aria-pressed', String(wish.done));
      button.append(node('span', '', wish.done ? '✦' : '✧'), node('b', '', wish.text));
      if (wish.done) button.append(node('small', '', '已实现 ✓'));
      button.addEventListener('click', () => {
        const next = wishes.map(item => item.id === wish.id ? { ...item, done: !item.done } : item);
        try { save('wishes', next); } catch { toast('保存失败，请检查浏览器存储空间。'); return; }
        wishes = next;
        renderWishes();
        if (!wish.done) { celebrate(12); toast('又一颗愿望星，被我们一起点亮了。✦'); }
        else toast('小愿望重新回到待实现清单。');
      });
      sky.append(button);
    });
    sky.append(node('span', 'wish-more', '✧ 点击星星，点亮已实现的愿望'));
  }
  const newWish = () => {
    if (wishes.length >= 12) { toast('星空已收藏 12 个愿望，先一起实现它们吧。♡'); return; }
    $('#wish-form').reset();
    openDialog('#wish-dialog');
  };
  $('#add-wish').addEventListener('click', newWish);
  $('#hero-wish').addEventListener('click', newWish);
  $('#wish-form').addEventListener('submit', event => {
    event.preventDefault();
    const text = event.currentTarget.elements.namedItem('text').value.trim();
    if (!text) return;
    const next = [...wishes, { id: crypto.randomUUID(), text, done: false }];
    try { save('wishes', next); } catch { toast('暂时无法保存愿望，请检查存储空间。'); return; }
    wishes = next;
    renderWishes();
    $('#wish-dialog').close();
    $('#wishes').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth' });
    toast('宇宙收到你们的愿望啦。✧');
    celebrate(12);
  });

  function startGame(title, eyebrow) {
    gameCleanup();
    gameCleanup = () => {};
    $('#game-title').textContent = title;
    $('#game-eyebrow').textContent = eyebrow;
    $('#game-content').replaceChildren();
    openDialog('#game-dialog');
    return $('#game-content');
  }
  const shuffle = (items) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
    return copy;
  };
  function openMemory() {
    const content = startGame('心有灵犀', 'GAME / 01 · FIND OUR LITTLE PAIRS');
    const deck = shuffle(['♡', '☾', '✧', '☀', '∞', '✿'].flatMap(symbol => [symbol, symbol]));
    const info = node('div', 'game-info');
    const movesLabel = node('span', '', '翻牌次数：0');
    const pairsLabel = node('span', '', '找到心动：0 / 6');
    info.append(movesLabel, pairsLabel);
    const board = node('div', 'memory-board');
    const message = node('p', 'game-message', '翻开两颗星，找到相同的图案。');
    const reset = node('button', 'game-reset', '重新寻找我们的默契 ↻');
    reset.type = 'button';
    reset.addEventListener('click', openMemory);
    let first = null, locked = false, pairs = 0, moves = 0, active = true, flipTimeout;
    const tiles = [];
    deck.forEach((symbol, index) => {
      const button = node('button', 'memory-tile', '✦');
      button.type = 'button';
      button.setAttribute('aria-label', `翻开第 ${index + 1} 颗星`);
      button.addEventListener('click', () => {
        if (!active || locked || button.disabled || first?.index === index) return;
        button.textContent = symbol;
        button.classList.add('flipped');
        button.setAttribute('aria-label', `第 ${index + 1} 颗星：${symbol}`);
        if (!first) { first = { button, index, symbol }; return; }
        moves++;
        movesLabel.textContent = `翻牌次数：${moves}`;
        if (symbol === first.symbol) {
          [button, first.button].forEach(tile => { tile.classList.add('matched'); tile.disabled = true; tile.setAttribute('aria-label', `${symbol}，已经配对`); });
          pairs++;
          pairsLabel.textContent = `找到心动：${pairs} / 6`;
          first = null;
          message.textContent = pairs === 6 ? `全部找到！${moves} 次翻牌，收集了我们的满分默契。♡` : '找到了，原来你也在这里。♡';
          if (pairs === 6) celebrate(35);
        } else {
          locked = true;
          const previous = first.button;
          flipTimeout = setTimeout(() => {
            if (!active) return;
            [button, previous].forEach(tile => { tile.textContent = '✦'; tile.classList.remove('flipped'); tile.setAttribute('aria-label', `翻开第 ${tiles.indexOf(tile) + 1} 颗星`); });
            first = null;
            locked = false;
          }, 850);
        }
      });
      tiles.push(button);
      board.append(button);
    });
    content.append(info, board, message, reset);
    gameCleanup = () => { active = false; clearTimeout(flipTimeout); };
  }
  $('#open-memory').addEventListener('click', openMemory);
  function openCatch() {
    const content = startGame('接住我的喜欢', 'GAME / 02 · CATCH MY LOVE');
    let remaining = 20, score = 0, active = false, spawnTimer, tickTimer, endAt;
    const info = node('div', 'game-info');
    const timeLabel = node('span', '', '剩余时间：20 秒');
    const scoreLabel = node('span', '', '接到喜欢：0');
    info.append(timeLabel, scoreLabel);
    const area = node('div', 'catch-area');
    const intro = node('div', 'catch-start');
    const begin = node('button', 'button button-pink', '开始接住喜欢 ♡');
    begin.type = 'button';
    intro.append(node('span', '', '♡'), node('p', '', '20 秒里，点击飘落的爱心。鼠标、触屏都能玩，键盘可以 Tab 选中心心再按回车。'), begin);
    area.append(intro);
    const message = node('p', 'game-message', '准备好了吗？我的喜欢要出发了。');
    const reset = node('button', 'game-reset', '再接一次喜欢 ↻');
    reset.type = 'button';
    reset.addEventListener('click', openCatch);
    reset.hidden = true;
    const clearTimers = () => { clearInterval(spawnTimer); clearInterval(tickTimer); };
    const finish = () => {
      active = false;
      clearTimers();
      area.replaceChildren();
      remaining = 0;
      timeLabel.textContent = '剩余时间：0 秒';
      const oldBest = Number(safeRead('catch-best', 0)) || 0;
      const best = Math.max(oldBest, score);
      try { save('catch-best', best); } catch { /* 得分不依赖持久化。 */ }
      const result = node('div', 'catch-start');
      result.append(node('span', '', '♡'), node('p', '', `接住了 ${score} 份喜欢 · 最高纪录 ${best} 份\n还有很多很多喜欢，往后的日子慢慢给你。`));
      area.append(result);
      message.textContent = score > 0 ? '喜欢都归你，宇宙也归你。♡' : '没有接到也没关系，我会亲手把喜欢送给你。♡';
      reset.hidden = false;
      celebrate(25);
    };
    const spawn = () => {
      if (!active) return;
      const heart = node('button', 'falling-heart', Math.random() > .7 ? '♡' : '♥');
      heart.type = 'button';
      heart.setAttribute('aria-label', '接住这颗爱心');
      heart.style.left = `${5 + Math.random() * 76}%`;
      heart.style.color = ['#b77d69', '#b59771', '#9e8b7b'][Math.floor(Math.random() * 3)];
      let caught = false;
      const collect = () => { if (!active || caught) return; caught = true; score++; scoreLabel.textContent = `接到喜欢：${score}`; heart.remove(); };
      heart.addEventListener('click', collect);
      heart.addEventListener('animationend', () => heart.remove());
      area.append(heart);
    };
    begin.addEventListener('click', () => {
      intro.remove();
      active = true;
      endAt = performance.now() + 20000;
      message.textContent = '每一颗爱心，都是一句「好喜欢你」。';
      spawn();
      spawnTimer = setInterval(spawn, 650);
      tickTimer = setInterval(() => {
        remaining = Math.max(0, Math.ceil((endAt - performance.now()) / 1000));
        timeLabel.textContent = `剩余时间：${remaining} 秒`;
        if (!remaining) finish();
      }, 100);
    });
    content.append(info, area, message, reset);
    gameCleanup = () => { active = false; clearTimers(); };
  }
  $('#open-catch').addEventListener('click', openCatch);
  const dateIdeas = [
    ['一起收藏日落', '挑一个晴天，带上喜欢的饮料，找一处能看到天空的地方。天慢慢暗下来，我们慢慢说话。', '慢慢来 / 户外', '☀'],
    ['只属于我们的电影夜', '各选一部想看的电影，准备一碗零食。把手机放远一点，把彼此放近一点。', '宅家也浪漫', '☾'],
    ['没有目的地的散步', '沿着一条没走过的路出发。遇到路口轮流决定方向，给今天取一个特别的名字。', '一起探索 / 小冒险', '↗'],
    ['给彼此拍一组照片', '每人当十分钟摄影师，拍下对方最自然的样子。最后挑一张，放进我们的照片墙。', '留住可爱 / 双人限定', '✧'],
    ['亲手做一顿晚餐', '一起选菜单、买食材、分工做饭。菜咸一点淡一点都没关系，爱意刚刚好就够了。', '日常浪漫 / 烟火气', '♡'],
    ['给未来的我们写信', '写下现在最喜欢彼此的一件小事，和一个共同的愿望。约好下个周年，再一起打开。', '未来可期 / 仪式感', '∞'],
    ['交换一份小小歌单', '各选三首想让对方听的歌，说说选它的理由。今晚，让旋律替我们讲一点点心事。', '分享心动 / 音乐夜', '♫'],
    ['一起看一次日出', '提前看好天气和交通，备好外套与早餐。去迎接一个从第一束光开始，就在一起的日子。', '迎接明天 / 户外', '☀']
  ];
  let lastDateIdea = -1;
  function openDate() {
    const content = startGame('约会盲盒', 'SURPRISE / 03 · OUR NEXT DATE');
    const panel = node('div', 'date-surprise');
    const icon = node('div', 'surprise-icon', '✧');
    const tag = node('span', 'date-tag', 'FOR THE TWO OF US');
    const title = node('h3', '', '下一次，和你做什么呢？');
    const body = node('p', '', '宇宙准备了一点小小的浪漫。拆开看看，哪一个会成为我们的下一页。');
    const draw = node('button', 'button button-pink', '拆开我们的惊喜 ↗');
    draw.type = 'button';
    draw.addEventListener('click', () => {
      let index;
      do { index = Math.floor(Math.random() * dateIdeas.length); } while (index === lastDateIdea);
      lastDateIdea = index;
      const idea = dateIdeas[index];
      [title.textContent, body.textContent, tag.textContent, icon.textContent] = idea;
      draw.textContent = '再拆一份浪漫 ↻';
      celebrate(10);
    });
    panel.append(icon, tag, title, body, draw);
    content.append(panel);
  }
  $('#open-date').addEventListener('click', openDate);

  $('#open-letter').addEventListener('click', () => {
    const paper = $('#letter-paper');
    const isOpening = paper.hidden;
    paper.hidden = !isOpening;
    $('#open-letter').setAttribute('aria-expanded', String(isOpening));
    $('.envelope-label').textContent = isOpening ? '把这封信好好收起 ♡' : '拆开这封信 ↗';
    if (isOpening) { celebrate(24); paper.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center' }); }
  });
  let centralClicks = 0;
  $('#center-star').addEventListener('click', () => {
    centralClicks++;
    toast(centralClicks % 5 === 0 ? `${settings.her}，${settings.promise}。♡` : ['确认过了，你就是我的宇宙中心。✦', '全宇宙的偏爱，正在向你靠近。♡', `${settings.me}的引力，只对${settings.her}生效。`][centralClicks % 3]);
    celebrate(centralClicks % 5 === 0 ? 50 : 10);
  });
  $('#menu-toggle').addEventListener('click', () => { const open = $('.main-nav').classList.toggle('open'); $('#menu-toggle').setAttribute('aria-expanded', String(open)); });
  $$('.main-nav a').forEach(link => link.addEventListener('click', () => { $('.main-nav').classList.remove('open'); $('#menu-toggle').setAttribute('aria-expanded', 'false'); }));
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) $$('.main-nav a').forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`));
  }, { rootMargin: '-10% 0px -60% 0px' });
  ['home', 'memories', 'story', 'play'].forEach(id => observer.observe(document.getElementById(id)));

  const backgroundMusic = $('#background-music');
  const musicButton = $('#music-toggle');
  backgroundMusic.volume = .45;
  function renderMusicState() {
    const playing = !backgroundMusic.paused && !backgroundMusic.ended;
    musicButton.classList.toggle('playing', playing);
    musicButton.setAttribute('aria-pressed', String(playing));
    musicButton.setAttribute('aria-label', `${playing ? '暂停' : '播放'}《我曾这样寂寞生活》`);
    musicButton.title = `${playing ? '暂停' : '播放'}《我曾这样寂寞生活》`;
  }
  function pauseMusic() { backgroundMusic.pause(); renderMusicState(); }
  $('#music-toggle').addEventListener('click', async () => {
    if (!backgroundMusic.paused) { pauseMusic(); return; }
    try {
      await backgroundMusic.play();
    } catch (err) {
      if (err.name !== 'AbortError') toast('音乐暂时没有播放成功，请检查网络后再点一次。');
      renderMusicState();
    }
  });
  for (const event of ['play','pause','ended']) backgroundMusic.addEventListener(event, renderMusicState);
  backgroundMusic.addEventListener('error', pauseMusic);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseMusic(); });
  window.addEventListener('pagehide', pauseMusic);
  renderMusicState();

  function initStars() {
    const canvas = $('#starfield'), context = canvas.getContext('2d');
    if (!context) return;
    let width = 0, height = 0, stars = [], frame = 0;
    function resize() {
      const bounds = canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 1.5);
      width = bounds.width; height = bounds.height;
      canvas.width = width * ratio; canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      stars = Array.from({ length: width < 700 ? 45 : 90 }, () => ({ x: Math.random() * width, y: Math.random() * height, radius: Math.random() * 1.1 + .3, phase: Math.random() * Math.PI * 2, speed: Math.random() * .0007 + .0002 }));
    }
    function paint(time) {
      context.clearRect(0, 0, width, height);
      for (const star of stars) { context.globalAlpha = .25 + (Math.sin(time * star.speed + star.phase) + 1) * .3; context.fillStyle = '#f6d5b2'; context.beginPath(); context.arc(star.x, star.y, star.radius, 0, Math.PI * 2); context.fill(); }
      context.globalAlpha = 1;
    }
    let visible = true;
    const visibility = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; });
    visibility.observe(canvas);
    function animate(time) { if (visible && !document.hidden) paint(time); frame = requestAnimationFrame(animate); }
    resize();
    paint(0);
    window.addEventListener('resize', resize, { passive: true });
    if (!reducedMotion) frame = requestAnimationFrame(animate);
    window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); visibility.disconnect(); }, { once: true });
  }

  const fileAsDataUrl = (blob) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
  async function fetchText(path) { const response = await fetch(path); if (!response.ok) throw new Error(`读取网站文件失败：${path}`); return response.text(); }
  async function inlineAsset(src) { if (src.startsWith('data:')) return src; const response = await fetch(src); if (!response.ok) throw new Error('素材打包失败，请稍后重试'); return fileAsDataUrl(await response.blob()); }
  function scriptSafe(text) { return text.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--'); }
  $('#export-gift').addEventListener('click', async () => {
    const button = $('#export-gift');
    button.disabled = true;
    button.textContent = '正在打包小宇宙……';
    toast('正在把星空、照片和故事装进同一个网页。♡');
    try {
      await albumReady;
      if (cloudMode && cloud.state().authorized) await syncCloudAlbum(true);
      let html, css, config, core, application;
      if (window.__UNIVERSE_OFFLINE_SOURCE__) ({ html, css, config, core, application } = window.__UNIVERSE_OFFLINE_SOURCE__);
      else {
        [html, css, config, core, application] = await Promise.all(['index.html', 'styles.css', 'config.js', 'time.js', 'app.js'].map(fetchText));
        css += '\n' + await fetchText('album.css');
        html = html.replace('<link rel="stylesheet" href="album.css">','');
      }
      const exportedPhotos = await Promise.all(photos.map(async photo => ({ ...photo, src: await inlineAsset(photo.src) })));
      let exportedCss = css;
      const background = /url\(['"]?(assets\/universe-hero\.webp)['"]?\)/;
      if (background.test(css)) exportedCss = css.replace(background, `url('${await inlineAsset('assets/universe-hero.webp')}')`);
      const data = { settings, stories: customStories, wishes, photos: exportedPhotos };
      html=html.replace(/\s*<script src="(?:cloud-config\.js|cloud\.js|vendor\/supabase\.js)" defer><\/script>/g,'');
      const offlineSource = { html, css: exportedCss, config, core, application };
      const musicData = await inlineAsset(backgroundMusic.getAttribute('src'));
      html = html.replace('src="assets/our-song.mp3"', () => `src="${musicData}"`);
      html = html.replace('<link rel="stylesheet" href="styles.css">', () => `<style>${exportedCss}</style>`);
      html = html.replace('<script src="config.js" defer></script>', () => `<script>${scriptSafe(config)}</script>`);
      html = html.replace('<script src="shared-data.js" defer></script>', () => `<script>window.UNIVERSE_BOOTSTRAP=${scriptSafe(JSON.stringify(data))};window.__UNIVERSE_OFFLINE_SOURCE__=${scriptSafe(JSON.stringify(offlineSource))};</script>`);
      html = html.replace('<script src="time.js" defer></script>', () => `<script>${scriptSafe(core)}</script>`);
      html = html.replace('<script src="app.js" defer></script>', () => `<script>document.addEventListener('DOMContentLoaded',function(){${scriptSafe(application)}\n});</script>`);
      html = html.replace(/<title>.*?<\/title>/, () => `<title>你就是我的宇宙 · ${settings.me.replace(/[<>&]/g, '')} × ${settings.her.replace(/[<>&]/g, '')}</title>`);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob), anchor = node('a');
      anchor.href = url;
      anchor.download = `你就是我的宇宙-${settings.me}-${settings.her}.html`.replace(/[\\/:*?"<>|]/g, '-');
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast('小宇宙已打包下载，把这个 HTML 文件送给她吧。♡');
    } catch (err) { toast(`打包未完成：${err.message}。请通过网站链接打开后重试。`); }
    finally { button.disabled = false; button.textContent = '打包送给她 ↗'; }
  });

  renderSettings();
  renderPhotos();
  renderWishes();
  initStars();
  setInterval(renderClock, 1000);
  if (cloudMode) {
    cloud.subscribe(updateCloudState);
    updateCloudState(cloud.state());
    cloud.init().then(() => { if(cloud.state().hasInvite) showAccount(); }).catch(err => { $('#cloud-status-text').textContent=err.message; toast(err.message); });
    setInterval(() => { if(!document.hidden && cloud.state().authorized) syncCloudAlbum(true).catch(()=>{}); },30000);
    document.addEventListener('visibilitychange',() => { if(!document.hidden && cloud.state().authorized) syncCloudAlbum(true).catch(()=>{}); });
  }
  if (location.protocol === 'file:' && !window.__UNIVERSE_OFFLINE_SOURCE__) toast('双击「打开我们的小宇宙.cmd」可完整预览并打包网站。');
})();
