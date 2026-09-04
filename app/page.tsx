"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
type User = { email?: string };
import {
  Bell,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Eye,
  EyeOff,
  FileText,
  Home,
  LockKeyhole,
  LogOut,
  Mail,
  Package,
  Plus,
  Search,
  Settings,
  ToolCase,
  UserRound,
  Wrench,
} from "lucide-react";
import { supabase } from "./supabase";

type Status = "접수" | "방문예정" | "부품대기" | "재방문" | "처리완료";
type Profile = {
  employee_id: string;
  display_name: string;
  role: "admin" | "office" | "field";
  active: boolean;
};
type JobRow = {
  id: number;
  company: string;
  site: string;
  contact_phone: string;
  machine: string;
  issue: string;
  visit_note: string;
  worker: string;
  status: Status;
  resolution: string;
  created_at: string;
};
type Job = {
  dbId: number;
  id: string;
  company: string;
  site: string;
  phone: string;
  machine: string;
  issue: string;
  date: string;
  worker: string;
  status: Status;
  resolution: string;
  createdAt: string;
};
type View =
  | "home"
  | "register"
  | "progress"
  | "detail"
  | "photos"
  | "estimate"
  | "transaction"
  | "mail";
const badge: Record<Status, string> = {
  접수: "bg-slate-100 text-slate-700",
  방문예정: "bg-blue-50 text-blue-700",
  부품대기: "bg-amber-50 text-amber-700",
  재방문: "bg-violet-50 text-violet-700",
  처리완료: "bg-emerald-50 text-emerald-700",
};
const toJob = (r: JobRow): Job => {
  const d = new Date(r.created_at);
  const y = String(d.getFullYear()).slice(-2),
    m = String(d.getMonth() + 1).padStart(2, "0"),
    day = String(d.getDate()).padStart(2, "0");
  return {
    dbId: r.id,
    id: `AS-${y}${m}${day}-${String(r.id).padStart(3, "0")}`,
    company: r.company,
    site: r.site,
    phone: r.contact_phone,
    machine: r.machine,
    issue: r.issue,
    date: r.visit_note,
    worker: r.worker,
    status: r.status,
    resolution: r.resolution,
    createdAt: r.created_at,
  };
};

