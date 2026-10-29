(() => {
  'use strict';
  const config = window.UNIVERSE_CLOUD_CONFIG || {};
  const enabled = config.enabled !== false;
  const configured = enabled && /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.url || '') && !!config.publishableKey && !!window.supabase;
  const listeners = new Set();
  const signedPhotoUrls = new Map();
  const photoFields = 'id,object_path,title,category,photo_date,created_at,created_by,deleted_at';
  let client, session = null, role = null, initialized = false, revision = 0;
  let pendingInvite = new URLSearchParams(location.hash.slice(1)).get('invite');
  if (pendingInvite) history.replaceState(null,'',location.pathname+location.search);
  const state = () => ({ enabled, configured, initialized, authenticated:!!session, authorized:!!session && !!role, email:session?.user?.email || '', userId:session?.user?.id || '', role, hasInvite:!!pendingInvite });
  const emit = () => { for (const listener of listeners) listener(state()); };
  const failure = message => { const error = new Error(message); error.name='AlbumError'; return error; };
  function requireAccess() {
    if (!configured) throw failure('云端相册尚未完成配置');
    if (!session) throw failure('先登录，再把心动放进我们的共享相册');
    if (!role) throw failure('这个账号还没有相册访问权限');
  }
  async function updateSession(next) {
    const current = ++revision;
    const sameIdentity=!!next && session?.user?.id===next.user.id && session?.user?.email===next.user.email;
    session = next;
    if(!sameIdentity) { role=null; signedPhotoUrls.clear(); emit(); }
    if (next) {
      const {data,error} = await client.rpc('current_album_role');
      if (current!==revision) return;
      if (error) throw failure('暂时无法核对相册权限，请稍后重新登录');
      role = data;
      if (!role) signedPhotoUrls.clear();
    }
    initialized = true;
    emit();
  }
  async function init() {
    if (!configured) { initialized=true; emit(); return; }
    client = window.supabase.createClient(config.url,config.publishableKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'our-universe-cloud-auth'}
    });
    client.auth.onAuthStateChange((_event,next) => {
      queueMicrotask(() => updateSession(next).catch(() => { initialized=true; role=null; signedPhotoUrls.clear(); emit(); }));
    });
    const {data,error} = await client.auth.getSession();
    if (error) throw failure('无法读取登录状态，请重新登录');
    await updateSession(data.session);
  }
  async function login(email,password) {
    if (!configured) throw failure('云端相册尚未完成配置');
    const {data,error} = await client.auth.signInWithPassword({email:email.trim().toLowerCase(),password});
    if (error) throw failure('邮箱或密码不正确，或账号尚未开通');
    await updateSession(data.session);
    if (!role) { await logout(); throw failure('这个账号还没有相册访问权限'); }
  }
  async function logout() {
    revision++;
    session=null; role=null;
    signedPhotoUrls.clear();
    emit();
    const {error} = await client.auth.signOut({scope:'local'});
    if (error) throw failure('本机已退出；请检查网络后再次确认退出状态');
  }
  async function readPhotos(trashed = false, offset = 0) {
    requireAccess();
    const current=revision, author=session.user.id;
    let rows=[];
    if (trashed) {
      const result=await client.from('album_photos').select(photoFields).eq('album_id',config.album).eq('created_by',author).not('deleted_at','is',null).order('deleted_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+29);
      if (result.error) throw failure('暂时没有读到回收站，请检查网络后刷新');
      if (current!==revision) throw failure('登录状态已改变，请重新同步');
      rows=result.data;
    } else {
      // Read until exhausted. A timestamp + UUID cursor also handles equal
      // timestamps and concurrent inserts/deletes without shifting offsets.
      let cursor=null;
      while (true) {
        let query=client.from('album_photos').select(photoFields).eq('album_id',config.album).is('deleted_at',null).order('created_at',{ascending:false}).order('id',{ascending:false});
        if (cursor) {
          const time=JSON.stringify(cursor.created_at);
          query=query.or(`created_at.lt.${time},and(created_at.eq.${time},id.lt.${cursor.id})`);
        }
        const {data:page,error}=await query.range(0,199);
        if (error) throw failure('暂时没有读到共享相册，请检查网络后刷新');
        if (current!==revision) throw failure('登录状态已改变，请重新同步');
        if (!page.length) break;
        const last=page[page.length-1];
        if (cursor && last.id===cursor.id && last.created_at===cursor.created_at) throw failure('相册读取暂未完成，请刷新后重试');
        rows.push(...page);
        cursor=last;
      }
    }
    if (!rows.length) return [];
    const now=Date.now();
    for (const [path,item] of signedPhotoUrls) if (item.expiresAt<=now) signedPhotoUrls.delete(path);
    const missing=rows.filter(row=>!signedPhotoUrls.has(row.object_path));
    for (let start=0;start<missing.length;start+=100) {
      const paths=missing.slice(start,start+100).map(row=>row.object_path);
      const {data:urls,error}=await client.storage.from(config.bucket).createSignedUrls(paths,3600);
      if (current!==revision) throw failure('登录状态已改变，请重新同步');
      if (error || !urls || paths.some(path=>!urls.some(item=>item.path===path && item.signedUrl && !item.error))) throw failure('部分照片的访问链接未能生成，请重新同步');
      for (const item of urls) signedPhotoUrls.set(item.path,{url:item.signedUrl,expiresAt:Date.now()+55*60000});
    }
    return rows.map(row=>({id:row.id,src:signedPhotoUrls.get(row.object_path).url,title:row.title,category:row.category,date:row.photo_date || '',demo:false,objectPath:row.object_path,createdBy:row.created_by,canManage:row.created_by===author,deletedAt:row.deleted_at}));
  }
  async function listPhotos() { return readPhotos(); }
  async function listTrashedPhotos(offset = 0) { return readPhotos(true,Math.max(0,Math.trunc(offset)||0)); }
  async function setPhotoTrashed(id, trashed) {
    requireAccess();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')) throw failure('没有找到这张照片');
    const current=revision, author=session.user.id;
    let query=client.from('album_photos').update({deleted_at:trashed ? new Date().toISOString() : null}).eq('album_id',config.album).eq('id',id).eq('created_by',author);
    query=trashed ? query.is('deleted_at',null) : query.not('deleted_at','is',null);
    const {data,error}=await query.select('id').maybeSingle();
    if (current!==revision) throw failure('登录状态已改变，请重新同步相册');
    // A repeated click or a lost response can follow a committed update.
    // Confirm the owned row's state before reporting success for a zero-row result.
    if (error || !data) {
      const {data:existing,error:readError}=await client.from('album_photos').select('id,deleted_at').eq('album_id',config.album).eq('id',id).eq('created_by',author).maybeSingle();
      if (current!==revision) throw failure('登录状态已改变，请重新同步相册');
      if (readError || !existing || Boolean(existing.deleted_at)!==trashed) throw failure(trashed ? '照片未移入回收站，请刷新后重试；只能管理自己上传的照片' : '照片未恢复，请刷新回收站后重试');
    }
  }
  async function movePhotoToTrash(id) { return setPhotoTrashed(id,true); }
  async function restorePhoto(id) { return setPhotoTrashed(id,false); }
  async function addPhotos(items) {
    requireAccess();
    const current=revision, author=session.user.id;
    let committed=0;
    try {
      for (const item of items) {
        requireAccess();
        if (current!==revision) throw failure('登录状态已改变，上传已停止');
        const path=`${config.album}/${item.id}.jpg`;
        const response=await fetch(item.src);
        const blob=await response.blob();
        const {error:uploadError}=await client.storage.from(config.bucket).upload(path,blob,{contentType:'image/jpeg',cacheControl:'3600',upsert:false});
        if (uploadError) throw failure('照片未上传成功，请检查网络和相册权限');
        const row={id:item.id,album_id:config.album,object_path:path,title:item.title,category:item.category,photo_date:item.date||null,byte_count:blob.size,created_by:author};
        const {error:saveError}=await client.from('album_photos').insert(row);
        if (saveError) {
          // A lost response may follow a committed insert. Check before cleanup.
          const {data:existing}=await client.from('album_photos').select('id').eq('id',item.id).maybeSingle();
          if (!existing) { await client.storage.from(config.bucket).remove([path]); throw failure('照片信息未保存成功，请重新上传'); }
        }
        committed++;
      }
      return {committed};
    } catch (error) { error.committed=committed; throw error; }
  }
  // Stories, wishes and letters use the same two-person membership as photos.
  // Read by a stable primary-key cursor so the Data API's row cap does not
  // silently hide older memories.
  async function readSharedRows(table, fields) {
    requireAccess();
    const current=revision;
    const rows=[];
    let cursor=null;
    while (true) {
      let query=client.from(table).select(fields).order('id',{ascending:true}).range(0,199);
      if (cursor) query=query.gt('id',cursor);
      const {data,error}=await query;
      if (current!==revision) throw failure('登录状态已改变，请重新同步');
      if (error) throw failure('暂时无法读取共同回忆，请检查网络后重试');
      if (!data.length) break;
      if (cursor===data[data.length-1].id) throw failure('共同回忆尚未读取完整，请重试');
      rows.push(...data); cursor=data[data.length-1].id;
    }
    return rows;
  }
  async function sharedUpsert(table, rows) {
    requireAccess();
    const current=revision;
    for (let start=0;start<rows.length;start+=100) {
      const {error}=await client.from(table).upsert(rows.slice(start,start+100),{onConflict:'id',ignoreDuplicates:true});
      if (current!==revision) throw failure('登录状态已改变，请重新同步');
      if (error) throw failure('旧回忆还没有全部同步，请检查网络后重试');
    }
  }
  async function textHash(text) {
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function stableStoryId(story) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(story.id || '')) return story.id;
    const h=await textHash(JSON.stringify(story));
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
  }
  async function migrateSharedMemories(legacy, defaultWishes, defaultLetter) {
    requireAccess();
    const current=revision, author=session.user.id;
    const snapshot={stories:legacy.stories,wishes:legacy.wishes,letter:legacy.letter};
    const fingerprint=await textHash(JSON.stringify(snapshot));
    const hasLegacy=(Array.isArray(snapshot.stories)&&snapshot.stories.length>0)
      || Array.isArray(snapshot.wishes) || !!snapshot.letter;
    if (hasLegacy) {
      await sharedUpsert('universe_legacy_backups',[{id:fingerprint,snapshot,created_by:author}]);
    }
    const validStories=[];
    let skipped=0;
    for (const story of Array.isArray(legacy.stories)?legacy.stories:[]) {
      if (!story || typeof story.title!=='string' || typeof story.body!=='string' ||
          !story.title.trim() || !story.body.trim() || story.title.trim().length>60 || story.body.trim().length>2000) { skipped++; continue; }
      try { window.UniverseTime.dateParts(story.date); } catch { skipped++; continue; }
      validStories.push({id:await stableStoryId(story),story_date:story.date,title:story.title.trim(),body:story.body.trim(),created_by:author});
    }
    await sharedUpsert('universe_stories',validStories);
    const oldWishes=Array.isArray(legacy.wishes)?legacy.wishes:[];
    const seeds=[];
    const seen=new Set();
    for (const wish of [...oldWishes,...defaultWishes]) {
      if (!wish || !/^[a-zA-Z0-9-]{1,80}$/.test(wish.id || '') || typeof wish.text!=='string' ||
          !wish.text.trim() || wish.text.trim().length>40) { skipped++; continue; }
      if (seen.has(wish.id)) continue;
      seen.add(wish.id);
      seeds.push({id:wish.id,wish_text:wish.text.trim(),done:!!wish.done,source:oldWishes.includes(wish)?'legacy':'seed',created_by:author,updated_by:author});
    }
    await sharedUpsert('universe_wishes',seeds);
    for (const wish of seeds.filter(w=>w.source==='legacy')) {
      const {error}=await client.from('universe_wishes')
        .update({done:wish.done,source:'legacy',updated_by:author,updated_at:new Date().toISOString()})
        .eq('id',wish.id).eq('wish_text',wish.wish_text).eq('source','seed').select('id').maybeSingle();
      if (current!==revision) throw failure('登录状态已改变，请重新同步');
      if (error) throw failure('旧愿望状态暂时无法同步，请稍后重试');
    }
    const originalLetter=typeof legacy.letter==='string' && legacy.letter.trim() && legacy.letter.trim().length<=6000 ? legacy.letter.trim() : '';
    if (legacy.letter && !originalLetter) skipped++;
    if (originalLetter && originalLetter!==defaultLetter) {
      await sharedUpsert('universe_letter_history',[{id:'legacy-'+await textHash(originalLetter),body:originalLetter,source:'legacy',created_by:author}]);
    }
    await sharedUpsert('universe_letter',[{id:'shared',body:originalLetter || defaultLetter,source:originalLetter?'legacy':'seed',revision:crypto.randomUUID(),updated_by:author}]);
    if (current!==revision) throw failure('登录状态已改变，请重新同步');
    return {skipped,fingerprint};
  }
  async function listSharedMemories() {
    requireAccess();
    const current=revision;
    const [stories,wishes,letters,history]=await Promise.all([
      readSharedRows('universe_stories','id,story_date,title,body,revision'),
      readSharedRows('universe_wishes','id,wish_text,done'),
      readSharedRows('universe_letter','id,body,revision,source'),
      readSharedRows('universe_letter_history','id,body,source,created_at')
    ]);
    if (current!==revision) throw failure('登录状态已改变，请重新同步');
    if (letters.length!==1) throw failure('共同情书尚未准备好，请稍后重试');
    return {stories:stories.map(s=>({id:s.id,date:s.story_date,title:s.title,body:s.body,revision:s.revision})),
      wishes:wishes.map(w=>({id:w.id,text:w.wish_text,done:w.done})),letter:letters[0],
      history:history.sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id))};
  }
  async function addSharedStory(story) {
    requireAccess();
    const current=revision, author=session.user.id;
    await sharedUpsert('universe_stories',[{id:story.id,story_date:story.date,title:story.title,body:story.body,created_by:author}]);
    const {data,error}=await client.from('universe_stories').select('id,story_date,title,body,revision').eq('id',story.id).maybeSingle();
    if (current!==revision) throw failure('登录状态已改变，请重新同步');
    if (error || !data || data.story_date!==story.date || data.title!==story.title || data.body!==story.body)
      throw failure('这段故事与云端已有内容不同，请重新打开后保存');
    return {...story,revision:data.revision};
  }
  async function updateSharedStory(story, original) {
    requireAccess();
    const current=revision;
    if (!original?.revision || story.id!==original.id || typeof story.title!=='string' || !story.title.trim() || story.title.length>60 ||
        typeof story.body!=='string' || !story.body.trim() || story.body.length>2000) throw failure('请把故事的日期、标题和内容填写完整');
    window.UniverseTime.dateParts(story.date);
    // Match the version opened in the editor so one device cannot overwrite
    // a newer edit from the other. Creation metadata remains untouched.
    const {data,error}=await client.from('universe_stories')
      .update({story_date:story.date,title:story.title,body:story.body,revision:crypto.randomUUID()})
      .eq('id',story.id).eq('revision',original.revision)
      .select('id,story_date,title,body,revision').maybeSingle();
    if (current!==revision) throw failure('登录状态已改变，请重新同步');
    if (error) throw failure('暂时无法保存故事，请检查网络后重试');
    if (data) return {...story,revision:data.revision};
    // A response may have been lost after a successful save; retrying that
    // exact edit is safe and must not create a duplicate story.
    const latest=await client.from('universe_stories').select('id,story_date,title,body,revision').eq('id',story.id).maybeSingle();
    if (current!==revision) throw failure('登录状态已改变，请重新同步');
    if (latest.error) throw failure('暂时无法确认故事是否保存，请检查网络后重试');
    if (latest.data?.story_date===story.date && latest.data.title===story.title && latest.data.body===story.body) return {...story,revision:latest.data.revision};
    const conflict=failure('另一台设备刚修改了这段故事，当前输入仍保留。可先复制你的文字，再载入最新内容（会替换当前输入）');
    conflict.name='StoryConflict';
    conflict.latestStory=latest.data ? {id:latest.data.id,date:latest.data.story_date,title:latest.data.title,body:latest.data.body,revision:latest.data.revision} : null;
    throw conflict;
  }
  async function addSharedWish(wish) {
    requireAccess();
    const current=revision, author=session.user.id;
    await sharedUpsert('universe_wishes',[{id:wish.id,wish_text:wish.text,done:false,source:'edit',created_by:author,updated_by:author}]);
    const {data,error}=await client.from('universe_wishes').select('id,wish_text').eq('id',wish.id).maybeSingle();
    if (current!==revision) throw failure('登录状态已改变，请重新同步');
    if (error || !data || data.wish_text!==wish.text) throw failure('这个愿望与云端已有内容不同，请重新打开后保存');
  }
  async function setSharedWish(id,done) {
    requireAccess();
    const current=revision;
    const {data,error}=await client.from('universe_wishes').update({done,source:'edit',updated_by:session.user.id,updated_at:new Date().toISOString()}).eq('id',id).select('id').maybeSingle();
    if (current!==revision) throw failure('登录状态已改变，请重新同步');
    if (error || !data) throw failure('愿望状态未保存，请检查网络后重试');
  }
  async function saveSharedLetter(body,expectedRevision) {
    requireAccess();
    const current=revision, author=session.user.id, nextRevision=crypto.randomUUID();
    // Save the submitted text first; a competing edit never destroys either version.
    await sharedUpsert('universe_letter_history',[{id:nextRevision,body,source:'edit',created_by:author}]);
    const {data,error}=await client.from('universe_letter')
      .update({body,source:'edit',revision:nextRevision,updated_by:author,updated_at:new Date().toISOString()})
      .eq('id','shared').eq('revision',expectedRevision).select('id,body,revision,source').maybeSingle();
    if (current!==revision) throw failure('登录状态已改变，请重新同步');
    if (error) throw failure('情书未保存，请检查网络后重试');
    if (!data) { const conflict=failure('另一台设备刚修改了情书。你的文字已保存在历史情书，请重新打开后选择使用。'); conflict.name='LetterConflict'; throw conflict; }
    return data;
  }
  async function promoteLegacyLetter(body,expectedRevision) {
    requireAccess();
    const current=revision;
    const {data,error}=await client.from('universe_letter')
      .update({body,source:'legacy',revision:crypto.randomUUID(),updated_by:session.user.id,updated_at:new Date().toISOString()})
      .eq('id','shared').eq('source','seed').eq('revision',expectedRevision).select('id,body,revision,source').maybeSingle();
    if (current!==revision) throw failure('登录状态已改变，请重新同步');
    if (error) throw failure('旧情书暂时无法同步，请稍后重试');
    return data;
  }
  async function inviteRequest(action,password) {
    if (!configured || !/^[A-Za-z0-9_-]{43}$/.test(pendingInvite || '')) throw failure('开通链接无效，请重新打开专属开通链接');
    const response=await fetch(`${config.url}/functions/v1/album-enroll`,{
      method:'POST',headers:{'Content-Type':'application/json',apikey:config.publishableKey},
      body:JSON.stringify({action,token:pendingInvite,...(password?{password}:{})})
    });
    const data=await response.json();
    if (!response.ok) throw failure(data.error || '开通请求未完成');
    return data;
  }
  async function inspectInvite() { return inviteRequest('inspect'); }
  async function enroll(password) {
    const result=await inviteRequest('enroll',password);
    pendingInvite=null;
    await login(result.email,password);
  }
  window.UniverseCloud={enabled,configured,state,init,login,logout,listPhotos,listTrashedPhotos,movePhotoToTrash,restorePhoto,addPhotos,migrateSharedMemories,listSharedMemories,promoteLegacyLetter,addSharedStory,updateSharedStory,addSharedWish,setSharedWish,saveSharedLetter,inspectInvite,enroll,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}};
})();
