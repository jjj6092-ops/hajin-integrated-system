"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
type User = { email?: string };
import {
  Bell,
  CalendarDays,
  Camera,
  ChevronRight,
  ClipboardPenLine,
  CircleDollarSign,
  Eye,
  EyeOff,
  FileCog,
  FileSignature,
  FileText,
  History,
  Home,
  LockKeyhole,
  LogOut,
  Mail,
  PackageSearch,
  Plus,
  ReceiptText,
  Search,
  ToolCase,
  UserRound,
  Warehouse,
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
type BusinessDocument = {
  id: number | string;
  document_type: "estimate" | "transaction" | "proposal";
  company: string;
  recipient_email: string;
  item_name: string;
  model_name: string;
  quantity: number;
  unit_price: number;
  memo: string;
  created_at: string;
};
type View =
  | "home"
  | "calendar"
  | "register"
  | "progress"
  | "detail"
  | "photos"
  | "estimate"
  | "estimateList"
  | "proposal"
  | "proposalList"
  | "transaction"
  | "mail"
  | "notifications";
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

const koreaDateKey = (date = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const scheduleOf = (note: string) => {
  const value = note.trim();
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T]\s*(\d{1,2}:\d{2}))?/);
  if (iso) return { dateKey: `${iso[1]}-${iso[2]}-${iso[3]}`, time: iso[4] || "시간 미정" };
  const dotted = value.match(/^(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})[.]?(?:\s*(\d{1,2}:\d{2}))?/);
  if (dotted) return { dateKey: `${dotted[1]}-${dotted[2].padStart(2,"0")}-${dotted[3].padStart(2,"0")}`, time: dotted[4] || "시간 미정" };
  const monthDay = value.match(/^(\d{1,2})월\s*(\d{1,2})일(?:\s*(\d{1,2}:\d{2}))?/);
  if (monthDay) {
    const year = koreaDateKey().slice(0, 4);
    return { dateKey: `${year}-${monthDay[1].padStart(2,"0")}-${monthDay[2].padStart(2,"0")}`, time: monthDay[3] || "시간 미정" };
  }
  if (value.includes("오늘")) {
    const time = value.match(/(\d{1,2}:\d{2})/)?.[1] || "시간 미정";
    return { dateKey: koreaDateKey(), time };
  }
  return { dateKey: "", time: value || "시간 미정" };
};
const displayTime=(time:string)=>{
  const match=time.match(/^(\d{1,2}):(\d{2})$/);
  if(!match) return time;
  const hour=Number(match[1]);
  const minute=Number(match[2]);
  return minute===0?`${hour}시`:`${hour}시${minute}분`;
};
const timeOrder=(time:string)=>{
  const match=time.match(/^(\d{1,2}):(\d{2})$/);
  return match?Number(match[1])*60+Number(match[2]):Number.MAX_SAFE_INTEGER;
};