export default function Page() {
  const [user, setUser] = useState<User | null>(null),
    [authReady, setAuthReady] = useState(false),
    [profile, setProfile] = useState<Profile | null>(null),
    [dataReady, setDataReady] = useState(false),
    [initError, setInitError] = useState("");
  const [view, setView] = useState<View>("home"),
    [jobs, setJobs] = useState<Job[]>([]),
    [selected, setSelected] = useState<Job | null>(null),
    [query, setQuery] = useState(""),
    [toast, setToast] = useState(""),
    [loadError, setLoadError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setInitError("로그인 확인이 지연되고 있습니다");
      setAuthReady(true);
      setDataReady(true);
    }, 10000);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      clearTimeout(timer);
      setInitError("");
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);
  const loadJobs = useCallback(async () => {
    const { data, error } = await supabase
      .from("as_jobs")
      .select(
        "id,company,site,contact_phone,machine,issue,visit_note,worker,status,resolution,created_at",
      )
      .order("created_at", { ascending: false });
    if (error) {
      setLoadError("A/S 목록을 불러오지 못했습니다");
      return;
    }
    setLoadError("");
    setJobs(((data ?? []) as JobRow[]).map(toJob));
  }, []);
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setDataReady(true);
      return;
    }
    let cancelled = false;
    setDataReady(false);
    const timer = setTimeout(() => {
      if (!cancelled) {
        setInitError("서버 연결이 지연되고 있습니다");
        setDataReady(true);
      }
    }, 10000);
    supabase
      .from("staff_profiles")
      .select("employee_id,display_name,role,active")
      .eq("id", user.id)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (cancelled) return;
        clearTimeout(timer);
        if (error || !data) {
          setInitError("직원 정보를 불러오지 못했습니다");
          setProfile(null);
          setDataReady(true);
          return;
        }
        const p = data as Profile;
        setInitError("");
        setProfile(p);
        if (p.active) await loadJobs();
        setDataReady(true);
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user, loadJobs]);
  useEffect(() => {
    if (!user || !profile?.active) return;
    const channel = supabase
      .channel("as-jobs-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "as_jobs" },
        () => {
          void loadJobs();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, profile?.active, loadJobs]);
  useEffect(() => {
    const officeMenu = (event: MouseEvent) => {
      const button = (event.target as HTMLElement).closest("button");
      const label = button?.textContent?.trim();
      if (label === "견적서") setView("estimate");
      if (label === "거래명세") setView("transaction");
      if (label === "메일 보내기") setView("mail");
    };
    document.addEventListener("click", officeMenu);
    return () => document.removeEventListener("click", officeMenu);
  }, []);
  const filtered = useMemo(
    () => jobs.filter((j) => Object.values(j).join(" ").includes(query)),
    [jobs, query],
  );
  const say = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 2200);
  };
  const open = (j: Job) => {
    setSelected(j);
    setView("detail");
  };
  const add = async (f: FormData) => {
    if (!user) return;
    const company = String(f.get("company") || "").trim(),
      issue = String(f.get("issue") || "").trim();
    if (!company || !issue) {
      say("고객사와 증상을 입력해주세요");
      return;
    }
    const payload = {
      company,
      issue,
      site: String(f.get("site") || "").trim(),
      contact_phone: String(f.get("phone") || "").trim(),
      machine: String(f.get("machine") || "").trim(),
      visit_note: String(f.get("date") || "").trim(),
      worker: String(f.get("worker") || "").trim(),
      status: "접수" as Status,
      created_by: user.id,
      updated_by: user.id,
    };
    const { data, error } = await supabase
      .from("as_jobs")
      .insert(payload)
      .select(
        "id,company,site,contact_phone,machine,issue,visit_note,worker,status,resolution,created_at",
      )
      .single();
    if (error) {
      say("저장하지 못했습니다. 다시 시도해주세요");
      return;
    }
    const j = toJob(data as JobRow);
    setJobs((x) => [j, ...x]);
    setSelected(j);
    setView("progress");
    say("A/S 접수가 등록됐습니다");
  };
  const updateStatus = async (s: Status) => {
    if (!user || !selected) return;
    const { data, error } = await supabase
      .from("as_jobs")
      .update({ status: s, updated_by: user.id })
      .eq("id", selected.dbId)
      .select(
        "id,company,site,contact_phone,machine,issue,visit_note,worker,status,resolution,created_at",
      )
      .single();
    if (error) {
      say("상태를 변경하지 못했습니다");
      return;
    }
    const next = toJob(data as JobRow);
    setSelected(next);
    setJobs((x) => x.map((j) => (j.dbId === next.dbId ? next : j)));
    say(`${s}(으)로 변경됐습니다`);
  };
  const saveResolution = async (value: string) => {
    if (!user || !selected) return;
    const { data, error } = await supabase
      .from("as_jobs")
      .update({ resolution: value, updated_by: user.id })
      .eq("id", selected.dbId)
      .select(
        "id,company,site,contact_phone,machine,issue,visit_note,worker,status,resolution,created_at",
      )
      .single();
    if (error) {
      say("처리 내역을 저장하지 못했습니다");
      return;
    }
    const next = toJob(data as JobRow);
    setSelected(next);
    setJobs((x) => x.map((j) => (j.dbId === next.dbId ? next : j)));
    say("처리 내역이 저장됐습니다");
  };
  if (!authReady || !dataReady) return <AuthLoading />;
  if (initError) return <ConnectionError message={initError} />;
  if (!user) return <Login />;
  if (!profile?.active)
    return <PendingAccount id={user.email?.split("@")[0] ?? "직원"} />;
  const staffName = profile.display_name || profile.employee_id;
  return (
    <main className="min-h-screen bg-[#eaf0f6] text-slate-900">
      <div className="mx-auto min-h-screen max-w-md bg-[#f8fafc] shadow-2xl">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-slate-100 bg-white/95 px-5 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#df3548] font-black text-white">
              H
            </div>
            <div>
              <h1 className="text-lg font-black">
                {
                  {
                    home: "하진 A/S",
                    register: "A/S 접수 등록",
                    progress: "진행 상황",
                    photos: "작업 사진",
                    detail: "A/S 상세",
                    estimate: "견적서",
                    transaction: "거래명세서",
                    mail: "메일 보내기",
                  }[view]
                }
              </h1>
              <p className="text-xs text-slate-500">{staffName}님 로그인</p>
            </div>
          </div>
          <div className="flex">
            <button
              aria-label="알림"
              className="relative grid size-10 place-items-center"
            >
              <Bell size={20} />
              <i className="absolute right-2 top-2 size-2 rounded-full bg-red-500" />
            </button>
            <button
              aria-label="로그아웃"
              onClick={() => supabase.auth.signOut()}
              className="grid size-10 place-items-center text-slate-500"
            >
              <LogOut size={19} />
            </button>
          </div>
        </header>
        <div className="px-5 pb-28">
          {loadError && (
            <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
              {loadError}
            </p>
          )}
          {view === "home" && (
            <Dashboard jobs={jobs} setView={setView} open={open} />
          )}{" "}
          {view === "register" && <Register add={add} />}{" "}
          {view === "progress" && (
            <Progress
              jobs={filtered}
              query={query}
              setQuery={setQuery}
              open={open}
            />
          )}{" "}
          {view === "detail" && selected && (
            <Detail
              job={selected}
              update={updateStatus}
              save={saveResolution}
            />
          )}{" "}
          {view === "photos" && <Photos say={say} />}{" "}
          {view === "estimate" && (
            <DocumentForm type="estimate" userId={user.id} say={say} />
          )}{" "}
          {view === "transaction" && (
            <DocumentForm type="transaction" userId={user.id} say={say} />
          )}{" "}
          {view === "mail" && <MailForm say={say} />}
        </div>
        <Nav view={view} setView={setView} />
      </div>
      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-xl">
          {toast}
        </div>
      )}
    </main>
  );
}

function AuthLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#eaf0f6]">
      <div className="text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#1855a6] text-2xl font-black text-white shadow-lg">
          H
        </div>
        <p className="mt-4 text-sm font-bold text-slate-500">데이터 확인 중</p>
      </div>
    </main>
  );
}
function ConnectionError({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#eaf0f6] p-5">
      <section className="w-full max-w-sm rounded-[28px] bg-white p-7 text-center shadow-xl">
        <h1 className="text-xl font-black">연결을 확인해주세요</h1>
        <p className="mt-2 text-sm text-slate-500">{message}</p>
        <button
          onClick={() => location.reload()}
          className="mt-6 w-full rounded-xl bg-[#1855a6] py-3 text-sm font-bold text-white"
        >
          다시 연결
        </button>
      </section>
    </main>
  );
}
function PendingAccount({ id }: { id: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#eaf0f6] p-5">
      <section className="w-full max-w-sm rounded-[28px] bg-white p-7 text-center shadow-xl">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-amber-50 text-amber-600">
          <LockKeyhole />
        </div>
        <h1 className="mt-5 text-xl font-black">계정 승인 대기 중</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {id} 계정은 관리자가 활성화하면 사용할 수 있습니다.
        </p>
        <button
          onClick={() => supabase.auth.signOut()}
          className="mt-6 w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white"
        >
          로그아웃
        </button>
      </section>
    </main>
  );
}
function Login() {
  const [id, setId] = useState(""),
    [password, setPassword] = useState(""),
    [show, setShow] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = id.trim().toLowerCase();
    if (!clean || !password) {
      setError("아이디와 비밀번호를 입력해주세요");
      return;
    }
    if (!/^[a-z0-9._-]+$/.test(clean)) {
      setError("아이디는 영문, 숫자, 점, 밑줄만 사용할 수 있습니다");
      return;
    }
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({
      email: `${clean}@hajin.internal`,
      password,
    });
    if (error) setError("아이디 또는 비밀번호가 맞지 않습니다");
    setLoading(false);
  };
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#10376f] to-[#2471c8] px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-md">
        <section className="pt-[8vh] text-center text-white">
          <div className="mx-auto grid size-20 place-items-center rounded-[24px] bg-white/15 text-3xl font-black ring-1 ring-white/25">
            H
          </div>
          <h1 className="mt-6 text-3xl font-black">하진 통합시스템</h1>
          <p className="mt-2 text-sm text-blue-100">
            회사에서 발급받은 계정으로 로그인하세요
          </p>
        </section>
        <form
          onSubmit={submit}
          className="mt-10 space-y-5 rounded-[30px] bg-white p-6 shadow-2xl shadow-blue-950/25"
        >
          <label className="block text-sm font-black">
            아이디
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              autoCapitalize="none"
              autoComplete="username"
              placeholder="직원 아이디"
              className="input mt-2"
            />
          </label>
          <label className="block text-sm font-black">
            비밀번호
            <div className="relative">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={show ? "text" : "password"}
                autoComplete="current-password"
                placeholder="비밀번호"
                className="input mt-2 pr-12"
              />
              <button
                type="button"
                aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}
                onClick={() => setShow(!show)}
                className="absolute right-1 top-3 grid size-11 place-items-center text-slate-400"
              >
                {show ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
          </label>
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700"
            >
              {error}
            </p>
          )}
          <button
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1855a6] py-4 font-black text-white shadow-lg disabled:opacity-60"
          >
            <LockKeyhole size={18} />
            {loading ? "로그인 중..." : "로그인"}
          </button>
          <p className="text-center text-xs text-slate-400">
            계정 발급과 비밀번호 변경은 관리자에게 문의하세요
          </p>
        </form>
      </div>
    </main>
  );
}

