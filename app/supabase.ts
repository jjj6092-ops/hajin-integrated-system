type Session = { user: { id: string; email: string } } | null;
type Listener = (event: string, session: Session) => void;
const listeners = new Set<Listener>();
let session: Session = null;

async function request(path: string, options?: RequestInit) {
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

export const supabase = {
  auth: {
    async getSession() {
      try {
        const data = await request("/api/session");
        session = data.user ? { user: data.user } : null;
      } catch {
        session = null;
      }
      return { data: { session } };
    },
    onAuthStateChange(listener: Listener) {
      listeners.add(listener);
      void request("/api/session")
        .then((data) => {
          session = data.user ? { user: data.user } : null;
          listener("INITIAL_SESSION", session);
        })
        .catch(() => listener("INITIAL_SESSION", null));
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      try {
        const data = await request("/api/login", { method: "POST", body: JSON.stringify({ email, password }) });
        session = { user: data.user };
        listeners.forEach((fn) => fn("SIGNED_IN", session));
        return { error: null };
      } catch (error) {
        return { error };
      }
    },
    async signOut() {
      await request("/api/logout", { method: "POST" }).catch(() => null);
      session = null;
      listeners.forEach((fn) => fn("SIGNED_OUT", null));
    },
  },
  from(table: string) {
    let action = "select", payload: any = null, single = false;
    const filters: Record<string, any> = {};
    const read = () => JSON.parse(localStorage.getItem(`hajin_${table}`) || "[]");
    const write = (rows: any[]) => localStorage.setItem(`hajin_${table}`, JSON.stringify(rows));
    const execute = async () => {
      if (table === "staff_profiles") return { data: { employee_id: session?.user.id || "admin", display_name: session?.user.id || "관리자", role: "admin", active: true }, error: null };
      const rows: any[] = read();
      if (action === "insert") {
        const item = { ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() };
        write([item, ...rows]);
        return { data: single ? item : null, error: null };
      }
      if (action === "update") {
        let changed: any = null;
        const next = rows.map((row) => Object.entries(filters).every(([k, v]) => row[k] === v) ? (changed = { ...row, ...payload }) : row);
        write(next);
        return { data: single ? changed : null, error: changed || !single ? null : new Error("not found") };
      }
      const result = rows.filter((row) => Object.entries(filters).every(([k, v]) => row[k] === v));
      return { data: single ? (result[0] || null) : result, error: null };
    };
    const builder: any = {
      select() { return builder; }, order() { return builder; },
      eq(key: string, value: any) { filters[key] = value; return builder; },
      insert(value: any) { action = "insert"; payload = value; return builder; },
      update(value: any) { action = "update"; payload = value; return builder; },
      single() { single = true; return builder; }, maybeSingle() { single = true; return builder; },
      then(resolve: any, reject: any) { return execute().then(resolve, reject); },
    };
    return builder;
  },
  channel() { const channel: any = { on() { return channel; }, subscribe() { return channel; } }; return channel; },
  removeChannel() { return Promise.resolve(); },
};