const holidayCache=new Map<number,Record<string,string>>();
const dateKeyOf=(date:Date)=>date.toISOString().slice(0,10);
const dateFromKey=(key:string)=>new Date(`${key}T12:00:00Z`);
const addDate=(key:string,days:number)=>{
  const date=dateFromKey(key);
  date.setUTCDate(date.getUTCDate()+days);
  return dateKeyOf(date);
};
const holidaysOf=(year:number)=>{
  const cached=holidayCache.get(year);
  if(cached) return cached;
  const result:Record<string,string>={};
  const add=(key:string,name:string)=>{result[key]=result[key]?`${result[key]} · ${name}`:name;};
  const fixed:Array<[string,string,boolean]>=[
    [`${year}-01-01`,"신정",false],
    [`${year}-03-01`,"삼일절",true],
    [`${year}-05-05`,"어린이날",true],
    [`${year}-06-06`,"현충일",false],
    [`${year}-08-15`,"광복절",true],
    [`${year}-10-03`,"개천절",true],
    [`${year}-10-09`,"한글날",true],
    [`${year}-12-25`,"성탄절",true],
  ];
  fixed.forEach(([key,name])=>add(key,name));
  const lunar=new Intl.DateTimeFormat("en-US-u-ca-chinese",{timeZone:"Asia/Seoul",month:"numeric",day:"numeric"});
  const lunarDates:Record<string,string>={};
  for(let cursor=new Date(Date.UTC(year,0,1,12));cursor.getUTCFullYear()===year;cursor.setUTCDate(cursor.getUTCDate()+1)){
    const parts=lunar.formatToParts(cursor);
    const lunarMonth=parts.find(part=>part.type==="month")?.value;
    const lunarDay=parts.find(part=>part.type==="day")?.value;
    if(lunarMonth&&lunarDay) lunarDates[`${lunarMonth}/${lunarDay}`]=dateKeyOf(cursor);
  }
  const seollal=lunarDates["1/1"];
  const buddha=lunarDates["4/8"];
  const chuseok=lunarDates["8/15"];
  const lunarBreaks:Array<{dates:string[];substituteOnSaturday:boolean}>=[];
  if(seollal){
    const dates=[addDate(seollal,-1),seollal,addDate(seollal,1)];
    dates.forEach((key,index)=>add(key,index===1?"설날":"설날 연휴"));
    lunarBreaks.push({dates,substituteOnSaturday:false});
  }
  if(buddha){add(buddha,"부처님오신날");lunarBreaks.push({dates:[buddha],substituteOnSaturday:true});}
  if(chuseok){
    const dates=[addDate(chuseok,-1),chuseok,addDate(chuseok,1)];
    dates.forEach((key,index)=>add(key,index===1?"추석":"추석 연휴"));
    lunarBreaks.push({dates,substituteOnSaturday:false});
  }
  const addSubstitute=(afterKey:string)=>{
    let next=addDate(afterKey,1);
    while(result[next]||[0,6].includes(dateFromKey(next).getUTCDay())) next=addDate(next,1);
    add(next,"대체공휴일");
  };
  fixed.filter(([, ,substitute])=>substitute).forEach(([key])=>{
    if([0,6].includes(dateFromKey(key).getUTCDay())) addSubstitute(key);
  });
  lunarBreaks.forEach(({dates,substituteOnSaturday})=>{
    const needsSubstitute=dates.some(key=>{
      const day=dateFromKey(key).getUTCDay();
      return day===0||(substituteOnSaturday&&day===6);
    });
    if(needsSubstitute) addSubstitute(dates[dates.length-1]);
  });
  if(year===2026){
    Object.assign(result,{
      "2026-01-01":"신정","2026-02-16":"설날 연휴","2026-02-17":"설날","2026-02-18":"설날 연휴",
      "2026-03-01":"삼일절","2026-03-02":"대체공휴일","2026-05-05":"어린이날","2026-05-24":"부처님오신날",
      "2026-05-25":"대체공휴일","2026-06-03":"지방선거일","2026-06-06":"현충일","2026-08-15":"광복절",
      "2026-08-17":"대체공휴일","2026-09-24":"추석 연휴","2026-09-25":"추석","2026-09-26":"추석 연휴",
      "2026-10-03":"개천절","2026-10-05":"대체공휴일","2026-10-09":"한글날","2026-12-25":"성탄절",
    });
  }
  holidayCache.set(year,result);
  return result;
};
const holidayOf=(dateKey:string)=>holidaysOf(Number(dateKey.slice(0,4)))[dateKey]||"";
const notificationJobsOf = (jobs: Job[]) => {
  const today = koreaDateKey();
  return jobs
    .filter((job) => {
      if (job.status === "처리완료") return false;
      const schedule = scheduleOf(job.date);
      return (
        (schedule.dateKey && schedule.dateKey <= today) ||
        ["접수", "부품대기", "재방문"].includes(job.status)
      );
    })
    .sort((a, b) => {
      const aDate = scheduleOf(a.date).dateKey || "9999-12-31";
      const bDate = scheduleOf(b.date).dateKey || "9999-12-31";
      return aDate.localeCompare(bDate);
    });
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
  const viewRef = useRef<View>("home");
  const navigate = useCallback((nextView: View) => {
    if (viewRef.current === nextView) return;
    window.history.pushState(
      { ...window.history.state, hajinView: nextView },
      "",
    );
    viewRef.current = nextView;
    setView(nextView);
  }, []);
  useEffect(() => {
    window.history.replaceState(
      { ...window.history.state, hajinView: "home" },
      "",
    );
    const handleBack = (event: PopStateEvent) => {
      const nextView = event.state?.hajinView as View | undefined;
      const validViews: View[] = [
        "home", "calendar", "register", "progress", "detail", "photos",
        "estimate", "estimateList", "proposal", "proposalList",
        "transaction", "mail", "notifications",
      ];
      const target = nextView && validViews.includes(nextView) ? nextView : "home";
      viewRef.current = target;
      setView(target);
    };
    window.addEventListener("popstate", handleBack);
    return () => window.removeEventListener("popstate", handleBack);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      setInitError("로그인 확인이 지연되고 있습니다");
      setAuthReady(true);
      setDataReady(true);
    }, 10000);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      clearTimeout(timer);
      setInitError("");
      if (
        event === "INITIAL_SESSION" &&
        session &&
        localStorage.getItem("hajin-auto-login") !== "true" &&
        sessionStorage.getItem("hajin-session-active") !== "true"
      ) {
        void supabase.auth.signOut();
        setUser(null);
        setAuthReady(true);
        return;
      }
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
      if (label === "견적서") navigate("estimate");
      if (label === "거래명세") navigate("transaction");
      if (label === "메일 보내기") navigate("mail");
    };
    document.addEventListener("click", officeMenu);
    return () => document.removeEventListener("click", officeMenu);
  }, [navigate]);
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
    navigate("detail");
  };
  const add = async (f: FormData) => {
    if (!user) return;
    const company = String(f.get("company") || "").trim(),
      issue = String(f.get("issue") || "").trim();
    const intakePhotos = f
      .getAll("intake_photos")
      .filter((value): value is File => value instanceof File && value.size > 0);
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
      visit_note: [
        String(f.get("date") || "").trim(),
        String(f.get("time") || "").trim(),
      ].filter(Boolean).join(" "),
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
    let uploadedPhotos = 0;
    for (const [index, file] of intakePhotos.entries()) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${j.dbId}/접수사진/${Date.now()}-${index}-${safeName}`;
      const { error: photoError } = await supabase.storage
        .from("as-job-photos")
        .upload(path, file, { upsert: false });
      if (!photoError) uploadedPhotos += 1;
    }
    setJobs((x) => [j, ...x]);
    setSelected(j);
    navigate("progress");
    if (intakePhotos.length === 0) {
      say("A/S 접수가 등록됐습니다");
    } else if (uploadedPhotos === intakePhotos.length) {
      say(`A/S 접수와 접수사진 ${uploadedPhotos}장이 등록됐습니다`);
    } else {
      say(`접수는 완료됐지만 사진은 ${uploadedPhotos}/${intakePhotos.length}장 저장됐습니다`);
    }
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
  const saveSchedule = async (site: string, date: string, time: string) => {
    if (!user || !selected) return;
    const { data, error } = await supabase
      .from("as_jobs")
      .update({ site: site.trim(), visit_note: [date, time].filter(Boolean).join(" "), updated_by: user.id })
      .eq("id", selected.dbId)
      .select("id,company,site,contact_phone,machine,issue,visit_note,worker,status,resolution,created_at")
      .single();
    if (error) { say("일정을 수정하지 못했습니다"); return; }
    const next = toJob(data as JobRow);
    setSelected(next);
    setJobs((current) => current.map((job) => job.dbId === next.dbId ? next : job));
    say("방문 일정과 현장 위치를 수정했습니다");
  };
  const uploadJobPhotos = async (category: string, files: File[]) => {
    if (!user || !selected || !files.length) return;
    for (const [index,file] of files.entries()) {
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
      const path=`${selected.dbId}/${category}/${Date.now()}-${index}-${safeName}`;
      const { error }=await supabase.storage.from("as-job-photos").upload(path,file,{upsert:false});
      if(error){say("사진을 저장하지 못했습니다");return;}
    }
    say(`${category} 사진 ${files.length}장을 첨부했습니다`);
  };
  if (!authReady || !dataReady) return <AuthLoading />;
  if (initError) return <ConnectionError message={initError} />;
  if (!user) return <Login />;
  if (!profile?.active)
    return <PendingAccount id={user.email?.split("@")[0] ?? "직원"} />;
  const staffName = profile.display_name || profile.employee_id;
  const notificationCount = notificationJobsOf(jobs).length;
  return (
    <main className="min-h-screen bg-[#eaf0f6] text-slate-900">
      <div className={`mx-auto min-h-screen bg-[#f8fafc] shadow-2xl ${view === "calendar" ? "max-w-3xl" : "max-w-md"}`}>
        {view !== "calendar" && <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-slate-100 bg-white/95 px-5 backdrop-blur">
          <div className="flex items-center gap-3">
            {view === "home" ? (
              <div className="relative size-11 shrink-0 bg-transparent">
                <img
                  src="/hajin-emblem-silver.jpg"
                  alt="HAJIN"
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <div className="relative size-11 shrink-0 bg-transparent">
                <img
                  src="/hajin-emblem-silver.jpg"
                  alt="HAJIN"
                  className="h-full w-full object-contain"
                />
              </div>
            )}
            <div>
              <h1 className="text-lg font-black">
                {
                  {
                    home: "하진그룹",
                    calendar: "월간 A/S 일정",
                    register: "A/S 접수 등록",
                    progress: "작업 이력",
                    photos: "작업 사진",
                    detail: "A/S 상세",
                    estimate: "견적서",
                    estimateList: "작성한 견적서",
                    proposal: "제안서 작성",
                    proposalList: "작성한 제안서",
                    transaction: "거래명세서",
                    mail: "메일 보내기",
                    notifications: "알림",
                  }[view]
                }
              </h1>
              <p className="text-xs text-slate-500">{staffName}님 로그인</p>
            </div>
          </div>
          <div className="flex">
            <button
              aria-label="알림"
              onClick={() => navigate("notifications")}
              className="relative grid size-10 place-items-center"
            >
              <Bell size={20} />
              {notificationCount > 0 && (
                <span className="absolute right-0 top-0 grid min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-black leading-5 text-white">
                  {notificationCount > 99 ? "99+" : notificationCount}
                </span>
              )}
            </button>
            <button
              aria-label="로그아웃"
              onClick={() => supabase.auth.signOut()}
              className="grid size-10 place-items-center text-slate-500"
            >
              <LogOut size={19} />
            </button>
          </div>
        </header>}
        <div className={view === "calendar" ? "px-3 pb-8 sm:px-6" : "px-5 pb-28"}>
          {loadError && (
            <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
              {loadError}
            </p>
          )}
          {view === "home" && (
            <Dashboard jobs={jobs} setView={navigate} open={open} />
          )}{" "}
          {view === "calendar" && (
            <CalendarScreen jobs={jobs} open={open} close={() => navigate("home")} />
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
              saveSchedule={saveSchedule}
              uploadPhotos={uploadJobPhotos}
            />
          )}{" "}
          {view === "photos" && <Photos say={say} />}{" "}
          {view === "estimate" && (
            <DocumentForm type="estimate" userId={user.id} say={say} openEstimateList={()=>navigate("estimateList")} />
          )}{" "}
          {view === "estimateList" && <EstimateList />}{" "}
          {view === "proposal" && <ProposalForm userId={user.id} say={say} openProposalList={()=>navigate("proposalList")} />}{" "}
          {view === "proposalList" && <ProposalList />}{" "}
          {view === "transaction" && (
            <DocumentForm type="transaction" userId={user.id} say={say} />
          )}{" "}
          {view === "mail" && <MailForm say={say} />}
          {view === "notifications" && (
            <Notifications jobs={jobs} open={open} />
          )}
        </div>
        {view !== "calendar" && <Nav view={view} setView={navigate} />}
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
        <div className="mx-auto size-20 bg-transparent drop-shadow-lg">
          <img
            src="/hajin-emblem-silver.jpg"
            alt="HAJIN"
            className="h-full w-full object-contain"
          />
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
    [saveId, setSaveId] = useState(false),
    [autoLogin, setAutoLogin] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const savedId = localStorage.getItem("hajin-saved-id") || "";
    setId(savedId);
    setSaveId(Boolean(savedId));
    setAutoLogin(localStorage.getItem("hajin-auto-login") === "true");
  }, []);
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
    if (saveId) localStorage.setItem("hajin-saved-id", clean);
    else localStorage.removeItem("hajin-saved-id");
    if (autoLogin) localStorage.setItem("hajin-auto-login", "true");
    else localStorage.removeItem("hajin-auto-login");
    sessionStorage.setItem("hajin-session-active", "true");
    const { error } = await supabase.auth.signInWithPassword({
      email: `${clean}@hajin.internal`,
      password,
    });
    if (error) setError("아이디 또는 비밀번호가 맞지 않습니다");
    setLoading(false);
  };
  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#0b111b] via-[#172a46] to-[#0d4d89] px-5 py-8 text-slate-900">
      <div aria-hidden="true" className="absolute -left-24 -top-20 size-72 rounded-full bg-blue-500/20 blur-3xl"/>
      <div aria-hidden="true" className="absolute -bottom-28 -right-24 size-80 rounded-full bg-cyan-300/15 blur-3xl"/>
      <div className="relative mx-auto max-w-md">
        <section className="pt-[7vh] text-center text-white">
          <div className="mx-auto size-44 bg-transparent drop-shadow-2xl">
            <img src="/hajin-emblem-silver.jpg" alt="HAJIN" className="h-full w-full object-contain"/>
          </div>
          <h1 className="mt-6 text-3xl font-black tracking-tight">하진그룹</h1>
          <p className="mt-2 text-sm font-bold text-blue-100/90">
            회사에서 발급받은 계정으로 로그인하세요
          </p>
        </section>
        <form
          onSubmit={submit}
          className="mt-9 space-y-5 rounded-[30px] border border-white/50 bg-white/95 p-6 shadow-2xl shadow-black/30 backdrop-blur"
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
          <div className="grid grid-cols-2 items-center gap-3">
            <label className="order-1 flex cursor-pointer items-center justify-start gap-2 text-sm font-black text-slate-700">
              <input
                type="checkbox"
                checked={saveId}
                onChange={(event) => setSaveId(event.target.checked)}
                className="size-5 rounded border-slate-300 accent-[#1855a6]"
              />
              아이디 저장
            </label>
            <label className="order-2 flex cursor-pointer items-center justify-end gap-2 text-sm font-black text-slate-700">
              <input
                type="checkbox"
                checked={autoLogin}
                onChange={(event) => setAutoLogin(event.target.checked)}
                className="size-5 rounded border-slate-300 accent-[#1855a6]"
              />
              자동 로그인
            </label>
          </div>
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
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#174b91] to-[#2580d8] py-4 font-black text-white shadow-lg shadow-blue-900/25 disabled:opacity-60"
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