function Dashboard({
  jobs,
  setView,
  open,
}: {
  jobs: Job[];
  setView: (v: View) => void;
  open: (j: Job) => void;
}) {
  const nums = [
    [
      "오늘 방문",
      jobs.filter((j) => j.date.includes("오늘")).length,
      CalendarDays,
      "bg-blue-50 text-blue-700",
    ],
    [
      "미처리",
      jobs.filter((j) => j.status !== "처리완료").length,
      ToolCase,
      "bg-rose-50 text-rose-700",
    ],
    [
      "부품 대기",
      jobs.filter((j) => j.status === "부품대기").length,
      Package,
      "bg-amber-50 text-amber-700",
    ],
  ] as const;
  return (
    <>
      <section className="mt-5 rounded-[28px] bg-gradient-to-br from-[#173f82] to-[#2774d7] p-5 text-white shadow-lg shadow-blue-900/15">
        <div className="flex justify-between">
          <div>
            <p className="text-sm text-blue-100">오늘의 A/S 업무</p>
            <p className="mt-1 text-2xl font-black">
              확인할 작업이 {jobs.filter((j) => j.status !== "처리완료").length}
              건 있어요
            </p>
          </div>
          <div className="grid size-11 place-items-center rounded-2xl bg-white/15">
            <Wrench size={23} />
          </div>
        </div>
        <button
          onClick={() => setView("progress")}
          className="mt-5 flex w-full justify-between rounded-2xl bg-white/15 px-4 py-3 text-sm font-bold"
        >
          전체 진행 상황 보기 <ChevronRight size={18} />
        </button>
      </section>
      <section className="mt-4 grid grid-cols-3 gap-3">
        {nums.map(([label, n, Icon, style]) => (
          <button
            key={label}
            onClick={() => setView("progress")}
            className="rounded-2xl bg-white p-3 text-left shadow-sm"
          >
            <div
              className={`grid size-9 place-items-center rounded-xl ${style}`}
            >
              <Icon size={18} />
            </div>
            <p className="mt-3 text-2xl font-black">
              {n}
              <span className="text-sm">건</span>
            </p>
            <p className="text-xs text-slate-500">{label}</p>
          </button>
        ))}
      </section>
      <Title text="빠른 업무" extra="자주 쓰는 메뉴" />
      <section className="grid grid-cols-2 gap-3">
        <Quick
          t="A/S 접수 등록"
          d="신규 요청 입력"
          c="bg-[#ff7a3d]"
          I={Plus}
          go={() => setView("register")}
        />
        <Quick
          t="진행 상황"
          d="접수부터 완료까지"
          c="bg-[#2563c4]"
          I={ClipboardList}
          go={() => setView("progress")}
        />
        <Quick
          t="처리 내역"
          d="작업 결과 기록"
          c="bg-[#10a37f]"
          I={CheckCircle2}
          go={() => (jobs[0] ? open(jobs[0]) : setView("progress"))}
        />
        <Quick
          t="작업 사진"
          d="전·후 사진 등록"
          c="bg-[#7052d6]"
          I={Camera}
          go={() => setView("photos")}
        />
      </section>
      <Title text="오늘 방문 예정" extra="전체보기" />
      <div className="space-y-3">
        {jobs
          .filter((j) => j.date.includes("오늘"))
          .map((j) => (
            <Card key={j.id} j={j} open={() => open(j)} />
          ))}
        {!jobs.some((j) => j.date.includes("오늘")) && (
          <Empty text="오늘 방문 일정이 없습니다" />
        )}
      </div>
      <Title text="사무 업무" />
      <div className="flex gap-3 overflow-x-auto pb-2">
        {[
          [FileText, "견적서"],
          [ClipboardList, "거래명세"],
          [Mail, "메일 보내기"],
          [Settings, "ERP"],
        ].map(([I, t]: any) => (
          <button
            key={t}
            className="min-w-24 rounded-2xl bg-white p-4 text-center shadow-sm"
          >
            <I className="mx-auto" size={21} />
            <b className="mt-2 block whitespace-nowrap text-xs">{t}</b>
          </button>
        ))}
      </div>
    </>
  );
}
function Title({ text, extra }: { text: string; extra?: string }) {
  return (
    <div className="mb-3 mt-7 flex items-center justify-between">
      <h2 className="text-lg font-black">{text}</h2>
      {extra && (
        <span className="text-xs font-bold text-slate-400">{extra}</span>
      )}
    </div>
  );
}
function Quick({
  t,
  d,
  c,
  I,
  go,
}: {
  t: string;
  d: string;
  c: string;
  I: any;
  go: () => void;
}) {
  return (
    <button
      onClick={go}
      className="flex items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm"
    >
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-2xl text-white ${c}`}
      >
        <I size={21} />
      </span>
      <span>
        <b className="block text-sm">{t}</b>
        <small className="text-xs text-slate-500">{d}</small>
      </span>
    </button>
  );
}
function Card({ j, open }: { j: Job; open: () => void }) {
  return (
    <button
      onClick={open}
      className="w-full rounded-2xl bg-white p-4 text-left shadow-sm"
    >
      <div className="flex justify-between gap-3">
        <div>
          <b>{j.company}</b>
          <p className="mt-1 text-xs text-slate-500">
            {j.machine || "장비 미정"} · {j.issue}
          </p>
        </div>
        <span
          className={`h-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${badge[j.status]}`}
        >
          {j.status}
        </span>
      </div>
      <div className="mt-3 flex gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span>◷ {j.date || "일정 미정"}</span>
        <span>◉ {j.worker || "미배정"}</span>
      </div>
    </button>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl bg-white px-5 py-8 text-center text-sm font-bold text-slate-400 shadow-sm">
      {text}
    </div>
  );
}
function Register({ add }: { add: (f: FormData) => Promise<void> }) {
  return (
    <form action={add} className="mt-5 space-y-4">
      <Box t="고객 정보">
        <Field n="company" l="고객사 *" p="예: 한강센트럴자이" />
        <Field n="site" l="현장 위치" p="예: 커뮤니티센터 2층" />
        <Field n="phone" l="연락처" p="010-0000-0000" />
      </Box>
      <Box t="장비 및 증상">
        <Field n="machine" l="장비명 / 모델" p="예: DRAX 런닝머신" />
        <label className="block text-sm font-bold">
          고장 증상 *
          <textarea
            name="issue"
            rows={4}
            placeholder="증상을 자세히 적어주세요"
            className="input resize-none"
          />
        </label>
      </Box>
      <Box t="방문 일정">
        <Field n="date" l="방문 예정" p="예: 9월 4일 14:00" />
        <Field n="worker" l="담당 기사" p="예: 우제일" />
      </Box>
      <button className="w-full rounded-2xl bg-[#1855a6] py-4 font-black text-white shadow-lg">
        A/S 접수 등록
      </button>
    </form>
  );
}
function Box({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="font-black">{t}</h2>
      {children}
    </section>
  );
}
function Field({ n, l, p }: { n: string; l: string; p: string }) {
  return (
    <label className="block text-sm font-bold">
      {l}
      <input name={n} placeholder={p} className="input" />
    </label>
  );
}
function Progress({
  jobs,
  query,
  setQuery,
  open,
}: {
  jobs: Job[];
  query: string;
  setQuery: (s: string) => void;
  open: (j: Job) => void;
}) {
  const [filter, setFilter] = useState<"전체" | Status>("전체");
  const visible =
    filter === "전체" ? jobs : jobs.filter((j) => j.status === filter);
  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 rounded-2xl bg-white px-4 shadow-sm">
        <Search size={19} className="text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="고객사, 장비, 증상 검색"
          className="w-full py-4 outline-none"
        />
      </div>
      <div className="my-4 flex gap-2 overflow-x-auto">
        {(
          [
            "전체",
            "접수",
            "방문예정",
            "부품대기",
            "재방문",
            "처리완료",
          ] as const
        ).map((x) => (
          <button
            key={x}
            onClick={() => setFilter(x)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${filter === x ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
          >
            {x}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {visible.map((j) => (
          <Card key={j.id} j={j} open={() => open(j)} />
        ))}
        {visible.length === 0 && <Empty text="표시할 A/S 접수가 없습니다" />}
      </div>
    </div>
  );
}
function Detail({
  job,
  update,
  save,
}: {
  job: Job;
  update: (s: Status) => Promise<void>;
  save: (v: string) => Promise<void>;
}) {
  const [value, setValue] = useState(job.resolution);
  useEffect(() => setValue(job.resolution), [job.dbId, job.resolution]);
  return (
    <div className="mt-5 space-y-4">
      <section className="rounded-3xl bg-[#1855a6] p-5 text-white">
        <div className="flex justify-between text-xs">
          <span>{job.id}</span>
          <b>{job.status}</b>
        </div>
        <h2 className="mt-3 text-xl font-black">{job.company}</h2>
        <p className="text-sm text-blue-100">{job.site || "현장 미정"}</p>
      </section>
      <Box t="접수 내용">
        <Info I={Wrench} l="장비" v={job.machine || "장비 미정"} />
        <Info I={ToolCase} l="증상" v={job.issue} />
        <Info I={CalendarDays} l="방문 예정" v={job.date || "일정 미정"} />
        <Info I={UserRound} l="담당 기사" v={job.worker || "미배정"} />
      </Box>
      <Box t="진행 상태 변경">
        <div className="grid grid-cols-2 gap-2">
          {(["방문예정", "부품대기", "재방문", "처리완료"] as Status[]).map(
            (s) => (
              <button
                key={s}
                onClick={() => void update(s)}
                className={`rounded-xl border py-3 text-sm font-bold ${job.status === s ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200"}`}
              >
                {s}
              </button>
            ),
          )}
        </div>
      </Box>
      <Box t="처리 내역">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={5}
          placeholder="고장 원인, 조치 내용, 교체 부품을 입력하세요"
          className="input resize-none"
        />
        <button
          onClick={() => void save(value)}
          className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white"
        >
          처리 내역 저장
        </button>
      </Box>
    </div>
  );
}
function Info({ I, l, v }: { I: any; l: string; v: string }) {
  return (
    <div className="flex gap-3 border-b border-slate-100 py-2 last:border-0">
      <span className="grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-500">
        <I size={17} />
      </span>
      <div>
        <p className="text-xs text-slate-400">{l}</p>
        <b className="text-sm">{v}</b>
      </div>
    </div>
  );
}
function Photos({ say }: { say: (s: string) => void }) {
  return (
    <div className="mt-5">
      <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <Camera className="mx-auto text-violet-600" size={34} />
        <h2 className="mt-4 font-black">작업 사진 등록</h2>
        <p className="mt-1 text-sm text-slate-500">
          수리 전·고장 부위·수리 후 사진을 남겨주세요
        </p>
      </section>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {["수리 전", "고장 부위", "작업 중", "수리 후"].map((x) => (
          <button
            key={x}
            onClick={() => say(`${x} 사진 저장은 다음 단계에서 연결합니다`)}
            className="aspect-square rounded-3xl bg-white text-sm font-bold text-slate-500 shadow-sm"
          >
            <Plus className="mx-auto mb-2" />
            {x}
          </button>
        ))}
      </div>
    </div>
  );
}
function DocumentForm({type,userId,say}:{type:"estimate"|"transaction";userId:string;say:(s:string)=>void}) {
  const [saved,setSaved]=useState(false);
  const label=type==="estimate"?"견적서":"거래명세서";
  const save=async(form:FormData)=>{
    const company=String(form.get("company")||"").trim(),itemName=String(form.get("item_name")||"").trim();
    if(!company||!itemName){say("거래처와 품목을 입력해주세요");return}
    const{error}=await supabase.from("business_documents").insert({document_type:type,company,recipient_email:String(form.get("email")||"").trim(),item_name:itemName,model_name:String(form.get("model_name")||"").trim(),quantity:Number(form.get("quantity")||1),unit_price:Number(form.get("unit_price")||0),memo:String(form.get("memo")||"").trim(),created_by:userId});
    if(error){say(`${label}를 저장하지 못했습니다`);return}
    setSaved(true);say(`${label}가 저장됐습니다`);
  };
  return <form action={save} className="mt-5 space-y-4"><Box t={`${label} 작성`}><Field n="company" l="거래처 *" p="예: 한강센트럴자이"/><Field n="email" l="받는 사람 이메일" p="example@company.com"/><Field n="item_name" l="품목 *" p="예: 런닝머신 벨트"/><Field n="model_name" l="모델명" p="예: DRAX DX-3000"/><Field n="quantity" l="수량" p="1"/><Field n="unit_price" l="단가" p="0"/><label className="block text-sm font-bold">비고<textarea name="memo" rows={3} className="input resize-none" placeholder="추가 내용을 입력하세요"/></label></Box><button className="w-full rounded-2xl bg-[#1855a6] py-4 font-black text-white shadow-lg">{label} 저장</button>{saved&&<button type="button" onClick={()=>window.print()} className="w-full rounded-2xl border border-slate-300 bg-white py-4 font-black">인쇄·PDF 저장</button>}</form>;
}
function MailForm({say}:{say:(s:string)=>void}) {
  const send=async(form:FormData)=>{
    const to=String(form.get("to")||"").trim(),subject=String(form.get("subject")||"").trim(),body=String(form.get("body")||"").trim();
    if(!to){say("받는 사람 이메일을 입력해주세요");return}
    if(navigator.share){try{await navigator.share({title:subject||"하진 업무메일",text:`${subject}\n\n${body}`});return}catch{}}
    location.href=`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  return <form action={send} className="mt-5 space-y-4"><Box t="메일 작성"><Field n="to" l="받는 사람 *" p="example@company.com"/><Field n="subject" l="제목" p="견적서 전달드립니다"/><label className="block text-sm font-bold">내용<textarea name="body" rows={8} className="input resize-none" placeholder="메일 내용을 입력하세요"/></label></Box><button className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1855a6] py-4 font-black text-white shadow-lg"><Mail size={18}/> 메일 앱 열기</button></form>;
}
function Nav({ view, setView }: { view: View; setView: (v: View) => void }) {
  return (
    <nav className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-md -translate-x-1/2 justify-around border-t bg-white px-2 pb-3 pt-2">
      {[
        [Home, "홈", "home"],
        [Plus, "접수 등록", "register"],
        [ClipboardList, "진행 상황", "progress"],
        [Camera, "작업 사진", "photos"],
      ].map(([I, t, v]: any) => (
        <button
          key={t}
          onClick={() => setView(v)}
          className={`flex min-w-18 flex-col items-center gap-1 py-2 text-[11px] font-bold ${view === v ? "text-blue-700" : "text-slate-400"}`}
        >
          <I size={21} />
          {t}
        </button>
      ))}
    </nav>
  );
}
