import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

// This endpoint authenticates a single-use, high-entropy enrollment capability.
// It does not accept public registration, password resets or arbitrary emails.
const origins = new Set(['https://zhaomengchi.github.io','http://127.0.0.1:4175','http://127.0.0.1:4176']);
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false }
});
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const headers: Record<string,string> = { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin' };
  if (origins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  headers['Access-Control-Allow-Headers'] = 'apikey,authorization,content-type,x-client-info';
  headers['Access-Control-Allow-Methods'] = 'POST,OPTIONS';
  const reply = (status:number, body:unknown) => new Response(JSON.stringify(body),{status,headers});
  if (origin && !origins.has(origin)) return reply(403,{error:'来源不被允许'});
  if (req.method==='OPTIONS') return new Response(null,{status:204,headers});
  if (req.method!=='POST') return reply(405,{error:'请求方式不被允许'});
  if (Number(req.headers.get('content-length') || 0)>4096) return reply(413,{error:'请求过大'});
  let claim: {email:string;claim_id:string} | undefined;
  let hash = '';
  try {
    const raw = await req.text();
    if (raw.length>4096) return reply(413,{error:'请求过大'});
    const body = JSON.parse(raw);
    if (!/^[A-Za-z0-9_-]{43}$/.test(body.token || '')) return reply(400,{error:'开通链接无效'});
    const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.token));
    hash = [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
    if (body.action==='inspect') {
      const {data,error} = await admin.rpc('album_invite_inspect',{p_token_hash:hash});
      if (error || !data?.length) return reply(404,{error:'开通链接已失效或已使用'});
      return reply(200,{email:data[0].email});
    }
    if (body.action!=='enroll' || typeof body.password!=='string' || body.password.length<12 || body.password.length>128) return reply(400,{error:'请设置 12 到 128 个字符的密码'});
    const {data,error} = await admin.rpc('album_invite_claim',{p_token_hash:hash});
    if (error || !data?.length) return reply(409,{error:'开通链接已失效、已使用或正在处理中'});
    claim = data[0];
    const {data:created,error:createError} = await admin.auth.admin.createUser({email:claim!.email,password:body.password,email_confirm:true});
    if (createError || !created.user) {
      await admin.rpc('album_invite_release',{p_token_hash:hash,p_claim_id:claim!.claim_id});
      return reply(409,{error:'账号未创建；若你已开通过相册，请直接使用原密码登录'});
    }
    const {data:finished,error:finishError} = await admin.rpc('album_invite_finish',{p_token_hash:hash,p_claim_id:claim!.claim_id,p_user_id:created.user.id});
    if (finishError || !finished) return reply(200,{email:claim!.email,note:'账号已创建，请使用刚设置的密码登录'});
    return reply(200,{email:claim!.email});
  } catch {
    if (claim && hash) await admin.rpc('album_invite_release',{p_token_hash:hash,p_claim_id:claim.claim_id});
    return reply(400,{error:'无法处理开通请求，请稍后重试'});
  }
});
