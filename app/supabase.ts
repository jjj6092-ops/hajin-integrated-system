type Session = { user: { id: string; email: string } } | null;
type Listener = (event: string, session: Session) => void;
const listeners = new Set<Listener>();
let session: Session = null;

async function request(path: string, options?: RequestInit, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, {
      credentials: "include",
      ...options,
      signal: options?.signal || controller.signal,
      headers: {
        ...(options?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(options?.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
    return data;
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error("서버 응답이 지연되고 있습니다. 잠시 후 다시 눌러주세요.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function query(table: string) {
  let action = "select", payload: any = null, wantSingle = false, maybe = false;
  const filters: Array<{op:string,key:string,value:any}> = [];
  let orderBy: any = null;
  let rowLimit: number | null = null;

  const runDataRequest = async (body: string) => {
    if (action !== "update") return request("/api/data", { method: "POST", body });
    try {
      return await request("/api/data", { method: "POST", body }, 7000);
    } catch (firstError) {
      await new Promise(resolve => window.setTimeout(resolve, 350));
      try {
        return await request("/api/data", { method: "POST", body }, 7000);
      } catch {
        throw firstError;
      }
    }
  };

  const execute = async () => {
    try {
      const body = JSON.stringify({ table, action, payload, filters, orderBy, single: wantSingle, maybe });
      let data = await runDataRequest(body);
      if (action === "select" && !wantSingle && (table === "as_jobs" || table === "business_documents") && Array.isArray(data.data) && data.data.length === 0 && typeof localStorage !== "undefined") {
        try {
          const legacy = JSON.parse(localStorage.getItem(`hajin_${table}`) || "[]");
          if (Array.isArray(legacy) && legacy.length) {
            await request("/api/migrate", { method: "POST", body: JSON.stringify({ table, rows: legacy }) });
            data = await request("/api/data", { method: "POST", body });
          }
        } catch {}
      }
      if (action === "select" && !wantSingle && rowLimit !== null && Array.isArray(data.data)) {
        data.data = data.data.slice(0, rowLimit);
      }
      return { data: data.data ?? null, error: null };
    } catch (error) {
      return { data: null, error };
    }
  };

  const b: any = {
    select() { return b; },
    order(key:string, options:any={}) { orderBy={key,ascending:options.ascending!==false}; return b; },
    limit(value:number) { rowLimit = Number.isFinite(value) && value >= 0 ? Math.floor(value) : null; return b; },
    eq(key:string,value:any) { filters.push({op:"eq",key,value}); return b; },
    in(key:string,value:any[]) { filters.push({op:"in",key,value}); return b; },
    insert(value:any) { action="insert"; payload=value; return b; },
    update(value:any) { action="update"; payload=value; return b; },
    delete() { action="delete"; return b; },
    single() { wantSingle=true; return b; },
    maybeSingle() { wantSingle=true; maybe=true; return b; },
    then(resolve:any,reject:any) { return execute().then(resolve,reject); },
  };
  return b;
}

export const supabase = {
  auth: {
    async getSession() {
      try { const d=await request("/api/session"); session=d.user?{user:d.user}:null; }
      catch { session=null; }
      return {data:{session}};
    },
    onAuthStateChange(listener:Listener) {
      listeners.add(listener);
      void request("/api/session").then(d=>{session=d.user?{user:d.user}:null;listener("INITIAL_SESSION",session);}).catch(()=>listener("INITIAL_SESSION",null));
      return {data:{subscription:{unsubscribe:()=>listeners.delete(listener)}}};
    },
    async signInWithPassword({email,password}:{email:string,password:string}) {
      try {
        const d=await request("/api/login",{method:"POST",body:JSON.stringify({email,password})});
        session={user:d.user};
        listeners.forEach(fn=>fn("SIGNED_IN",session));
        return {error:null};
      } catch(error){return {error};}
    },
    async signOut(){
      await request("/api/logout",{method:"POST"}).catch(()=>null);
      session=null;
      listeners.forEach(fn=>fn("SIGNED_OUT",null));
    },
  },
  from: query,
  storage: {
    from(_bucket:string) {
      return {
        async upload(path:string,file:File,_options:any={}){
          try {
            const form=new FormData();
            form.append("file",file);
            form.append("path",path);
            await request("/api/photos",{method:"POST",body:form},30000);
            return {error:null};
          } catch(error){return {error};}
        },
        async remove(paths:string[]){
          try{await request("/api/photos/remove",{method:"POST",body:JSON.stringify({paths})});return {error:null};}
          catch(error){return {error};}
        },
        async createSignedUrl(path:string,_seconds:number){
          try{const d=await request(`/api/photos/url?path=${encodeURIComponent(path)}`);return {data:{signedUrl:d.url},error:null};}
          catch(error){return {data:null,error};}
        },
        async list(folder:string,options:any={}){
          try{const d=await request(`/api/photos/list?folder=${encodeURIComponent(folder)}&limit=${options.limit||100}`);return {data:d.data,error:null};}
          catch(error){return {data:null,error};}
        },
      };
    },
  },
  channel(){const c:any={on(){return c;},subscribe(){return c;}};return c;},
  removeChannel(){return Promise.resolve();},
};
