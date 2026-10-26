(() => {
  'use strict';
  const config = window.UNIVERSE_CLOUD_CONFIG || {};
  const enabled = config.enabled !== false;
  const configured = enabled && /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.url || '') && !!config.publishableKey && !!window.supabase;
  const listeners = new Set();
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
    if(!sameIdentity) { role=null; emit(); }
    if (next) {
      const {data,error} = await client.rpc('current_album_role');
      if (current!==revision) return;
      if (error) throw failure('暂时无法核对相册权限，请稍后重新登录');
      role = data;
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
      queueMicrotask(() => updateSession(next).catch(() => { initialized=true; role=null; emit(); }));
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
    emit();
    const {error} = await client.auth.signOut({scope:'local'});
    if (error) throw failure('本机已退出；请检查网络后再次确认退出状态');
  }
  async function readPhotos(trashed = false, offset = 0) {
    requireAccess();
    const current=revision, author=session.user.id;
    let query=client.from('album_photos').select('id,object_path,title,category,photo_date,created_at,created_by,deleted_at').eq('album_id',config.album);
    query=trashed ? query.eq('created_by',author).not('deleted_at','is',null).order('deleted_at',{ascending:false}).range(offset,offset+29) : query.is('deleted_at',null).order('created_at',{ascending:false}).limit(60);
    const {data:rows,error} = await query;
    if (error) throw failure('暂时没有读到共享相册，请检查网络后刷新');
    if (current!==revision) throw failure('登录状态已改变，请重新同步');
    if (!rows.length) return [];
    const {data:urls,error:urlError} = await client.storage.from(config.bucket).createSignedUrls(rows.map(row=>row.object_path),3600);
    if (urlError || urls.some(item=>item.error || !item.signedUrl)) throw failure('部分照片的访问链接未能生成，请重新同步');
    if (current!==revision) throw failure('登录状态已改变，请重新同步');
    const byPath=new Map(urls.map(item=>[item.path,item.signedUrl]));
    return rows.map(row=>({id:row.id,src:byPath.get(row.object_path),title:row.title,category:row.category,date:row.photo_date || '',demo:false,objectPath:row.object_path,createdBy:row.created_by,canManage:row.created_by===author,deletedAt:row.deleted_at}));
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
  window.UniverseCloud={enabled,configured,state,init,login,logout,listPhotos,listTrashedPhotos,movePhotoToTrash,restorePhoto,addPhotos,inspectInvite,enroll,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}};
})();