function Notifications({ jobs, open }: { jobs: Job[]; open: (job: Job) => void }) {
  const today = koreaDateKey();
  const items = notificationJobsOf(jobs);
  return (
    <section className="mt-5 space-y-3">
      <div className="rounded-[24px] bg-gradient-to-br from-[#173f82] to-[#2774d7] p-5 text-white shadow-lg shadow-blue-900/15">
        <p className="text-sm font-bold text-blue-100">확인할 알림</p>
        <p className="mt-1 text-3xl font-black">{items.length}건</p>
      </div>
      {items.length === 0 ? (
        <div className="rounded-[24px] bg-white px-5 py-12 text-center shadow-sm">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
            <Bell size={25} />
          </div>
          <p className="mt-4 font-black">새 알림이 없습니다</p>
          <p className="mt-1 text-sm text-slate-500">확인할 일정과 미완료 작업이 생기면 표시됩니다.</p>
        </div>
      ) : (
        items.map((job) => {
          const schedule = scheduleOf(job.date);
          const overdue = Boolean(schedule.dateKey && schedule.dateKey < today);
          const isToday = schedule.dateKey === today;
          const label = overdue ? "기한 지남" : isToday ? "오늘 방문" : job.status;
          const color = overdue
            ? "bg-red-50 text-red-700"
            : isToday
              ? "bg-blue-50 text-blue-700"
              : badge[job.status];
          return (
            <button
              key={job.dbId}
              type="button"
              onClick={() => open(job)}
              className="flex w-full items-center gap-3 rounded-[22px] bg-white p-4 text-left shadow-sm transition active:scale-[0.99]"
            >
              <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${color}`}>
                {isToday ? <CalendarDays size={21} /> : <Bell size={21} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <b className="truncate text-sm">{job.company}</b>
                  <em className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black not-italic ${color}`}>{label}</em>
                </span>
                <span className="mt-1 block truncate text-xs text-slate-500">
                  {[job.site, displayTime(schedule.time), job.worker].filter(Boolean).join(" · ") || "일정 정보 없음"}
                </span>
                <span className="mt-1 block truncate text-xs font-bold text-slate-700">{job.issue}</span>
              </span>
              <ChevronRight className="shrink-0 text-slate-300" size={19} />
            </button>
          );
        })
      )}
    </section>
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
  const todayKey = koreaDateKey();
  const [openOffice,setOpenOffice]=useState<string | null>(null);
  const nums = [
    [
      "오늘 방문",
      jobs.filter((j) => scheduleOf(j.date).dateKey === todayKey).length,
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
      "완료 내역",
      jobs.filter((j) => j.status === "처리완료").length,
      History,
      "bg-emerald-50 text-emerald-700",
    ],
  ] as const;
  const officeFolders: Array<{
    key:string;
    label:string;
    icon:typeof FileText;
    color:string;
    iconColor:string;
    children:Array<{label:string;view?:View}>;
  }> = [
    { key:"estimate", label:"견적서", icon:FileText, color:"bg-blue-50 text-blue-700", iconColor:"bg-blue-600 text-white", children:[{label:"새 견적서 작성",view:"estimate" as View},{label:"작성한 견적서 보기",view:"estimateList" as View}] },
    { key:"transaction", label:"거래명세서", icon:ReceiptText, color:"bg-violet-50 text-violet-700", iconColor:"bg-violet-600 text-white", children:[{label:"거래명세서 작성",view:"transaction" as View},{label:"작성한 거래명세서 보기"}] },
    { key:"proposal", label:"제안서", icon:FileSignature, color:"bg-rose-50 text-rose-700", iconColor:"bg-rose-600 text-white", children:[{label:"새 제안서 작성",view:"proposal" as View},{label:"작성한 제안서 보기",view:"proposalList" as View}] },
    { key:"contract", label:"계약서", icon:FileText, color:"bg-cyan-50 text-cyan-700", iconColor:"bg-cyan-600 text-white", children:[{label:"새 계약서 작성"},{label:"작성한 계약서 보기"}] },
    { key:"spec", label:"사양서", icon:FileCog, color:"bg-amber-50 text-amber-700", iconColor:"bg-amber-500 text-white", children:[{label:"새 사양서 작성"},{label:"작성한 사양서 보기"}] },
    { key:"opinion", label:"소견서", icon:ClipboardPenLine, color:"bg-orange-50 text-orange-700", iconColor:"bg-orange-500 text-white", children:[{label:"새 소견서 작성"},{label:"작성한 소견서 보기"}] },
    { key:"inventory", label:"재고관리", icon:Warehouse, color:"bg-emerald-50 text-emerald-700", iconColor:"bg-emerald-600 text-white", children:[{label:"재고 수량 확보 및 발주"},{label:"렉스코"},{label:"디랙스"}] },
    { key:"sales", label:"매출매입관리", icon:CircleDollarSign, color:"bg-indigo-50 text-indigo-700", iconColor:"bg-indigo-600 text-white", children:[{label:"매출 관리"},{label:"매입 관리"},{label:"입금·미수 확인"}] },
  ];
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
          전체 작업 이력 보기 <ChevronRight size={18} />
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
      <MonthlyCalendar jobs={jobs} open={open} expand={() => setView("calendar")} />
      <Title text="사무 업무" />
      <div className="space-y-3 pb-2">
        {[0,2,4,6].map(start=>{
          const row=officeFolders.filter(folder=>folder.key!=="contract").slice(start,start+2);
          const opened=row.find(folder=>folder.key===openOffice);
          return <div key={start} className="grid grid-cols-2 gap-3">
            {row.map(({key,label,icon:Icon,color,iconColor})=><button key={key} type="button" onClick={()=>setOpenOffice(current=>current===key?null:key)} className={`flex min-h-[76px] items-center gap-3 rounded-2xl p-4 text-left shadow-sm transition ${row.length===1?"col-span-2":""} ${openOffice===key?color:"bg-white"}`}>
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${openOffice===key?iconColor:color}`}><Icon size={21}/></span>
              <b className="min-w-0 text-sm leading-tight">{label}</b>
              <ChevronRight className={`ml-auto shrink-0 transition ${openOffice===key?"rotate-90":""}`} size={17}/>
            </button>)}
            {opened&&<div className={`col-span-2 grid ${opened.children.length===3?"grid-cols-3":"grid-cols-2"} gap-2 rounded-2xl p-3 shadow-sm ${opened.color}`}>
              {opened.children.map(child=><button key={child.label} type="button" onClick={()=>child.view&&setView(child.view)} className="min-h-[48px] rounded-xl border border-white/70 bg-white px-2 py-3 text-xs font-black text-slate-700 shadow-sm">{child.label}</button>)}
            </div>}
          </div>;
        })}
        {(()=>{
          const contract=officeFolders.find(folder=>folder.key==="contract")!;
          const ContractIcon=contract.icon;
          const opened=openOffice==="contract";
          return <section className="overflow-hidden rounded-[24px] border-2 border-indigo-200 bg-white shadow-md shadow-indigo-900/10">
            <button type="button" onClick={()=>setOpenOffice(current=>current==="contract"?null:"contract")} className={`flex min-h-[88px] w-full items-center gap-4 p-4 text-left transition ${opened?"bg-gradient-to-r from-indigo-700 to-blue-600 text-white":"bg-gradient-to-r from-indigo-50 to-blue-50 text-indigo-950"}`}>
              <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${opened?"bg-white/20 text-white":"bg-indigo-600 text-white"}`}><ContractIcon size={25}/></span>
              <span className="min-w-0 flex-1">
                <span className={`mb-1 block text-[11px] font-black tracking-wide ${opened?"text-indigo-100":"text-indigo-600"}`}>중요 계약 문서</span>
                <b className="text-lg font-black">계약서</b>
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-black ${opened?"bg-white/20 text-white":"bg-white text-indigo-700 shadow-sm"}`}>필수</span>
              <ChevronRight className={`shrink-0 transition ${opened?"rotate-90":""}`} size={20}/>
            </button>
            {opened&&<div className="grid grid-cols-2 gap-2 bg-indigo-50 p-3">
              {contract.children.map(child=><button key={child.label} type="button" onClick={()=>child.view&&setView(child.view)} className="min-h-[50px] rounded-xl border border-indigo-100 bg-white px-3 py-3 text-sm font-black text-indigo-800 shadow-sm">{child.label}</button>)}
            </div>}
          </section>;
        })()}
      </div>
    </>
  );
}

function MonthlyCalendar({jobs,expand}:{jobs:Job[];open:(j:Job)=>void;expand:()=>void}) {
  const todayKey=koreaDateKey();
  const [year,month]=todayKey.split("-").map(Number);
  const jobsWithSchedule=jobs.map(job=>({job,schedule:scheduleOf(job.date)}));
  const monthPrefix=`${year}-${String(month).padStart(2,"0")}`;
  const monthJobs=jobsWithSchedule.filter(({schedule})=>schedule.dateKey.startsWith(monthPrefix));
  return <button type="button" onClick={expand} className="mt-7 flex w-full items-center justify-between overflow-hidden rounded-[26px] bg-gradient-to-r from-[#174b91] to-[#2878d5] p-5 text-left text-white shadow-lg shadow-blue-900/15">
    <div className="flex min-w-0 items-center gap-4">
      <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20">
        <CalendarDays size={28}/>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-blue-100">{year}년 · 등록 일정 {monthJobs.length}건</p>
        <p className="mt-1 text-xl font-black">{month}월 일정 달력 크게보기</p>
      </div>
    </div>
    <ChevronRight className="shrink-0" size={24}/>
  </button>;
}

function CalendarScreen({jobs,open,close}:{jobs:Job[];open:(j:Job)=>void;close:()=>void}) {
  const todayKey=koreaDateKey();
  const initialDate=jobs.map(job=>scheduleOf(job.date).dateKey).find(Boolean)||todayKey;
  const [year,setYear]=useState(Number(initialDate.slice(0,4)));
  const [month,setMonth]=useState(Number(initialDate.slice(5,7)));
  const [calendarZoom,setCalendarZoom]=useState(0.35);
  const [viewport,setViewport]=useState({width:390,height:800});
  const pinchDistance=useRef<number|null>(null);
  const pinchZoom=useRef(0.35);
  const firstDay=new Date(year,month-1,1).getDay();
  const lastDate=new Date(year,month,0).getDate();
  const cells:Array<number|null>=[...Array(firstDay).fill(null),...Array.from({length:lastDate},(_,i)=>i+1)];
  while(cells.length%7) cells.push(null);
  const weekCount=cells.length/7;
  const fitZoom=Math.min(1,Math.max(0.3,Number(Math.min((viewport.width-30)/980,(viewport.height-130)/(weekCount*190)).toFixed(2))));
  const weekHeight=Math.max(190,Math.floor((viewport.height-130)/(calendarZoom*weekCount)));
  const schedules=jobs.map(job=>({job,schedule:scheduleOf(job.date)}));
  const monthPrefix=`${year}-${String(month).padStart(2,"0")}`;
  const moveMonth=(amount:number)=>{
    const next=new Date(year,month-1+amount,1);
    const nextYear=next.getFullYear(), nextMonth=next.getMonth()+1;
    setYear(nextYear); setMonth(nextMonth);
  };
  const distanceOf=(touches:TouchList)=>Math.hypot(
    touches[0].clientX-touches[1].clientX,
    touches[0].clientY-touches[1].clientY,
  );
  const startPinch=(event:React.TouchEvent<HTMLDivElement>)=>{
    if(event.touches.length!==2) return;
    pinchDistance.current=distanceOf(event.touches);
    pinchZoom.current=calendarZoom;
  };
  const movePinch=(event:React.TouchEvent<HTMLDivElement>)=>{
    if(event.touches.length!==2||!pinchDistance.current) return;
    event.preventDefault();
    const next=pinchZoom.current*(distanceOf(event.touches)/pinchDistance.current);
    setCalendarZoom(Math.min(1,Math.max(0.3,Number(next.toFixed(2)))));
  };
  const endPinch=(event:React.TouchEvent<HTMLDivElement>)=>{
    if(event.touches.length<2) pinchDistance.current=null;
  };
  useEffect(()=>{
    const measure=()=>setViewport({width:window.innerWidth,height:window.innerHeight});
    measure();
    window.addEventListener("resize",measure);
    return ()=>window.removeEventListener("resize",measure);
  },[]);
  useEffect(()=>setCalendarZoom(fitZoom),[fitZoom]);
  useEffect(()=>{
    let meta=document.querySelector('meta[name="viewport"]') as HTMLMetaElement|null;
    if(!meta){
      meta=document.createElement("meta");
      meta.name="viewport";
      document.head.appendChild(meta);
    }
    meta.content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";
  },[]);
  const returnHome=()=>{
    pinchDistance.current=null;
    setCalendarZoom(fitZoom);
    window.scrollTo({top:0,left:0,behavior:"auto"});
    close();
  };
  const weekdays=["일","월","화","수","목","금","토"];
  return <section className="min-h-[100dvh] py-1">
    <div className="sticky left-0 top-0 z-10 mb-2 grid grid-cols-[72px_1fr_72px] items-center rounded-2xl bg-white p-2 shadow-sm">
      <button type="button" onClick={returnHome} className="rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-black text-slate-700">← 홈</button>
      <div className="flex items-center justify-center gap-1">
        <button type="button" aria-label="이전 달" onClick={()=>moveMonth(-1)} className="grid size-10 place-items-center rounded-xl bg-slate-100 text-xl font-black">‹</button>
        <h2 className="min-w-28 text-center text-xl font-black">{year}년 {month}월</h2>
        <button type="button" aria-label="다음 달" onClick={()=>moveMonth(1)} className="grid size-10 place-items-center rounded-xl bg-slate-100 text-xl font-black">›</button>
      </div>
      <span aria-hidden="true"/>
    </div>
    <div onTouchStart={startPinch} onTouchMove={movePinch} onTouchEnd={endPinch} className="overflow-auto rounded-[28px] bg-gradient-to-br from-blue-50 via-white to-slate-100 p-1 shadow-lg" style={{touchAction:"pan-x pan-y"}}>
      <div className="w-[980px] origin-top-left p-2" style={{zoom:calendarZoom} as React.CSSProperties}>
        <div className="mb-2 grid grid-cols-7 gap-2 px-1 text-center text-[24px] font-black">
          {weekdays.map((weekday,index)=><span key={weekday} className={`py-2 ${index===0?"text-rose-500":index===6?"text-blue-500":"text-slate-500"}`}>{weekday}</span>)}
        </div>
        {Array.from({length:cells.length/7},(_,week)=>{
          const weekCells=cells.slice(week*7,week*7+7);
          return <div key={week} className="mb-2 grid grid-cols-7 gap-2 last:mb-0">
            {weekCells.map((day,column)=>{
              if(!day) return <div key={`empty-${week}-${column}`} style={{minHeight:weekHeight}} className="rounded-2xl border border-white/70 bg-white/40"/>;
              const dateKey=`${monthPrefix}-${String(day).padStart(2,"0")}`;
              const dayJobs=schedules
                .filter(({schedule})=>schedule.dateKey===dateKey)
                .sort((a,b)=>{
                  const aDone=a.job.status==="처리완료";
                  const bDone=b.job.status==="처리완료";
                  if(aDone!==bDone) return aDone?1:-1;
                  return timeOrder(a.schedule.time)-timeOrder(b.schedule.time);
                });
              const today=dateKey===todayKey;
              const holiday=holidayOf(dateKey);
              return <div key={dateKey} style={{minHeight:weekHeight}} className={`min-w-0 rounded-2xl border shadow-sm ${today?"border-blue-400 bg-blue-50":holiday?"border-rose-200 bg-rose-50":"border-slate-200 bg-white"}`}>
                <div style={holiday?{color:"#dc2626"}:undefined} className={`px-2 py-2 text-center font-black ${holiday||column===0?"text-rose-600":column===6?"text-blue-600":"text-slate-900"} ${today?"bg-gradient-to-r from-blue-200 to-sky-100":holiday?"bg-gradient-to-r from-rose-100 to-orange-50":"bg-gradient-to-r from-slate-100 to-blue-50"}`}>
                  <span className="block text-[22px] font-black leading-none">{day}</span>
                  {holiday&&<span className="mt-1 block truncate text-[14px] font-black leading-none">{holiday}</span>}
                </div>
                <div className="space-y-1 p-1.5">
                  {dayJobs.map(({job,schedule})=><button key={job.id} type="button" onClick={()=>open(job)} title={`${displayTime(schedule.time)} / ${job.site||"장소 미입력"} / ${job.worker||"미배정"}`} className={`block w-full rounded-lg border-l-4 px-1.5 py-1 text-left text-[11px] font-black leading-[1.15] shadow-sm ${job.status==="처리완료"?"border-emerald-500 bg-emerald-50 text-emerald-700":"border-blue-500 bg-blue-50 text-slate-900"}`}>
                    <span className="block break-keep">{job.status==="처리완료"?"(완) ":""}{displayTime(schedule.time)} · {job.site||"장소 미입력"}</span>
                    <span className="mt-0.5 block text-[11px] font-bold text-slate-500">{job.worker||"기사 미배정"}</span>
                  </button>)}
                </div>
              </div>;
            })}
          </div>;
        })}
      </div>
    </div>
  </section>;
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
  const [companyChoice,setCompanyChoice]=useState("");
  const [otherCompany,setOtherCompany]=useState("");
  const [intakePhotoCount,setIntakePhotoCount]=useState(0);
  return (
    <form action={add} className="mt-5 space-y-4">
      <Box t="고객 정보">
        <label className="block text-sm font-bold">
          고객사 *
          <select value={companyChoice} onChange={(e)=>setCompanyChoice(e.target.value)} className="input appearance-none">
            <option value="">고객사를 선택하세요</option>
            <option value="하진">하진</option>
            <option value="렉스코">렉스코</option>
            <option value="디랙스">디랙스</option>
            <option value="기타">기타</option>
          </select>
          <input type="hidden" name="company" value={companyChoice==="기타"?otherCompany:companyChoice}/>
        </label>
        {companyChoice==="기타"&&<label className="block text-sm font-bold">기타 고객사 *<input value={otherCompany} onChange={(e)=>setOtherCompany(e.target.value)} placeholder="고객사명을 입력하세요" className="input"/></label>}
        <Field n="site" l="현장 위치" p="예: 한강센트럴자이 커뮤니티센터 2층" />
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
        <label className="block text-sm font-bold">방문 날짜 *<input name="date" type="date" defaultValue={koreaDateKey()} className="input" required/></label>
        <label className="block text-sm font-bold">
          방문 시간 *
          <select name="time" defaultValue="" className="input appearance-none" required>
            <option value="" disabled>시간을 선택하세요</option>
            {Array.from({length:13},(_,index)=>index+8).map(hour=><option key={hour} value={`${String(hour).padStart(2,"0")}:00`}>{String(hour).padStart(2,"0")}시</option>)}
          </select>
        </label>
        <Field n="worker" l="출동기사" p="예: 우제일" />
      </Box>
      <Box t="접수사진">
        <p className="text-sm leading-6 text-slate-500">고장 부위나 장비 상태를 촬영하거나 사진첩에서 여러 장 선택할 수 있습니다.</p>
        <label className="flex min-h-[92px] cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50 text-blue-700 transition active:scale-[0.99]">
          <span className="grid size-11 place-items-center rounded-xl bg-white shadow-sm">
            <Camera size={22}/>
          </span>
          <span>
            <b className="block text-sm">접수사진 선택</b>
            <span className="mt-1 block text-xs font-bold text-blue-500">{intakePhotoCount > 0 ? `${intakePhotoCount}장 선택됨` : "촬영 또는 사진 선택"}</span>
          </span>
          <input
            type="file"
            name="intake_photos"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(event)=>setIntakePhotoCount(event.target.files?.length ?? 0)}
          />
        </label>
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
  saveSchedule,
  uploadPhotos,
}: {
  job: Job;
  update: (s: Status) => Promise<void>;
  save: (v: string) => Promise<void>;
  saveSchedule: (site:string,date:string,time:string) => Promise<void>;
  uploadPhotos: (category:string,files:File[]) => Promise<void>;
}) {
  const [value, setValue] = useState(job.resolution);
  const initialSchedule=scheduleOf(job.date);
  const [site,setSite]=useState(job.site);
  const [visitDate,setVisitDate]=useState(initialSchedule.dateKey);
  const [visitTime,setVisitTime]=useState(/^\d{1,2}:\d{2}$/.test(initialSchedule.time)?initialSchedule.time:"");
  const photoCategories=["수리 전","고장 부위","작업 중","수리 후"] as const;
  const [photos,setPhotos]=useState<Record<string,File[]>>({});
  useEffect(() => {
    const schedule=scheduleOf(job.date);
    setValue(job.resolution);
    setSite(job.site);
    setVisitDate(schedule.dateKey);
    setVisitTime(/^\d{1,2}:\d{2}$/.test(schedule.time)?schedule.time:"");
    setPhotos({});
  }, [job.dbId, job.resolution, job.site, job.date]);
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
      <Box t="방문 일정 수정">
        <label className="block text-sm font-bold">현장 위치<input value={site} onChange={(event)=>setSite(event.target.value)} className="input" placeholder="현장 위치를 입력하세요"/></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-bold">방문 날짜<input type="date" value={visitDate} onChange={(event)=>setVisitDate(event.target.value)} className="input"/></label>
          <label className="block text-sm font-bold">방문 시간<select value={visitTime} onChange={(event)=>setVisitTime(event.target.value)} className="input appearance-none">
            <option value="">시간 미정</option>
            {Array.from({length:13},(_,index)=>index+8).map(hour=><option key={hour} value={`${String(hour).padStart(2,"0")}:00`}>{hour}시</option>)}
          </select></label>
        </div>
        <button type="button" onClick={()=>void saveSchedule(site,visitDate,visitTime)} className="w-full rounded-xl bg-blue-600 py-3 text-sm font-black text-white">수정 내용 저장</button>
      </Box>
      <Box t="사진 첨부">
        <p className="text-sm text-slate-500">항목별로 사진을 여러 장 선택할 수 있습니다.</p>
        <div className="grid grid-cols-2 gap-3">
          {photoCategories.map((category,index)=>{
            const selected=photos[category]||[];
            const styles=["border-blue-200 bg-blue-50 text-blue-700","border-rose-200 bg-rose-50 text-rose-700","border-amber-200 bg-amber-50 text-amber-700","border-emerald-200 bg-emerald-50 text-emerald-700"];
            return <label key={category} className={`flex aspect-square cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-3 text-center ${styles[index]}`}>
              <Camera size={27}/>
              <b className="mt-2 text-sm">{category}</b>
              <span className="mt-1 text-xs font-bold">{selected.length?`${selected.length}장 선택됨`:"사진 선택"}</span>
              <input type="file" accept="image/*" multiple className="sr-only" onChange={(event)=>setPhotos(current=>({...current,[category]:Array.from(event.target.files||[])}))}/>
            </label>;
          })}
        </div>
        {Object.entries(photos).some(([,files])=>files.length>0)&&<div className="rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600">
          {photoCategories.filter(category=>photos[category]?.length).map(category=><p key={category} className="py-0.5"><span className="text-blue-700">{category}</span> · {photos[category].length}장</p>)}
        </div>}
        <button type="button" disabled={!Object.values(photos).some(files=>files.length)} onClick={async()=>{
          for(const category of photoCategories){const files=photos[category]||[];if(files.length) await uploadPhotos(category,files);}
          setPhotos({});
        }} className="w-full rounded-xl bg-slate-900 py-3 text-sm font-black text-white disabled:bg-slate-300">항목별 작업사진 첨부</button>
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
function ProposalForm({userId,say,openProposalList}:{userId:string;say:(s:string)=>void;openProposalList:()=>void}){
  const [saved,setSaved]=useState(false);
  const [lastExport,setLastExport]=useState<OfficeExportData|null>(null);
  const save=async(form:FormData)=>{
    const company=String(form.get("company")||"").trim();
    const title=String(form.get("title")||"").trim();
    const body=String(form.get("body")||"").trim();
    if(!company||!title||!body){say("제안처, 제안 제목, 제안 내용을 입력해주세요");return}
    const {error}=await supabase.from("business_documents").insert({
      document_type:"proposal",
      company,
      recipient_email:String(form.get("email")||"").trim(),
      item_name:title,
      model_name:String(form.get("category")||"").trim(),
      quantity:1,
      unit_price:Number(form.get("amount")||0),
      memo:body,
      created_by:userId,
    });
    if(error){say("제안서를 저장하지 못했습니다");return}
    const amount=Number(form.get("amount")||0);
    setLastExport({title:"제안서",company,date:String(form.get("proposal_date")||koreaDateKey()),headers:["제안 제목","제안 구분","제안 내용","제안 금액"],rows:[[title,String(form.get("category")||"-").trim()||"-",body,`${amount.toLocaleString()}원`]]});
    setSaved(true);say("제안서가 저장됐습니다");
  };
  return <form action={save} className="mt-5 space-y-4">
    <Box t="제안 기본정보">
      <label className="block text-sm font-bold">제안일<input name="proposal_date" type="date" defaultValue={koreaDateKey()} className="input"/></label>
      <Field n="company" l="제안처 *" p="예: 한강센트럴자이"/>
      <Field n="email" l="담당자 이메일" p="example@company.com"/>
      <Field n="title" l="제안 제목 *" p="예: 커뮤니티센터 운동기구 교체 제안"/>
      <Field n="category" l="제안 구분" p="예: 신규 설치·교체·유지보수"/>
    </Box>
    <Box t="제안 내용">
      <label className="block text-sm font-bold">상세 내용 *<textarea name="body" rows={10} className="input resize-none" placeholder="제안 배경, 제품 구성, 기대 효과 등을 입력하세요"/></label>
      <label className="block text-sm font-bold">제안 금액<input name="amount" type="number" min="0" className="input" placeholder="0"/></label>
    </Box>
    <button className="w-full rounded-2xl bg-rose-600 py-4 font-black text-white shadow-lg">제안서 저장</button>
    {saved&&<>{lastExport&&<OfficeExportButtons data={lastExport}/>}<button type="button" onClick={openProposalList} className="w-full rounded-2xl bg-rose-50 py-4 font-black text-rose-700">작성한 제안서 보기</button></>}
  </form>;
}
function ProposalList(){
  const [documents,setDocuments]=useState<BusinessDocument[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    supabase.from("business_documents")
      .select("id,document_type,company,recipient_email,item_name,model_name,quantity,unit_price,memo,created_at")
      .eq("document_type","proposal")
      .order("created_at",{ascending:false})
      .then(({data,error})=>{
        if(!active) return;
        if(error) setError("작성한 제안서를 불러오지 못했습니다");
        else setDocuments((data??[]) as BusinessDocument[]);
        setLoading(false);
      });
    return()=>{active=false};
  },[]);
  if(loading) return <div className="mt-5 rounded-3xl bg-white p-8 text-center text-sm font-bold text-slate-500 shadow-sm">제안서를 불러오는 중입니다</div>;
  if(error) return <div className="mt-5 rounded-3xl bg-rose-50 p-6 text-center text-sm font-bold text-rose-700">{error}</div>;
  if(!documents.length) return <div className="mt-5"><Empty text="아직 작성된 제안서가 없습니다"/></div>;
  return <div className="mt-5 space-y-3">
    <p className="text-sm font-bold text-slate-500">총 {documents.length}개의 제안서가 있습니다</p>
    {documents.map(document=>{
      const writtenAt=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(document.created_at));
      const exportData:OfficeExportData={title:"제안서",company:document.company,date:writtenAt,headers:["제안 제목","제안 구분","제안 내용","제안 금액"],rows:[[document.item_name,document.model_name||"-",document.memo,`${Number(document.unit_price).toLocaleString()}원`]]};
      return <details key={document.id} className="group overflow-hidden rounded-[22px] bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600"><FileSignature size={21}/></span>
          <span className="min-w-0 flex-1"><b className="block truncate">{document.item_name}</b><small className="mt-1 block text-xs text-slate-500">{document.company} · {writtenAt}</small></span>
          <ChevronRight className="shrink-0 transition group-open:rotate-90" size={18}/>
        </summary>
        <div className="border-t border-slate-100 bg-slate-50 p-4 text-sm">
          <p className="font-bold text-slate-500">제안 구분</p><p className="mt-1 font-black">{document.model_name||"구분 없음"}</p>
          <p className="mt-4 font-bold text-slate-500">제안 내용</p><p className="mt-1 whitespace-pre-wrap leading-6">{document.memo}</p>
          <p className="mt-4 flex justify-between rounded-xl bg-rose-50 p-3 font-black text-rose-700"><span>제안 금액</span><span>{Number(document.unit_price).toLocaleString()}원</span></p>
          {document.recipient_email&&<p className="mt-3 text-xs text-slate-500">담당자 이메일 · {document.recipient_email}</p>}
          <OfficeExportButtons data={exportData}/>
        </div>
      </details>;
    })}
  </div>;
}
const escapeHtml=(value:unknown)=>String(value??"")
  .replaceAll("&","&amp;")
  .replaceAll("<","&lt;")
  .replaceAll(">","&gt;")
  .replaceAll('"',"&quot;")
  .replaceAll("'","&#039;");
type OfficeExportData={title:string;company:string;date:string;headers:string[];rows:Array<Array<string|number>>;summary?:Array<[string,string]>};
const safeFileName=(value:string)=>value.replace(/[\\/:*?"<>|]/g,"_").trim()||"하진_문서";
const downloadBlob=(name:string,blob:Blob)=>{
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=url;anchor.download=name;document.body.appendChild(anchor);anchor.click();anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
};
const officeExportHtml=(data:OfficeExportData)=>{
  const header=data.headers.map(value=>`<th>${escapeHtml(value)}</th>`).join("");
  const rows=data.rows.map(row=>`<tr>${row.map(value=>`<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("");
  const summary=(data.summary??[]).map(([label,value])=>`<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>@page{size:A4;margin:16mm}body{font-family:"Malgun Gothic","Noto Sans KR",sans-serif;color:#111827}h1{text-align:center;letter-spacing:8px}.brand{font-size:20px;font-weight:900;border-bottom:3px solid #111827;padding-bottom:14px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #6b7280;padding:8px;font-size:12px;text-align:center;word-break:break-all}th{background:#e5e7eb}.meta th{width:110px}.meta td{text-align:left}.summary{width:330px;margin-left:auto}.summary td{text-align:right;font-weight:700}.actions{text-align:center;margin-top:24px}.actions button{border:0;border-radius:10px;background:#1855a6;color:#fff;padding:13px 28px;font-weight:800}@media print{.actions{display:none}}</style></head><body><div class="brand">HAJIN GROUP</div><h1>${escapeHtml(data.title)}</h1><table class="meta"><tr><th>작성일</th><td>${escapeHtml(data.date)}</td></tr><tr><th>거래처</th><td>${escapeHtml(data.company)}</td></tr></table><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>${summary?`<table class="summary">${summary}</table>`:""}</body></html>`;
};
const exportOfficeDocument=(format:"pdf"|"hangul"|"excel",data:OfficeExportData)=>{
  const base=safeFileName(`${data.company}_${data.title}_${data.date}`);
  if(format==="pdf"){
    const popup=window.open("","_blank","width=900,height=1000");
    if(!popup){window.alert("출력창을 열 수 없습니다. 팝업 차단을 해제해주세요.");return;}
    popup.document.write(officeExportHtml(data).replace("</body>",'<div class="actions"><button onclick="window.print()">인쇄 · PDF 저장</button></div></body>'));
    popup.document.close();popup.focus();return;
  }
  if(format==="hangul"){
    downloadBlob(`${base}.doc`,new Blob(["\ufeff",officeExportHtml(data)],{type:"application/msword;charset=utf-8"}));
    return;
  }
  const csv=[data.headers,...data.rows.map(row=>row.map(String)),...(data.summary??[]).map(row=>[row[0],row[1]])]
    .map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(",")).join("\r\n");
  downloadBlob(`${base}.csv`,new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"}));
};
function OfficeExportButtons({data}:{data:OfficeExportData}){
  return <div className="mt-3 grid grid-cols-3 gap-2">
    <button type="button" onClick={()=>exportOfficeDocument("pdf",data)} className="rounded-xl bg-[#1855a6] px-2 py-3 text-xs font-black text-white">PDF 출력</button>
    <button type="button" onClick={()=>exportOfficeDocument("hangul",data)} className="rounded-xl bg-emerald-600 px-2 py-3 text-xs font-black text-white">한글 문서</button>
    <button type="button" onClick={()=>exportOfficeDocument("excel",data)} className="rounded-xl bg-green-700 px-2 py-3 text-xs font-black text-white">엑셀 출력</button>
  </div>;
}
const printEstimate=(items:BusinessDocument[])=>{
  const first=items[0];
  if(!first) return;
  const supply=items.reduce((sum,item)=>sum+Number(item.quantity)*Number(item.unit_price),0);
  const tax=Math.round(supply*.1);
  const total=supply+tax;
  const writtenAt=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(first.created_at));
  const popup=window.open("","_blank","width=900,height=1000");
  if(!popup){window.alert("PDF 출력창을 열 수 없습니다. 팝업 차단을 해제해주세요.");return;}
  const rows=items.map((item,index)=>`<tr><td>${index+1}</td><td class="left">${escapeHtml(item.item_name)}</td><td>${escapeHtml(item.model_name||"-")}</td><td>${Number(item.quantity).toLocaleString()}</td><td class="right">${Number(item.unit_price).toLocaleString()}</td><td class="right">${(Number(item.quantity)*Number(item.unit_price)).toLocaleString()}</td><td class="left">${escapeHtml(item.memo||"")}</td></tr>`).join("");
  popup.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(first.company)} 견적서</title><style>
    @page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;color:#111827;font-family:Arial,"Noto Sans KR",sans-serif}.sheet{width:100%}.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #111827;padding-bottom:18px}.brand{font-size:22px;font-weight:900;letter-spacing:2px}.title{margin:28px 0;text-align:center;font-size:32px;letter-spacing:12px}.meta{width:100%;border-collapse:collapse;margin-bottom:20px}.meta th,.meta td{border:1px solid #9ca3af;padding:9px;text-align:left;font-size:13px}.meta th{width:110px;background:#f3f4f6}table.items{width:100%;border-collapse:collapse;table-layout:fixed}table.items th,table.items td{border:1px solid #6b7280;padding:8px 6px;text-align:center;font-size:11px;word-break:break-all}table.items th{background:#e5e7eb}table.items .left{text-align:left}table.items .right{text-align:right}.totals{margin:18px 0 0 auto;width:310px;border-collapse:collapse}.totals td{border:1px solid #9ca3af;padding:10px;font-size:13px}.totals td:last-child{text-align:right;font-weight:700}.grand td{background:#dbeafe;color:#1d4ed8;font-size:15px;font-weight:900}.notice{margin-top:35px;border-top:1px solid #d1d5db;padding-top:14px;font-size:11px;color:#6b7280}.actions{margin-top:24px;text-align:center}.actions button{border:0;border-radius:10px;background:#1855a6;color:white;padding:13px 28px;font-weight:800;cursor:pointer}@media print{.actions{display:none}}
  </style></head><body><main class="sheet"><div class="top"><div><div class="brand">HAJIN GROUP</div><small>헬스기구 영업 · 판매 · A/S</small></div><div style="text-align:right;font-size:12px"><b>발행일</b><br>${writtenAt}</div></div><h1 class="title">견 적 서</h1><table class="meta"><tr><th>받는 곳</th><td>${escapeHtml(first.company)}</td></tr>${first.recipient_email?`<tr><th>이메일</th><td>${escapeHtml(first.recipient_email)}</td></tr>`:""}</table><table class="items"><colgroup><col style="width:6%"><col style="width:22%"><col style="width:17%"><col style="width:8%"><col style="width:14%"><col style="width:15%"><col style="width:18%"></colgroup><thead><tr><th>No.</th><th>품목</th><th>모델명</th><th>수량</th><th>단가</th><th>금액</th><th>비고</th></tr></thead><tbody>${rows}</tbody></table><table class="totals"><tr><td>공급가액</td><td>${supply.toLocaleString()}원</td></tr><tr><td>부가세</td><td>${tax.toLocaleString()}원</td></tr><tr class="grand"><td>총 견적금액</td><td>${total.toLocaleString()}원</td></tr></table><p class="notice">위와 같이 견적합니다. 출력 화면에서 프린터 항목을 ‘PDF로 저장’으로 선택하면 PDF 파일로 저장할 수 있습니다.</p><div class="actions"><button onclick="window.print()">인쇄 · PDF 저장</button></div></main></body></html>`);
  popup.document.close();
  popup.focus();
};
function EstimateList(){
  const [documents,setDocuments]=useState<BusinessDocument[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  useEffect(()=>{
    let active=true;
    supabase.from("business_documents")
      .select("id,document_type,company,recipient_email,item_name,model_name,quantity,unit_price,memo,created_at")
      .eq("document_type","estimate")
      .order("created_at",{ascending:false})
      .then(({data,error})=>{
        if(!active) return;
        if(error) setError("작성한 견적서를 불러오지 못했습니다");
        else setDocuments((data??[]) as BusinessDocument[]);
        setLoading(false);
      });
    return()=>{active=false};
  },[]);
  const groups=useMemo(()=>{
    const grouped=new Map<string,BusinessDocument[]>();
    documents.forEach(document=>{
      const key=`${document.company}-${document.created_at}`;
      grouped.set(key,[...(grouped.get(key)??[]),document]);
    });
    return Array.from(grouped.values());
  },[documents]);
  const filteredGroups=useMemo(()=>{
    const keyword=query.trim().toLowerCase();
    if(!keyword) return groups;
    return groups.filter(items=>items.some(item=>[
      item.company,item.item_name,item.model_name,item.memo,item.created_at,
    ].join(" ").toLowerCase().includes(keyword)));
  },[groups,query]);
  if(loading) return <div className="mt-5 rounded-3xl bg-white p-8 text-center text-sm font-bold text-slate-500 shadow-sm">견적서를 불러오는 중입니다</div>;
  if(error) return <div className="mt-5 rounded-3xl bg-rose-50 p-6 text-center text-sm font-bold text-rose-700">{error}</div>;
  if(!groups.length) return <div className="mt-5"><Empty text="아직 작성된 견적서가 없습니다"/></div>;
  return <div className="mt-5 space-y-3">
    <label className="relative block">
      <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={19}/>
      <input value={query} onChange={event=>setQuery(event.target.value)} className="input !mt-0 pl-11" placeholder="거래처·품목·모델명 검색"/>
    </label>
    <p className="text-sm font-bold text-slate-500">총 {groups.length}개 중 {filteredGroups.length}개의 견적서가 조회됩니다</p>
    {!filteredGroups.length&&<Empty text="검색 조건에 맞는 견적서가 없습니다"/>}
    {filteredGroups.map((items,index)=>{
      const first=items[0];
      const supply=items.reduce((sum,item)=>sum+Number(item.quantity)*Number(item.unit_price),0);
      const total=supply+Math.round(supply*.1);
      const writtenAt=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(first.created_at));
      const exportData:OfficeExportData={
        title:"견적서",company:first.company,date:writtenAt,
        headers:["품목","모델명","수량","단가","금액","비고"],
        rows:items.map(item=>[item.item_name,item.model_name||"-",item.quantity,Number(item.unit_price).toLocaleString(),(Number(item.quantity)*Number(item.unit_price)).toLocaleString(),item.memo||""]),
        summary:[["공급가액",`${supply.toLocaleString()}원`],["부가세",`${Math.round(supply*.1).toLocaleString()}원`],["총 견적금액",`${total.toLocaleString()}원`]],
      };
      return <details key={`${first.id}-${index}`} className="group overflow-hidden rounded-[22px] bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><FileText size={21}/></span>
          <span className="min-w-0 flex-1"><b className="block truncate">{first.company}</b><small className="mt-1 block text-xs text-slate-500">{writtenAt} · {items.length}개 품목</small></span>
          <span className="shrink-0 text-right"><b className="block text-blue-700">{total.toLocaleString()}원</b><ChevronRight className="ml-auto mt-1 transition group-open:rotate-90" size={17}/></span>
        </summary>
        <div className="border-t border-slate-100 bg-slate-50 p-4">
          <div className="space-y-2">
            {items.map(item=><div key={item.id} className="rounded-xl bg-white p-3 text-sm">
              <div className="flex justify-between gap-3"><b>{item.item_name}</b><b>{(Number(item.quantity)*Number(item.unit_price)).toLocaleString()}원</b></div>
              <p className="mt-1 text-xs text-slate-500">{item.model_name||"모델명 없음"} · {item.quantity}개 × {Number(item.unit_price).toLocaleString()}원</p>
              {item.memo&&<p className="mt-2 text-xs text-slate-600">{item.memo}</p>}
            </div>)}
          </div>
          <div className="mt-3 rounded-xl bg-blue-50 p-3 text-sm">
            <p className="flex justify-between"><span>공급가액</span><b>{supply.toLocaleString()}원</b></p>
            <p className="mt-1 flex justify-between"><span>부가세</span><b>{Math.round(supply*.1).toLocaleString()}원</b></p>
            <p className="mt-2 flex justify-between border-t border-blue-200 pt-2 font-black text-blue-800"><span>총 견적금액</span><span>{total.toLocaleString()}원</span></p>
          </div>
          <OfficeExportButtons data={exportData}/>
        </div>
      </details>;
    })}
  </div>;
}
function DocumentForm({type,userId,say,openEstimateList}:{type:"estimate"|"transaction";userId:string;say:(s:string)=>void;openEstimateList?:()=>void}) {
  const [saved,setSaved]=useState(false);
  const [lastExport,setLastExport]=useState<OfficeExportData|null>(null);
  const [issuer,setIssuer]=useState<"하진"|"렉스코">("하진");
  const [items,setItems]=useState([{item_name:"",model_name:"",quantity:"1",unit_price:"",memo:""}]);
  const label=type==="estimate"?"견적서":"거래명세서";
  const save=async(form:FormData)=>{
    const company=String(form.get("company")||"").trim(),itemName=String(form.getAll("item_name")[0]||"").trim();
    if(!company||!itemName){say("거래처와 품목을 입력해주세요");return}
    const itemNames=form.getAll("item_name");
    const modelNames=form.getAll("model_name");
    const quantities=form.getAll("quantity");
    const unitPrices=form.getAll("unit_price");
    const itemMemos=form.getAll("item_memo");
    const rows=itemNames.map((name,index)=>({
      document_type:type,
      company,
      recipient_email:String(form.get("email")||"").trim(),
      item_name:String(name).trim(),
      model_name:String(modelNames[index]||"").trim(),
      quantity:Number(quantities[index]||1),
      unit_price:Number(unitPrices[index]||0),
      memo:[String(itemMemos[index]||"").trim(),String(form.get("memo")||"").trim()].filter(Boolean).join(" / "),
      created_by:userId,
    })).filter(row=>row.item_name);
    const{error}=await supabase.from("business_documents").insert(rows);
    if(error){say(`${label}를 저장하지 못했습니다`);return}
    const exportSupply=rows.reduce((sum,row)=>sum+Number(row.quantity)*Number(row.unit_price),0);
    const exportTax=Math.round(exportSupply*.1);
    setLastExport({
      title:label,company,date:new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"long",day:"numeric"}).format(new Date()),
      headers:["품목","모델명","수량","단가","금액","비고"],
      rows:rows.map(row=>[row.item_name,row.model_name||"-",row.quantity,Number(row.unit_price).toLocaleString(),(Number(row.quantity)*Number(row.unit_price)).toLocaleString(),row.memo||""]),
      summary:[["공급가액",`${exportSupply.toLocaleString()}원`],["부가세",`${exportTax.toLocaleString()}원`],["총 금액",`${(exportSupply+exportTax).toLocaleString()}원`]],
    });
    setSaved(true);say(`${label}가 저장됐습니다`);
  };
  if(type==="transaction") return <form action={save} className="mt-5 space-y-4"><Box t={`${label} 작성`}><Field n="company" l="거래처 *" p="예: 한강센트럴자이"/><Field n="email" l="받는 사람 이메일" p="example@company.com"/><Field n="item_name" l="품목 *" p="예: 런닝머신 벨트"/><Field n="model_name" l="모델명" p="예: DRAX DX-3000"/><Field n="quantity" l="수량" p="1"/><Field n="unit_price" l="단가" p="0"/><label className="block text-sm font-bold">비고<textarea name="memo" rows={3} className="input resize-none" placeholder="추가 내용을 입력하세요"/></label></Box><button className="w-full rounded-2xl bg-[#1855a6] py-4 font-black text-white shadow-lg">{label} 저장</button>{saved&&lastExport&&<OfficeExportButtons data={lastExport}/>}</form>;

  const changeItem=(index:number,key:string,value:string)=>setItems(current=>current.map((item,i)=>i===index?{...item,[key]:value}:item));
  const supply=items.reduce((sum,item)=>sum+(Number(item.quantity)||0)*(Number(item.unit_price)||0),0);
  const tax=Math.round(supply*.1);
  const inputClass="input !mt-0";
  return <form action={save} className="mt-5 space-y-4">
    <Box t="발행 회사">
      <div className="grid grid-cols-2 gap-3">
        {(["하진","렉스코"] as const).map(name=><button key={name} type="button" onClick={()=>setIssuer(name)} className={`rounded-2xl border p-4 text-left ${issuer===name?"border-2 border-blue-600 bg-blue-50":"border-slate-200 bg-white"}`}><b className="block text-sm">{name}</b><small className="mt-2 block text-xs text-slate-500">{name==="하진"?"532-07-02348":"236-09-02463"}</small></button>)}
      </div>
    </Box>
    <Box t="받는 곳">
      <label className="block text-sm font-bold">견적일<input name="estimate_date" type="date" defaultValue={new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul"}).format(new Date())} className={inputClass}/></label>
      <Field n="company" l="거래처 *" p="예: 별내 동익미라벨 39단지"/>
      <div className="grid grid-cols-2 gap-3"><Field n="manager" l="담당자" p="담당자명"/><Field n="phone" l="연락처" p="010-0000-0000"/></div>
    </Box>
    <section className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between"><h2 className="font-black">견적 품목</h2><button type="button" onClick={()=>setItems(current=>[...current,{item_name:"",model_name:"",quantity:"1",unit_price:"",memo:""}])} className="rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-blue-700"><Plus className="mr-1 inline" size={17}/>품목 추가</button></div>
      {items.map((item,index)=><div key={index} className="space-y-4 rounded-3xl border border-slate-200 p-4">
        <div className="flex items-center justify-between"><h3 className="font-black">품목 {index+1}</h3>{index>0&&<button type="button" onClick={()=>setItems(current=>current.filter((_,i)=>i!==index))} className="text-xs font-bold text-red-500">삭제</button>}</div>
        <label className="block text-sm font-bold">품목 *<input name="item_name" value={item.item_name} onChange={e=>changeItem(index,"item_name",e.target.value)} className={inputClass} placeholder="예: 런닝머신 벨트"/></label>
        <label className="block text-sm font-bold">모델명<input name="model_name" value={item.model_name} onChange={e=>changeItem(index,"model_name",e.target.value)} className={inputClass} placeholder="예: DRAX DX-3000"/></label>
        <label className="block text-sm font-bold">수량<input name="quantity" type="number" min="1" value={item.quantity} onChange={e=>changeItem(index,"quantity",e.target.value)} className={inputClass} placeholder="1"/></label>
        <label className="block text-sm font-bold">단가<input name="unit_price" type="number" min="0" value={item.unit_price} onChange={e=>changeItem(index,"unit_price",e.target.value)} className={inputClass} placeholder="0"/></label>
        <label className="block text-sm font-bold">비고<textarea name="item_memo" rows={3} value={item.memo} onChange={e=>changeItem(index,"memo",e.target.value)} className={`${inputClass} resize-none`} placeholder="추가 내용을 입력하세요"/></label>
        <p className="text-right font-black">{((Number(item.quantity)||0)*(Number(item.unit_price)||0)).toLocaleString()}원</p>
      </div>)}
    </section>
    <Box t="합계 및 비고">
      <div className="rounded-2xl bg-slate-50 p-4 text-sm"><p className="flex justify-between"><span>공급가액</span><b>{supply.toLocaleString()}원</b></p><p className="mt-2 flex justify-between"><span>부가세</span><b>{tax.toLocaleString()}원</b></p><p className="mt-3 flex justify-between border-t border-slate-400 pt-3 text-base font-black"><span>총 견적금액</span><span className="text-blue-700">{(supply+tax).toLocaleString()}원</span></p></div>
      <textarea name="memo" rows={4} className="input resize-none" placeholder="비고"/>
    </Box>
    <button className="w-full rounded-2xl bg-[#1855a6] py-4 font-black text-white shadow-lg">견적서 저장</button>
    {saved&&<>{lastExport&&<OfficeExportButtons data={lastExport}/>} {openEstimateList&&<button type="button" onClick={openEstimateList} className="w-full rounded-2xl bg-blue-50 py-4 font-black text-blue-700">작성한 견적서 보기</button>}</>}
  </form>;
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
        [ClipboardPenLine, "접수 등록", "register"],
        [Mail, "메일 보내기", "mail"],
        [History, "작업 이력", "progress"],
      ].map(([I, t, v]: any) => (
        <button
          key={t}
          onClick={() => setView(v)}
          className={`flex min-w-18 flex-col items-center gap-1.5 py-1 text-xs font-black ${view === v ? "text-blue-700" : "text-slate-600"}`}
        >
          <span className={`grid size-10 place-items-center rounded-xl transition ${view === v ? "scale-105 bg-gradient-to-br from-[#1553aa] to-[#2879df] text-white shadow-lg shadow-blue-600/25" : "bg-blue-50 text-[#1d63b7]"}`}>
            <I size={22} strokeWidth={2.5} />
          </span>
          {t}
        </button>
      ))}
    </nav>
  );
}
