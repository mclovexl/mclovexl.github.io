/* Browser-only local test fixture. Talks only to the loopback mock server. */
(() => {
  const owner=location.port==='4178';
  const user={id:owner?'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa':'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    email:owner?'owner@example.invalid':'partner@example.invalid'};
  const params=new URLSearchParams(location.search);
  if (params.has('legacy') && !localStorage.getItem('qa-legacy-seeded')) {
    localStorage.setItem('our-universe-v1:stories',JSON.stringify([{id:'11111111-1111-4111-8111-111111111111',date:'2026-06-24',title:'本机旧故事测试',body:'原来浏览器里的回忆'}]));
    localStorage.setItem('our-universe-v1:wishes',JSON.stringify([{id:'wish-sea',text:'一起去看海',done:true}]));
    localStorage.setItem('our-universe-v1:settings',JSON.stringify({letter:'这是一封本机旧情书测试。'}));
    localStorage.setItem('qa-legacy-seeded','yes');
  }
  const request=async payload=>{
    const response=await fetch('/__qa_api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    return response.json();
  };
  let session={user};
  const listeners=[];
  class Query {
    constructor(table){this.table=table;this.operation='select';this.filters=[];this.orders=[];this.first=0;this.last=199;}
    select(){return this;}
    order(field,options){this.orders.push({field,ascending:options?.ascending!==false});return this;}
    range(first,last){this.first=first;this.last=last;return this;}
    gt(field,value){this.filters.push({op:'gt',field,value});return this;}
    eq(field,value){this.filters.push({op:'eq',field,value});return this;}
    is(field,value){this.filters.push({op:'is',field,value});return this;}
    not(field,op,value){this.filters.push({op:'not',field,value});return this;}
    upsert(value){this.operation='upsert';this.value=value;return this;}
    update(value){this.operation='update';this.value=value;return this;}
    async run(single=false){
      if(!session)return {data:null,error:{message:'not signed in'}};
      return request({table:this.table,operation:this.operation,filters:this.filters,orders:this.orders,actor:owner?'owner':'partner',userId:user.id,
        first:this.first,last:this.last,value:this.value,single});
    }
    maybeSingle(){return this.run(true);}
    then(ok,fail){return this.run().then(ok,fail);}
  }
  window.supabase={createClient:()=>({
    auth:{
      onAuthStateChange(fn){listeners.push(fn);},
      async getSession(){return {data:{session},error:null};},
      async signOut(){session=null;listeners.forEach(fn=>fn('SIGNED_OUT',null));return {error:null};},
      async signInWithPassword(){session={user};listeners.forEach(fn=>fn('SIGNED_IN',session));return {data:{session},error:null};}
    },
    async rpc(){return {data:owner?'owner':'partner',error:null};},
    from(table){return new Query(table);}
  })};
})();
