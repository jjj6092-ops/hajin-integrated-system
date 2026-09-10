"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
type User = { email?: string };
import {
  Bell,
  CalendarDays,
  Camera,
  ChevronLeft,
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
  Image as ImageIcon,
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
  manager: string;
  phone: string;
  machine: string;
  issue: string;
  date: string;
  worker: string;
  status: Status;
  resolution: string;
  requiredEquipment: string;
  specialNotes: string;
  createdAt: string;
};
type BusinessDocument = {
  id: number | string;
  document_type: "estimate" | "transaction" | "proposal" | "contract" | "spec" | "opinion";
  company: string;
  recipient_email: string;
  item_name: string;
  model_name: string;
  quantity: number;
  unit_price: number;
  memo: string;
  created_at: string;
};
const LOCAL_DOC_CACHE_KEY = "hajin_business_documents_cache_v1";
const readLocalBusinessDocuments = (): BusinessDocument[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_DOC_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};
const writeLocalBusinessDocuments = (rows: BusinessDocument[]) => {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(LOCAL_DOC_CACHE_KEY, JSON.stringify(rows.slice(0, 300))); } catch {}
};
const cacheBusinessDocuments = (rows: BusinessDocument[]) => {
  const current = readLocalBusinessDocuments();
  const merged = [...rows, ...current].filter((row, index, all) =>
    index === all.findIndex(other => String(other.id) === String(row.id))
  );
  writeLocalBusinessDocuments(merged);
};
const mergeBusinessDocuments = (remote: BusinessDocument[], local: BusinessDocument[]) => {
  const signature = (row: BusinessDocument) => [
    row.document_type,row.company,row.item_name,row.model_name,row.quantity,row.unit_price,row.memo
  ].join("|");
  const seen = new Set<string>();
  return [...remote, ...local]
    .filter(row => { const key = signature(row); if (seen.has(key)) return false; seen.add(key); return true; })
    .sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
};
const deleteBusinessDocuments = async (rows: BusinessDocument[], label: string) => {
  if (typeof window !== "undefined" && !window.confirm(`${label}를 삭제하시겠습니까?\n삭제한 문서는 복구할 수 없습니다.`)) return false;
  const remoteIds = rows.map(row=>row.id).filter(id=>!String(id).startsWith("local-"));
  if (remoteIds.length) {
    const { error } = await supabase.from("business_documents").delete().in("id", remoteIds);
    if (error) { window.alert(`${label} 삭제에 실패했습니다.`); return false; }
  }
  const deleteIds = new Set(rows.map(row=>String(row.id)));
  const deleteSignatures = new Set(rows.map(row=>[row.document_type,row.company,row.item_name,row.model_name,row.quantity,row.unit_price,row.memo].join("|")));
  writeLocalBusinessDocuments(readLocalBusinessDocuments().filter(row=>
    !deleteIds.has(String(row.id)) && !deleteSignatures.has([row.document_type,row.company,row.item_name,row.model_name,row.quantity,row.unit_price,row.memo].join("|"))
  ));
  return true;
};

type WorkflowStep = "접수" | "출동" | "작업완료" | "정산완료";
type JobWorkflow = {
  step: WorkflowStep;
  estimateSent: boolean;
  preparation: string;
  diagnosis: string;
  paymentStatus: "미입금" | "일부입금" | "입금완료";
  paymentAmount: string;
  transactionSent: boolean;
};
const WORKFLOW_KEY = "hajin_job_workflow_v1";
const workflowSteps: WorkflowStep[] = ["접수","출동","작업완료","정산완료"];
const defaultWorkflow = (): JobWorkflow => ({step:"접수",estimateSent:false,preparation:"",diagnosis:"",paymentStatus:"미입금",paymentAmount:"",transactionSent:false});
const normalizeWorkflowStep = (step:any): WorkflowStep => {
  if (step === "출동" || step === "출동준비" || step === "출동작업" || step === "일정확정") return "출동";
  if (step === "작업완료" || step === "입금대기" || step === "거래명세서") return "작업완료";
  if (step === "정산완료" || step === "최종완료") return "정산완료";
  return "접수";
};
const readWorkflow = (jobId:number): JobWorkflow => {
  if (typeof window === "undefined") return defaultWorkflow();
  try {
    const all=JSON.parse(localStorage.getItem(WORKFLOW_KEY)||"{}");
    const saved=all[String(jobId)]||{};
    return {...defaultWorkflow(),...saved,step:normalizeWorkflowStep(saved.step)};
  } catch { return defaultWorkflow(); }
};
const writeWorkflow = (jobId:number,value:JobWorkflow) => {
  if (typeof window === "undefined") return;
  try { const all=JSON.parse(localStorage.getItem(WORKFLOW_KEY)||"{}"); all[String(jobId)]=value; localStorage.setItem(WORKFLOW_KEY,JSON.stringify(all)); } catch {}
};
const workflowStepOfJob = (job: Job): WorkflowStep => {
  if (typeof window !== "undefined") {
    try {
      const all = JSON.parse(localStorage.getItem(WORKFLOW_KEY) || "{}");
      const saved = all[String(job.dbId)];
      if (saved?.step) return normalizeWorkflowStep(saved.step);
    } catch {}
  }
  if (job.status === "처리완료") return "작업완료";
  if (job.status === "방문예정" || job.status === "부품대기" || job.status === "재방문") return "출동";
  return "접수";
};

type View =
  | "home"
  | "calendar"
  | "register"
  | "progress"
  | "todayVisit"
  | "todayPending"
  | "todayComplete"
  | "detail"
  | "photos"
  | "estimate"
  | "estimateList"
  | "proposal"
  | "proposalList"
  | "transaction"
  | "transactionList"
  | "contract"
  | "contractList"
  | "spec"
  | "specList"
  | "opinion"
  | "opinionList"
  | "mail"
  | "notifications";
const badge: Record<Status, string> = {
  접수: "bg-slate-100 text-slate-700",
  방문예정: "bg-blue-50 text-blue-700",
  부품대기: "bg-amber-50 text-amber-700",
  재방문: "bg-violet-50 text-violet-700",
  처리완료: "bg-emerald-50 text-emerald-700",
};
const CONTACT_SEPARATOR = "|||";
const splitContact = (value: string) => {
  const raw = String(value || "");
  if (!raw.includes(CONTACT_SEPARATOR)) return { manager: "", phone: raw };
  const [manager, ...rest] = raw.split(CONTACT_SEPARATOR);
  return { manager: manager.trim(), phone: rest.join(CONTACT_SEPARATOR).trim() };
};
const joinContact = (manager: string, phone: string) =>
  manager.trim() ? `${manager.trim()}${CONTACT_SEPARATOR}${phone.trim()}` : phone.trim();
const companyAccent = (company: string) => {
  if (company === "하진") return { bar: "bg-blue-500", tag: "bg-blue-50 text-blue-700" };
  if (company === "렉스코") return { bar: "bg-emerald-500", tag: "bg-emerald-50 text-emerald-700" };
  if (company === "디랙스") return { bar: "bg-orange-500", tag: "bg-orange-50 text-orange-700" };
  return { bar: "bg-slate-400", tag: "bg-slate-100 text-slate-700" };
};

const VISIT_META_SEPARATOR = "|||HAJIN_META|||";
const splitVisitMeta = (value: string) => {
  const raw = String(value || "");
  const [schedule, encoded] = raw.split(VISIT_META_SEPARATOR);
  if (!encoded) return { schedule: schedule.trim(), requiredEquipment: "", specialNotes: "" };
  try {
    const parsed = JSON.parse(decodeURIComponent(encoded));
    return {
      schedule: schedule.trim(),
      requiredEquipment: String(parsed?.requiredEquipment || ""),
      specialNotes: String(parsed?.specialNotes || ""),
    };
  } catch {
    return { schedule: schedule.trim(), requiredEquipment: "", specialNotes: "" };
  }
};
const joinVisitMeta = (date: string, time: string, requiredEquipment = "", specialNotes = "") => {
  const schedule = [date.trim(), time.trim()].filter(Boolean).join(" ");
  const meta = encodeURIComponent(JSON.stringify({ requiredEquipment: requiredEquipment.trim(), specialNotes: specialNotes.trim() }));
  return `${schedule}${VISIT_META_SEPARATOR}${meta}`;
};

const toJob = (r: JobRow): Job => {
  const d = new Date(r.created_at);
  const y = String(d.getFullYear()).slice(-2),
    m = String(d.getMonth() + 1).padStart(2, "0"),
    day = String(d.getDate()).padStart(2, "0");
  const contact = splitContact(r.contact_phone);
  const visit = splitVisitMeta(r.visit_note);
  return {
    dbId: r.id,
    id: `AS-${y}${m}${day}-${String(r.id).padStart(3, "0")}`,
    company: r.company,
    site: r.site,
    manager: contact.manager,
    phone: contact.phone,
    machine: r.machine,
    issue: r.issue,
    date: visit.schedule,
    worker: r.worker,
    status: r.status,
    resolution: r.resolution,
    requiredEquipment: visit.requiredEquipment,
    specialNotes: visit.specialNotes,
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
const notificationKeyOf = (job: Job) =>
  `${job.dbId}:${job.status}:${job.date}:${job.site}:${job.worker}:${job.issue}`;

export default function Page() {
  const [user, setUser] = useState<User | null>(null),
    [authReady, setAuthReady] = useState(false),
    [profile, setProfile] = useState<Profile | null>(null),
    [dataReady, setDataReady] = useState(false),
    [initError, setInitError] = useState("");
  const [view, setView] = useState<View>("home"),
    [jobs, setJobs] = useState<Job[]>([]),
    [selected, setSelected] = useState<Job | null>(null),
    [readNotifications, setReadNotifications] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [toast, setToast] = useState(""),
    [loadError, setLoadError] = useState("");
  const viewRef = useRef<View>("home");
  const navigate = useCallback((nextView: View) => {
    // 홈 카드 등 빠른 화면 전환은 현재 ref가 잠깐 어긋나도 반드시 열리게 한다.
    if (viewRef.current !== nextView) {
      window.history.pushState(
        { ...window.history.state, hajinView: nextView },
        "",
      );
    }
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
        "home", "calendar", "register", "progress", "todayVisit", "todayPending", "todayComplete", "detail", "photos",
        "estimate", "estimateList", "proposal", "proposalList",
        "transaction", "transactionList", "contract", "contractList",
        "spec", "specList", "opinion", "opinionList", "mail", "notifications",
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
    if (!profile?.employee_id) {
      setReadNotifications([]);
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(`hajin-read-notifications:${profile.employee_id}`) || "[]");
      setReadNotifications(Array.isArray(saved) ? saved.filter(value => typeof value === "string") : []);
    } catch {
      setReadNotifications([]);
    }
  }, [profile?.employee_id]);
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
  const openNotification = (job: Job) => {
    const key = notificationKeyOf(job);
    setReadNotifications(current => {
      if (current.includes(key)) return current;
      const next = [...current, key].slice(-500);
      if (profile?.employee_id) {
        localStorage.setItem(`hajin-read-notifications:${profile.employee_id}`, JSON.stringify(next));
      }
      return next;
    });
    open(job);
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
      contact_phone: joinContact(
        String(f.get("manager") || "").trim(),
        String(f.get("phone") || "").trim(),
      ),
      machine: String(f.get("machine") || "").trim(),
      visit_note: joinVisitMeta(
        String(f.get("date") || "").trim(),
        String(f.get("time") || "").trim(),
        String(f.get("requiredEquipment") || "").trim(),
        String(f.get("specialNotes") || "").trim(),
      ),
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
    const uploadedPaths: string[] = [];
    for (const [index, file] of intakePhotos.entries()) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${j.dbId}/접수사진/${Date.now()}-${index}-${safeName}`;
      const { error: photoError } = await supabase.storage
        .from("as-job-photos")
        .upload(path, file, { upsert: false });
      if (photoError) {
        if (uploadedPaths.length) {
          await supabase.storage.from("as-job-photos").remove(uploadedPaths);
        }
        await supabase.from("as_jobs").delete().eq("id", j.dbId);
        say("사진 저장에 실패해 A/S 접수를 완료하지 않았습니다. 다시 시도해주세요");
        return;
      }
      uploadedPaths.push(path);
    }
    setJobs((x) => [j, ...x]);
    setSelected(j);
    navigate("progress");
    if (intakePhotos.length === 0) {
      say("A/S 접수가 등록됐습니다");
    } else {
      say(`A/S 접수와 접수사진 ${intakePhotos.length}장이 서버에 저장됐습니다`);
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
      .update({ site: site.trim(), visit_note: joinVisitMeta(date, time, selected.requiredEquipment, selected.specialNotes), updated_by: user.id })
      .eq("id", selected.dbId)
      .select("id,company,site,contact_phone,machine,issue,visit_note,worker,status,resolution,created_at")
      .single();
    if (error) { say("일정을 수정하지 못했습니다"); return; }
    const next = toJob(data as JobRow);
    setSelected(next);
    setJobs((current) => current.map((job) => job.dbId === next.dbId ? next : job));
    say("방문 일정과 현장 위치를 수정했습니다");
  };
  const saveJob = async (values: {company:string;site:string;manager:string;phone:string;machine:string;issue:string;date:string;time:string;worker:string;requiredEquipment:string;specialNotes:string;}, silent = false) => {
    if (!user || !selected) return null;
    const payload = {
      company: values.company.trim(),
      site: values.site.trim(),
      contact_phone: joinContact(values.manager, values.phone),
      machine: values.machine.trim(),
      issue: values.issue.trim(),
      visit_note: joinVisitMeta(values.date, values.time, values.requiredEquipment, values.specialNotes),
      worker: values.worker.trim(),
      updated_by: user.id,
    };
    if (!payload.company || !payload.issue) { say("고객사와 고장원인을 입력해주세요"); return null; }
    const { data, error } = await supabase.from("as_jobs").update(payload).eq("id", selected.dbId).select("id,company,site,contact_phone,machine,issue,visit_note,worker,status,resolution,created_at").single();
    if (error) { say("접수 내용을 수정하지 못했습니다"); return null; }
    const next = toJob(data as JobRow);
    setSelected(next);
    setJobs(current => current.map(job => job.dbId === next.dbId ? next : job));
    if (!silent) say("접수 내용을 수정했습니다");
    return next;
  };
  const deleteJob = async () => {
    if (!user || !selected) return false;
    if (typeof window !== "undefined" && !window.confirm("이 A/S 접수건을 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.")) return false;
    const { error } = await supabase.from("as_jobs").delete().eq("id", selected.dbId);
    if (error) { say("접수건을 삭제하지 못했습니다"); return false; }
    try {
      const all=JSON.parse(localStorage.getItem(WORKFLOW_KEY)||"{}");
      delete all[String(selected.dbId)];
      localStorage.setItem(WORKFLOW_KEY,JSON.stringify(all));
    } catch {}
    setJobs(current => current.filter(job => job.dbId !== selected.dbId));
    setSelected(null);
    viewRef.current = "home";
    setView("home");
    say("접수건을 삭제했습니다");
    return true;
  };

  const uploadJobPhotos = async (category: string, files: File[]) => {
    if (!user || !selected || !files.length) return true;
    const uploadedPaths: string[] = [];
    for (const [index,file] of files.entries()) {
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
      const path=`${selected.dbId}/${category}/${Date.now()}-${index}-${safeName}`;
      const { error }=await supabase.storage.from("as-job-photos").upload(path,file,{upsert:false});
      if(error){
        if(uploadedPaths.length) await supabase.storage.from("as-job-photos").remove(uploadedPaths);
        say("사진을 서버에 저장하지 못했습니다. 다시 시도해주세요");
        return false;
      }
      uploadedPaths.push(path);
    }
    return true;
  };
  if (!authReady || !dataReady) return <AuthLoading />;
  if (initError) return <ConnectionError message={initError} />;
  if (!user) return <Login />;
  if (!profile?.active)
    return <PendingAccount id={user.email?.split("@")[0] ?? "직원"} />;
  const staffName = profile.display_name || profile.employee_id;
  const notificationCount = notificationJobsOf(jobs).filter(job => !readNotifications.includes(notificationKeyOf(job))).length;
  return (
    <main className="min-h-screen bg-[#eaf0f6] text-slate-900">
      <div className={`mx-auto min-h-screen bg-[#f8fafc] shadow-2xl ${view === "calendar" ? "max-w-3xl" : "max-w-md"}`}>
        {view !== "calendar" && <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-slate-100 bg-white/95 px-5 backdrop-blur">
          <div className="flex items-center gap-3">
            {view === "home" ? (
              <div className="relative size-11 shrink-0 bg-transparent">
                <img
                  src="/hajin-emblem-transparent.png"
                  alt="HAJIN"
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <div className="relative size-11 shrink-0 bg-transparent">
                <img
                  src="/hajin-emblem-transparent.png"
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
                    transactionList: "작성한 거래명세서",
                    contract: "계약서 작성",
                    contractList: "작성한 계약서",
                    spec: "사양서 작성",
                    specList: "작성한 사양서",
                    opinion: "소견서 작성",
                    opinionList: "작성한 소견서",
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
            <Dashboard
              jobs={jobs}
              setView={(nextView) => {
                // 홈의 빠른 업무 카드는 브라우저 history를 건드리지 않고
                // 앱 내부 화면만 전환한다. 일부 모바일 브라우저에서
                // pushState 직후 페이지 로드 오류가 나는 문제를 피한다.
                viewRef.current = nextView;
                setView(nextView);
              }}
              open={open}
              refreshJobs={loadJobs}
            />
          )}{" "}
          {view === "calendar" && (
            <CalendarScreen jobs={jobs} open={open} close={() => navigate("home")} />
          )}{" "}
          {view === "register" && <Register add={add} />}{" "}
          {view === "todayVisit" && <TodayJobs jobs={jobs} mode="visit" open={open} close={() => { viewRef.current = "home"; setView("home"); }} />} {" "}
          {view === "todayPending" && <TodayJobs jobs={jobs} mode="pending" open={open} close={() => { viewRef.current = "home"; setView("home"); }} />} {" "}
          {view === "todayComplete" && <TodayJobs jobs={jobs} mode="complete" open={open} close={() => { viewRef.current = "home"; setView("home"); }} />} {" "}
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
              jobs={jobs}
              update={updateStatus}
              save={saveResolution}
              saveSchedule={saveSchedule}
              saveJob={saveJob}
              deleteJob={deleteJob}
              uploadPhotos={uploadJobPhotos}
              openEstimate={() => navigate("estimate")}
              openTransaction={() => navigate("transaction")}
            />
          )}{" "}
          {view === "photos" && <Photos say={say} />}{" "}
          {view === "estimate" && (
            <DocumentForm type="estimate" userId={user.id} say={say} openEstimateList={()=>navigate("estimateList")} />
          )}{" "}
          {view === "estimateList" && <EstimateList type="estimate" />}{" "}
          {view === "proposal" && <ProposalForm userId={user.id} say={say} openProposalList={()=>navigate("proposalList")} />}{" "}
          {view === "proposalList" && <ProposalList />}{" "}
          {view === "transaction" && (
            <DocumentForm type="transaction" userId={user.id} say={say} openEstimateList={()=>navigate("transactionList")} />
          )}{" "}
          {view === "transactionList" && <EstimateList type="transaction" />}{" "}
          {view === "contract" && <SimpleOfficeForm type="contract" userId={user.id} say={say} openList={()=>navigate("contractList")} />}{" "}
          {view === "contractList" && <SimpleOfficeList type="contract" />}{" "}
          {view === "spec" && <SimpleOfficeForm type="spec" userId={user.id} say={say} openList={()=>navigate("specList")} />}{" "}
          {view === "specList" && <SimpleOfficeList type="spec" />}{" "}
          {view === "opinion" && <SimpleOfficeForm type="opinion" userId={user.id} say={say} openList={()=>navigate("opinionList")} />}{" "}
          {view === "opinionList" && <SimpleOfficeList type="opinion" />}{" "}
          {view === "mail" && <MailForm say={say} />}
          {view === "notifications" && (
            <Notifications jobs={jobs} open={openNotification} readNotifications={readNotifications} />
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
            src="/hajin-emblem-transparent.png"
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
            <img src="/hajin-emblem-transparent.png" alt="HAJIN" className="h-full w-full object-contain"/>
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
          <div className="flex flex-wrap items-center justify-start gap-x-4 gap-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-black text-slate-700">
              <input
                type="checkbox"
                checked={saveId}
                onChange={(event) => setSaveId(event.target.checked)}
                className="size-5 rounded border-slate-300 accent-[#1855a6]"
              />
              아이디 저장
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-black text-slate-700">
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

function Notifications({ jobs, open, readNotifications }: { jobs: Job[]; open: (job: Job) => void; readNotifications: string[] }) {
  const today = koreaDateKey();
  const items = notificationJobsOf(jobs);
  const unreadCount = items.filter(job => !readNotifications.includes(notificationKeyOf(job))).length;
  return (
    <section className="mt-5 space-y-3">
      <div className="rounded-[24px] bg-gradient-to-br from-[#173f82] to-[#2774d7] p-5 text-white shadow-lg shadow-blue-900/15">
        <p className="text-sm font-bold text-blue-100">미확인 알림</p>
        <p className="mt-1 text-3xl font-black">{unreadCount}건</p>
        <p className="mt-1 text-xs font-bold text-blue-100/80">전체 알림 {items.length}건</p>
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
          const isRead = readNotifications.includes(notificationKeyOf(job));
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
              className={`relative flex w-full items-center gap-3 rounded-[22px] p-4 text-left shadow-sm transition active:scale-[0.99] ${isRead ? "bg-slate-50 opacity-75" : "bg-white ring-2 ring-blue-100"}`}
            >
              {!isRead&&<span className="absolute right-3 top-3 size-2.5 rounded-full bg-red-500"/>}
              <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${color}`}>
                {isToday ? <CalendarDays size={21} /> : <Bell size={21} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <b className="truncate text-sm">{job.company}</b>
                  <em className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black not-italic ${color}`}>{label}</em>
                  <em className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black not-italic ${isRead ? "bg-slate-200 text-slate-500" : "bg-red-50 text-red-600"}`}>{isRead ? "확인됨" : "미확인"}</em>
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
  refreshJobs,
}: {
  jobs: Job[];
  setView: (v: View) => void;
  open: (j: Job) => void;
  refreshJobs: () => Promise<void>;
}) {
  const [openOffice,setOpenOffice]=useState<string | null>(null);
  const [workflowMode,setWorkflowMode]=useState<WorkflowStep | null>(null);
  const workflowCards = [
    ["접수", jobs.filter((j) => workflowStepOfJob(j) === "접수").length, ClipboardPenLine, "bg-blue-50 text-blue-700"],
    ["출동", jobs.filter((j) => workflowStepOfJob(j) === "출동").length, ToolCase, "bg-amber-50 text-amber-700"],
    ["작업완료", jobs.filter((j) => workflowStepOfJob(j) === "작업완료").length, Wrench, "bg-emerald-50 text-emerald-700"],
    ["정산완료", jobs.filter((j) => workflowStepOfJob(j) === "정산완료").length, CircleDollarSign, "bg-violet-50 text-violet-700"],
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
    { key:"transaction", label:"거래명세서", icon:ReceiptText, color:"bg-violet-50 text-violet-700", iconColor:"bg-violet-600 text-white", children:[{label:"거래명세서 작성",view:"transaction" as View},{label:"작성한 거래명세서 보기",view:"transactionList" as View}] },
    { key:"proposal", label:"제안서", icon:FileSignature, color:"bg-rose-50 text-rose-700", iconColor:"bg-rose-600 text-white", children:[{label:"새 제안서 작성",view:"proposal" as View},{label:"작성한 제안서 보기",view:"proposalList" as View}] },
    { key:"contract", label:"계약서", icon:FileText, color:"bg-cyan-50 text-cyan-700", iconColor:"bg-cyan-600 text-white", children:[{label:"새 계약서 작성",view:"contract"},{label:"작성한 계약서 보기",view:"contractList"}] },
    { key:"spec", label:"사양서", icon:FileCog, color:"bg-amber-50 text-amber-700", iconColor:"bg-amber-500 text-white", children:[{label:"새 사양서 작성",view:"spec"},{label:"작성한 사양서 보기",view:"specList"}] },
    { key:"opinion", label:"소견서", icon:ClipboardPenLine, color:"bg-orange-50 text-orange-700", iconColor:"bg-orange-500 text-white", children:[{label:"새 소견서 작성",view:"opinion"},{label:"작성한 소견서 보기",view:"opinionList"}] },
    { key:"inventory", label:"재고관리", icon:Warehouse, color:"bg-emerald-50 text-emerald-700", iconColor:"bg-emerald-600 text-white", children:[{label:"재고 수량 확보 및 발주"},{label:"렉스코"},{label:"디랙스"}] },
    { key:"sales", label:"매출매입관리", icon:CircleDollarSign, color:"bg-indigo-50 text-indigo-700", iconColor:"bg-indigo-600 text-white", children:[{label:"매출 관리"},{label:"매입 관리"},{label:"입금·미수 확인"}] },
  ];
  if (workflowMode) {
    return <WorkflowStageJobs jobs={jobs} step={workflowMode} open={open} close={() => setWorkflowMode(null)} refreshJobs={refreshJobs} />;
  }
  return (
    <>
      <section className="mt-5 overflow-hidden rounded-[28px] bg-black shadow-lg shadow-slate-900/15">
        <img
          src="/hajin-motto-v2.jpg?v=20260908"
          alt="하진그룹 사훈 일체유심조"
          className="block aspect-[3/1] w-full object-cover"
        />
      </section>
      <section className="mt-4 rounded-[24px] bg-white p-3 shadow-sm">
        <div className="mb-3 px-1 text-center">
          <p className="text-xl font-black text-slate-900">{new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Seoul" }).format(new Date())} 오늘의 일정</p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {workflowCards.map(([label, n, Icon, style]) => (
            <button key={label} type="button" onClick={() => setWorkflowMode(label)} className="touch-manipulation rounded-2xl bg-slate-50 px-2 py-3 text-center ring-1 ring-slate-100 active:scale-[0.98]">
              <div className={`mx-auto grid size-9 place-items-center rounded-xl ${style}`}><Icon size={18} /></div>
              <p className="mt-2 text-xl font-black">{n}<span className="text-xs">건</span></p>
              <p className="mt-0.5 whitespace-nowrap text-[11px] font-black text-slate-600">{label}</p>
            </button>
          ))}
        </div>
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
  const monthCompleted=monthJobs.filter(({job})=>job.status==="처리완료").length;
  const monthIncomplete=monthJobs.length-monthCompleted;
  return <div className="mt-7">
    <button type="button" onClick={expand} className="flex w-full items-center justify-between overflow-hidden rounded-[26px] bg-gradient-to-r from-[#174b91] to-[#2878d5] p-5 text-left text-white shadow-lg shadow-blue-900/15">
      <div className="flex min-w-0 items-center gap-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20">
          <CalendarDays size={28}/>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-blue-100">{month}월 등록 일정 {monthJobs.length}건</p>
          <p className="mt-1 text-xl font-black">{month}월 일정 달력 크게보기</p>
          <p className="mt-1 text-xs font-bold text-blue-100">{month}월 총완료 {monthCompleted}건, 미완료 {monthIncomplete}건</p>
        </div>
      </div>
      <ChevronRight className="shrink-0" size={24}/>
    </button>
  </div>;
}

function CalendarScreen({jobs,open,close}:{jobs:Job[];open:(j:Job)=>void;close:()=>void}) {
  const todayKey=koreaDateKey();
  const initialDate=jobs.map(job=>scheduleOf(job.date).dateKey).find(Boolean)||todayKey;
  const [year,setYear]=useState(Number(initialDate.slice(0,4)));
  const [month,setMonth]=useState(Number(initialDate.slice(5,7)));
  const [calendarZoom,setCalendarZoom]=useState(0.35);
  const [selectedDate,setSelectedDate]=useState<string|null>(null);
  const [viewport,setViewport]=useState({width:390,height:800});
  const pinchDistance=useRef<number|null>(null);
  const pinchZoom=useRef(0.35);
  const detailTouchStart=useRef<{x:number;y:number}|null>(null);
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
  const openSelectedDate=(dateKey:string)=>{
    window.history.pushState(
      { ...window.history.state, hajinView:"calendar", hajinCalendarDate:dateKey },
      "",
    );
    setSelectedDate(dateKey);
  };
  const closeSelectedDate=()=>{
    if(window.history.state?.hajinCalendarDate){
      window.history.back();
    }else{
      setSelectedDate(null);
    }
  };
  useEffect(()=>{
    const handleCalendarBack=(event:PopStateEvent)=>{
      if(event.state?.hajinView==="calendar" && !event.state?.hajinCalendarDate){
        setSelectedDate(null);
        window.scrollTo({top:0,left:0,behavior:"auto"});
      }
    };
    window.addEventListener("popstate",handleCalendarBack);
    return ()=>window.removeEventListener("popstate",handleCalendarBack);
  },[]);
  const moveSelectedDate=(amount:number)=>{
    if(!selectedDate) return;
    const [currentYear,currentMonth,currentDay]=selectedDate.split("-").map(Number);
    const next=new Date(currentYear,currentMonth-1,currentDay+amount);
    const nextKey=`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,"0")}-${String(next.getDate()).padStart(2,"0")}`;
    setSelectedDate(nextKey);
    if(window.history.state?.hajinCalendarDate){
      window.history.replaceState(
        { ...window.history.state, hajinView:"calendar", hajinCalendarDate:nextKey },
        "",
      );
    }
    setYear(next.getFullYear());
    setMonth(next.getMonth()+1);
    window.scrollTo({top:0,left:0,behavior:"auto"});
  };
  const startDetailSwipe=(event:React.TouchEvent<HTMLElement>)=>{
    if(event.touches.length!==1){ detailTouchStart.current=null; return; }
    detailTouchStart.current={x:event.touches[0].clientX,y:event.touches[0].clientY};
  };
  const endDetailSwipe=(event:React.TouchEvent<HTMLElement>)=>{
    const start=detailTouchStart.current;
    detailTouchStart.current=null;
    if(!start||event.changedTouches.length!==1) return;
    const end=event.changedTouches[0];
    const dx=end.clientX-start.x;
    const dy=end.clientY-start.y;
    if(Math.abs(dx)<60||Math.abs(dx)<=Math.abs(dy)*1.2) return;
    moveSelectedDate(dx<0?1:-1);
  };
  if(selectedDate){
    const selectedJobs=schedules
      .filter(({schedule})=>schedule.dateKey===selectedDate)
      .sort((a,b)=>{
        const aDone=a.job.status==="처리완료";
        const bDone=b.job.status==="처리완료";
        if(aDone!==bDone) return aDone?1:-1;
        return timeOrder(a.schedule.time)-timeOrder(b.schedule.time);
      });
    const completed=selectedJobs.filter(({job})=>job.status==="처리완료").length;
    const incomplete=selectedJobs.length-completed;
    const [sy,sm,sd]=selectedDate.split("-").map(Number);
    const weekday=weekdays[new Date(sy,sm-1,sd).getDay()];
    const holiday=holidayOf(selectedDate);
    return <section onTouchStart={startDetailSwipe} onTouchEnd={endDetailSwipe} className="min-h-[100dvh] py-1" style={{touchAction:"pan-y"}}>
      <div className="sticky top-0 z-10 mb-3 flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
        <button type="button" onClick={closeSelectedDate} className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-black text-slate-700">← 달력</button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-black">{sy}년 {sm}월 {sd}일 ({weekday})</h2>
          {holiday&&<p className="mt-0.5 text-xs font-black text-rose-600">{holiday}</p>}
          <p className="mt-0.5 text-[11px] font-bold text-slate-400">← 이전 날짜 · 좌우로 밀어 이동 · 다음 날짜 →</p>
        </div>
      </div>
      <section className="mb-4 rounded-3xl bg-gradient-to-r from-[#174b91] to-[#2878d5] p-5 text-white shadow-lg shadow-blue-900/15">
        <p className="text-sm font-bold text-blue-100">선택 날짜 일정</p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div><span className="text-3xl font-black">총 {selectedJobs.length}건</span></div>
          <div className="text-right text-sm font-black text-blue-100"><p>완료 {completed}건</p><p>미완료 {incomplete}건</p></div>
        </div>
      </section>
      <div className="space-y-3 pb-8">
        {selectedJobs.map(({job,schedule})=><button key={job.id} type="button" onClick={()=>open(job)} className={`w-full rounded-2xl border px-4 py-3 text-left shadow-sm ${job.status==="처리완료"?"border-emerald-200 bg-emerald-50":"border-slate-200 bg-white"}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`shrink-0 text-lg font-black ${job.status==="처리완료"?"text-emerald-800":"text-slate-950"}`}>{displayTime(schedule.time)}</span>
                <h3 className="truncate text-base font-black">{job.company||"고객사 미입력"}</h3>
              </div>
              <p className="mt-1 truncate text-xs font-bold text-slate-500">{job.site||"현장 위치 미입력"} · {job.machine||"장비 미입력"}</p>
              <p className="mt-1 truncate text-sm font-bold text-slate-800">{job.worker||"미배정"} · {job.issue||"내용 없음"}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${badge[job.status]}`}>{job.status}</span>
              <ChevronRight size={17} className="text-blue-700"/>
            </div>
          </div>
        </button>)}
        {selectedJobs.length===0&&<div className="rounded-3xl bg-white px-5 py-12 text-center shadow-sm"><CalendarDays className="mx-auto text-slate-300" size={34}/><p className="mt-3 text-sm font-black text-slate-500">등록된 일정이 없습니다</p></div>}
      </div>
    </section>;
  }
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
              return <div key={dateKey} role="button" tabIndex={0} onClick={()=>openSelectedDate(dateKey)} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" ") openSelectedDate(dateKey);}} style={{minHeight:weekHeight}} className={`min-w-0 cursor-pointer rounded-2xl border shadow-sm transition active:scale-[0.99] ${today?"border-blue-400 bg-blue-50":holiday?"border-rose-200 bg-rose-50":"border-slate-200 bg-white"}`}>
                <div style={holiday?{color:"#dc2626"}:undefined} className={`px-2 py-2 text-center font-black ${holiday||column===0?"text-rose-600":column===6?"text-blue-600":"text-slate-900"} ${today?"bg-gradient-to-r from-blue-200 to-sky-100":holiday?"bg-gradient-to-r from-rose-100 to-orange-50":"bg-gradient-to-r from-slate-100 to-blue-50"}`}>
                  <span className="block text-[22px] font-black leading-none">{day}</span>
                  {holiday&&<span className="mt-1 block truncate text-[14px] font-black leading-none">{holiday}</span>}
                </div>
                <div className="space-y-1 p-1.5">
                  {dayJobs.map(({job,schedule})=><button key={job.id} type="button" onClick={(event)=>{event.stopPropagation();setSelectedDate(dateKey);}} title={`${displayTime(schedule.time)} / ${job.site||"장소 미입력"} / ${job.worker||"미배정"}`} className={`block w-full rounded-lg border-l-4 px-1.5 py-1 text-left text-[11px] font-black leading-[1.15] shadow-sm ${job.status==="처리완료"?"border-emerald-500 bg-emerald-50 text-emerald-700":"border-blue-500 bg-blue-50 text-slate-900"}`}>
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
  const [intakePhotos,setIntakePhotos]=useState<File[]>([]);
  const [submitting,setSubmitting]=useState(false);
  const [previewUrls,setPreviewUrls]=useState<string[]>([]);

  useEffect(()=>{
    const urls=intakePhotos.map(file=>URL.createObjectURL(file));
    setPreviewUrls(urls);
    return ()=>urls.forEach(url=>URL.revokeObjectURL(url));
  },[intakePhotos]);

  const appendIntakePhotos=(files:File[])=>{
    const images=files.filter(file=>file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name));
    if(!images.length) return;
    setIntakePhotos(current=>[...current,...images].slice(0,10));
  };

  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(submitting) return;
    const form=event.currentTarget;
    const data=new FormData(form);
    data.delete("intake_photos");
    intakePhotos.forEach(file=>data.append("intake_photos",file,file.name));
    setSubmitting(true);
    try{
      await add(data);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-5">
      <section className="rounded-3xl bg-white p-4 shadow-sm">
        <div className="mb-4">
          <p className="text-sm font-black text-slate-500">신규 접수</p>
          <h2 className="mt-1 text-xl font-black">A/S 접수 등록</h2>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-bold">
              고객사 *
              <select value={companyChoice} onChange={(e)=>setCompanyChoice(e.target.value)} className="input appearance-none" required>
                <option value="">고객사 선택</option>
                <option value="하진">하진</option>
                <option value="렉스코">렉스코</option>
                <option value="디랙스">디랙스</option>
                <option value="기타">기타</option>
              </select>
              <input type="hidden" name="company" value={companyChoice==="기타"?otherCompany:companyChoice}/>
            </label>
            <Field n="worker" l="출동기사" p="기사명" />
          </div>
          {companyChoice==="기타"&&<label className="block text-sm font-bold">기타 고객사 *<input value={otherCompany} onChange={(e)=>setOtherCompany(e.target.value)} placeholder="고객사명을 입력하세요" className="input" required/></label>}
          <Field n="site" l="출동장소" p="현장 위치" />
          <div className="grid grid-cols-2 gap-3">
            <Field n="manager" l="담당자 이름" p="담당자명" />
            <Field n="phone" l="담당자 연락처" p="010-0000-0000" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-bold">출동 날짜 *<input name="date" type="date" defaultValue={koreaDateKey()} className="input" required/></label>
            <label className="text-sm font-bold">출동 시간 *<select name="time" defaultValue="" className="input appearance-none" required><option value="" disabled>시간 선택</option>{Array.from({length:13},(_,index)=>index+8).map(hour=><option key={hour} value={`${String(hour).padStart(2,"0")}:00`}>{hour}시</option>)}</select></label>
          </div>
          <Field n="machine" l="장비명 / 모델" p="예: DRAX 런닝머신" />
          <label className="block text-sm font-bold">고장원인 *<textarea name="issue" rows={3} placeholder="접수된 고장 증상" className="input resize-none" required/></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-bold">필요장비 / 부품<textarea name="requiredEquipment" rows={4} placeholder="현장에서 필요한 장비·부품" className="input resize-none" /></label>
            <label className="block text-sm font-bold">전달 및 특이사항<textarea name="specialNotes" rows={4} placeholder="출입방법·주차·고객 요청사항" className="input resize-none" /></label>
          </div>
          <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <b className="text-sm text-blue-800">접수사진 추가</b>
                <p className="mt-0.5 text-[11px] font-bold text-blue-600">{intakePhotos.length ? `총 ${intakePhotos.length}장 선택됨` : "필요할 때만 추가"}</p>
              </div>
              <div className="flex gap-2">
                <label className="cursor-pointer rounded-xl bg-white px-3 py-2 text-xs font-black text-blue-700 shadow-sm">촬영<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e)=>{appendIntakePhotos(Array.from(e.target.files||[])); e.currentTarget.value="";}}/></label>
                <label className="cursor-pointer rounded-xl bg-white px-3 py-2 text-xs font-black text-blue-700 shadow-sm">갤러리<input type="file" accept="image/*" multiple className="sr-only" onChange={(e)=>{appendIntakePhotos(Array.from(e.target.files||[])); e.currentTarget.value="";}}/></label>
              </div>
            </div>
            {previewUrls.length>0&&<div className="mt-3 grid grid-cols-4 gap-2">
              {previewUrls.map((url,index)=><div key={url} className="relative aspect-square overflow-hidden rounded-xl bg-white">
                <img src={url} alt={`접수사진 ${index+1}`} className="h-full w-full object-cover"/>
                <button type="button" onClick={()=>setIntakePhotos(current=>current.filter((_,i)=>i!==index))} className="absolute right-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-black text-white">×</button>
              </div>)}
            </div>}
          </div>
          <button disabled={submitting} className="w-full rounded-2xl bg-[#1855a6] py-3.5 text-sm font-black text-white shadow-md disabled:bg-slate-300">{submitting?"등록 중...":"A/S 접수 등록"}</button>
        </div>
      </section>
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
function WorkflowStageJobs({ jobs, step, open, close, refreshJobs }: { jobs: Job[]; step: WorkflowStep; open: (j: Job) => void; close: () => void; refreshJobs: () => Promise<void>; }) {
  const visible = jobs.filter((job) => workflowStepOfJob(job) === step).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const [scheduleJob,setScheduleJob]=useState<Job|null>(null);
  const [scheduleDate,setScheduleDate]=useState("");
  const [scheduleTime,setScheduleTime]=useState("");
  const [savingSchedule,setSavingSchedule]=useState(false);
  const [workerJob,setWorkerJob]=useState<Job|null>(null);
  const [worker1,setWorker1]=useState("");
  const [worker2,setWorker2]=useState("");
  const [savingWorker,setSavingWorker]=useState(false);
  const [photoMap,setPhotoMap]=useState<Record<string,{name:string;url:string}[]>>({});
  const descriptions: Record<WorkflowStep,string> = {
    "접수":"접수 후 일정·견적을 확인할 업무",
    "출동":"일정이 잡혀 준비·출동·현장 작업 중인 업무",
    "작업완료":"수리는 끝났고 입금·거래명세서 정리가 남은 업무",
    "정산완료":"입금 확인과 거래명세서 발송까지 끝난 업무",
  };
  useEffect(()=>{
    let cancelled=false;
    const load=async()=>{
      const entries=await Promise.all(visible.map(async(job)=>{
        const folder=`${job.dbId}/접수사진`;
        const {data,error}=await supabase.storage.from("as-job-photos").list(folder,{limit:30,sortBy:{column:"created_at",order:"asc"}});
        if(error) return [String(job.dbId),[]] as const;
        const files=(data||[]).filter(item=>item.name && item.name!==".emptyFolderPlaceholder");
        const photos=(await Promise.all(files.map(async item=>{
          const path=`${folder}/${item.name}`;
          const {data:signed}=await supabase.storage.from("as-job-photos").createSignedUrl(path,60*60);
          return signed?.signedUrl?{name:item.name,url:signed.signedUrl}:null;
        }))).filter((x): x is {name:string;url:string}=>Boolean(x));
        return [String(job.dbId),photos] as const;
      }));
      if(!cancelled) setPhotoMap(Object.fromEntries(entries));
    };
    void load();
    return()=>{cancelled=true;};
  },[visible.map(j=>j.dbId).join(",")]);
  const beginSchedule=(job:Job)=>{
    const sc=scheduleOf(String(job.date||""));
    setScheduleJob(job); setScheduleDate(sc.dateKey||""); setScheduleTime(sc.time||"");
  };
  const saveQuickSchedule=async()=>{
    if(!scheduleJob || !scheduleDate) return;
    setSavingSchedule(true);
    const {error}=await supabase.from("as_jobs").update({visit_note:joinVisitMeta(scheduleDate,scheduleTime,scheduleJob.requiredEquipment,scheduleJob.specialNotes)}).eq("id",scheduleJob.dbId);
    setSavingSchedule(false);
    if(error){ window.alert("일정 변경에 실패했습니다."); return; }
    setScheduleJob(null);
    await refreshJobs();
  };
  const splitWorkers=(value:string)=>{
    const parts=String(value||"").split(/\s*(?:\/|,|·|&|\+|그리고)\s*/).map(v=>v.trim()).filter(Boolean);
    return [parts[0]||"",parts[1]||""];
  };
  const beginWorkerChange=(job:Job)=>{
    const [first,second]=splitWorkers(job.worker);
    setWorkerJob(job);
    setWorker1(first);
    setWorker2(second);
  };
  const saveQuickWorker=async()=>{
    if(!workerJob) return;
    const names=[worker1.trim(),worker2.trim()].filter(Boolean).slice(0,2);
    if(!names.length){ window.alert("출동기사를 1명 이상 입력해주세요."); return; }
    setSavingWorker(true);
    const {error}=await supabase.from("as_jobs").update({worker:names.join(" / ")}).eq("id",workerJob.dbId);
    setSavingWorker(false);
    if(error){ window.alert("출동기사 변경에 실패했습니다."); return; }
    setWorkerJob(null);
    await refreshJobs();
  };
  return <div className="mt-5">
    <div className="mb-4 flex items-center gap-3">
      <button type="button" onClick={close} className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white shadow-sm"><ChevronLeft size={20}/></button>
      <div><h2 className="text-xl font-black">{step}</h2><p className="mt-0.5 text-xs text-slate-500">{descriptions[step]} · 총 {visible.length}건</p></div>
    </div>
    <div className="space-y-3">
      {visible.length===0 ? <div className="rounded-2xl bg-white p-8 text-center text-sm font-bold text-slate-400">해당 단계의 업무가 없습니다.</div> : visible.map(job => {
        const schedule=scheduleOf(String(job.date||""));
        const accent=companyAccent(job.company);
        const photos=photoMap[String(job.dbId)]||[];
        return <div key={String(job.dbId||job.id)} className="relative w-full overflow-hidden rounded-2xl bg-white p-4 pl-5 text-left shadow-sm">
          <span className={`absolute inset-y-0 left-0 w-1.5 ${accent.bar}`}></span>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ${accent.tag}`}>{job.company || "기타"}</span>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <b className="block text-base">{schedule.dateKey || "날짜 미정"} · {displayTime(schedule.time)}</b>
                <button type="button" onClick={()=>beginSchedule(job)} className="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-black text-blue-700"><CalendarDays size={14}/>일정변경</button>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={()=>beginWorkerChange(job)} className="max-w-[150px] truncate rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-700 shadow-sm" title="출동기사 변경">출동기사 · {job.worker || "미배정"}</button>
              <span className="shrink-0 rounded-full bg-blue-600 px-3 py-1.5 text-[11px] font-black text-white shadow-sm">{step === "접수" ? "출동" : step}</span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-[1fr_112px] gap-3">
            <button type="button" onClick={()=>open(job)} className="min-w-0 text-left">
              <div className="space-y-1.5 text-sm">
                <p><span className="font-black text-slate-500">출동장소</span> · <b>{job.site || "미입력"}</b></p>
                <p><span className="font-black text-slate-500">고장원인</span> · <b>{job.issue || "미입력"}</b></p>
                <p><span className="font-black text-slate-500">담당자</span> · <b>{job.manager || "미입력"}</b>{job.phone ? ` · ${job.phone}` : ""}</p>
              </div>
            </button>
            <div className="relative min-h-[104px] overflow-hidden rounded-2xl bg-slate-100">
              {photos.length ? <>
                <img src={photos[0].url} alt="접수사진" className="h-full min-h-[104px] w-full object-cover"/>
                <button type="button" onClick={()=>window.open(photos[0].url,"_blank")} className="absolute inset-0" aria-label="접수사진 보기"></button>
                <span className="absolute bottom-2 right-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-black text-white">사진 {photos.length}장</span>
              </> : <button type="button" onClick={()=>open(job)} className="flex h-full min-h-[104px] w-full flex-col items-center justify-center gap-1 text-xs font-black text-slate-400"><ImageIcon size={24}/><span>사진 없음</span></button>}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="min-h-[54px] rounded-xl bg-slate-50 p-2.5"><span className="block font-black text-slate-500">필요장비</span><b className="mt-1 block break-words">{job.requiredEquipment || "미입력"}</b></div>
            <div className="min-h-[54px] rounded-xl bg-slate-50 p-2.5"><span className="block font-black text-slate-500">전달 및 특이사항</span><b className="mt-1 block break-words">{job.specialNotes || "미입력"}</b></div>
          </div>
        </div>;
      })}
    </div>
    {workerJob && <div className="fixed inset-0 z-[105] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-[24px] bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between"><div><p className="text-xs font-black text-blue-600">출동기사 변경</p><h3 className="mt-1 text-lg font-black">{workerJob.company} 출동기사</h3></div><button type="button" onClick={()=>setWorkerJob(null)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black">취소</button></div>
        <p className="mt-2 text-xs text-slate-500">기사 1명 또는 최대 2명까지 지정할 수 있습니다.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <label className="text-xs font-black text-slate-600">출동기사 1<input value={worker1} onChange={e=>setWorker1(e.target.value)} className="input mt-1" placeholder="기사명" /></label>
          <label className="text-xs font-black text-slate-600">출동기사 2<input value={worker2} onChange={e=>setWorker2(e.target.value)} className="input mt-1" placeholder="선택 입력" /></label>
        </div>
        <button type="button" disabled={savingWorker} onClick={saveQuickWorker} className="mt-4 w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-black text-white disabled:bg-slate-300">{savingWorker?"변경 중...":"출동기사 변경 저장"}</button>
      </div>
    </div>}
    {scheduleJob && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-[24px] bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between"><div><p className="text-xs font-black text-blue-600">일정변경</p><h3 className="mt-1 text-lg font-black">{scheduleJob.company} 방문 일정</h3></div><button type="button" onClick={()=>setScheduleJob(null)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black">취소</button></div>
        <div className="mt-4 grid grid-cols-2 gap-2"><label className="text-xs font-black text-slate-600">날짜<input type="date" value={scheduleDate} onChange={e=>setScheduleDate(e.target.value)} className="input mt-1"/></label><label className="text-xs font-black text-slate-600">시간<input type="time" value={scheduleTime} onChange={e=>setScheduleTime(e.target.value)} className="input mt-1"/></label></div>
        <button type="button" disabled={savingSchedule} onClick={saveQuickSchedule} className="mt-4 w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-black text-white disabled:bg-slate-300">{savingSchedule?"변경 중...":"일정 변경 저장"}</button>
      </div>
    </div>}
  </div>;
}

function TodayJobs({
  jobs,
  mode,
  open,
  close,
}: {
  jobs: Job[];
  mode: "visit" | "pending" | "complete";
  open: (j: Job) => void;
  close: () => void;
}) {
  const todayKey = koreaDateKey();
  const visible = jobs
    .filter((job) => {
      const schedule = scheduleOf(String(job.date || ""));
      if (schedule.dateKey !== todayKey) return false;
      if (mode === "pending") return job.status !== "처리완료";
      if (mode === "complete") return job.status === "처리완료";
      return true;
    })
    .sort((a, b) => {
      const at = timeOrder(scheduleOf(String(a.date || "")).time);
      const bt = timeOrder(scheduleOf(String(b.date || "")).time);
      return at - bt;
    });

  const title = mode === "visit" ? "접수등록완료" : mode === "pending" ? "미처리" : "작업완료";
  const subtitle = mode === "visit"
    ? "오늘 접수 등록된 전체 일정"
    : mode === "pending"
      ? "오늘 일정 중 아직 완료되지 않은 업무"
      : "오늘 일정 중 작업 완료된 업무";

  return (
    <div className="mt-5">
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={close}
          className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white shadow-sm"
          aria-label="홈으로 돌아가기"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0">
          <h2 className="text-xl font-black text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle} · 총 {visible.length}건</p>
        </div>
      </div>

      <div className="space-y-3">
        {visible.map((job) => {
          const schedule = scheduleOf(String(job.date || ""));
          const statusClass = badge[job.status] || "bg-slate-100 text-slate-700";
          return (
            <button
              key={String(job.dbId || job.id)}
              type="button"
              onClick={() => open(job)}
              className="w-full rounded-2xl bg-white p-4 text-left shadow-sm active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <b className="truncate text-base">{displayTime(schedule.time)}</b>
                    <span className="truncate font-black">{job.company || "고객사 미정"}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">{job.site || "현장 미정"} · {job.machine || "장비 미정"}</p>
                  <p className="mt-2 truncate text-sm font-bold text-slate-700">{job.issue || "접수 내용 없음"}</p>
                  <p className="mt-1 text-xs text-slate-500">출동기사 {job.worker || "미배정"}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${statusClass}`}>{job.status || "접수"}</span>
              </div>
            </button>
          );
        })}
        {visible.length === 0 && <Empty text="해당하는 오늘 일정이 없습니다" />}
      </div>
    </div>
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
  jobs,
  update,
  save,
  saveSchedule,
  saveJob,
  deleteJob,
  uploadPhotos,
  openEstimate,
  openTransaction,
}: {
  job: Job;
  jobs: Job[];
  update: (s: Status) => Promise<void>;
  save: (v: string) => Promise<void>;
  saveSchedule: (site:string,date:string,time:string) => Promise<void>;
  saveJob: (values:{company:string;site:string;manager:string;phone:string;machine:string;issue:string;date:string;time:string;worker:string;requiredEquipment:string;specialNotes:string;}) => Promise<Job | null>;
  deleteJob: () => Promise<boolean>;
  uploadPhotos: (category:string,files:File[]) => Promise<boolean>;
  openEstimate: () => void;
  openTransaction: () => void;
}) {
  const schedule = scheduleOf(job.date || "");
  const receiptDate = (() => {
    const d = new Date(job.createdAt);
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}${mm}${dd}`;
  })();
  const receiptSequence = (() => {
    const sameDay = jobs
      .filter((item) => {
        const d = new Date(item.createdAt);
        const yy = String(d.getFullYear()).slice(-2);
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yy}${mm}${dd}` === receiptDate;
      })
      .sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());
    const index = sameDay.findIndex((item)=>item.dbId===job.dbId);
    return String(index >= 0 ? index + 1 : 1).padStart(3, "0");
  })();
  const receiptNo = `AS-${receiptDate}-${receiptSequence}`;
  const [edit,setEdit]=useState({
    company:job.company,site:job.site,manager:job.manager,phone:job.phone,machine:job.machine,issue:job.issue,
    date:schedule.dateKey || koreaDateKey(),time:/^\d{1,2}:\d{2}$/.test(schedule.time)?schedule.time:"",worker:job.worker,
    requiredEquipment:job.requiredEquipment || "",specialNotes:job.specialNotes || "",
  });
  const [value, setValue] = useState(job.resolution);
  const [photos,setPhotos]=useState<Record<string,File[]>>({});
  const [intakePhotos,setIntakePhotos]=useState<File[]>([]);
  const [intakePreviewUrls,setIntakePreviewUrls]=useState<string[]>([]);
  const [storedIntakePhotos,setStoredIntakePhotos]=useState<{name:string;url:string}[]>([]);
  const [loadingStoredPhotos,setLoadingStoredPhotos]=useState(false);
  const [workflow,setWorkflow]=useState<JobWorkflow>(()=>readWorkflow(job.dbId));
  const [finishing,setFinishing]=useState(false);
  const [savingEdit,setSavingEdit]=useState(false);
  const saveWorkflow=(patch:Partial<JobWorkflow>)=>{
    const next={...workflow,...patch};
    setWorkflow(next); writeWorkflow(job.dbId,next);
  };
  useEffect(() => {
    const nextSchedule=scheduleOf(job.date || "");
    setEdit({company:job.company,site:job.site,manager:job.manager,phone:job.phone,machine:job.machine,issue:job.issue,date:nextSchedule.dateKey||koreaDateKey(),time:/^\d{1,2}:\d{2}$/.test(nextSchedule.time)?nextSchedule.time:"",worker:job.worker,requiredEquipment:job.requiredEquipment||"",specialNotes:job.specialNotes||""});
    setValue(job.resolution);
    setPhotos({});
    setIntakePhotos([]);
    setWorkflow(readWorkflow(job.dbId));
  }, [job.dbId, job.resolution, job.company, job.site, job.manager, job.phone, job.machine, job.issue, job.date, job.worker, job.requiredEquipment, job.specialNotes]);

  useEffect(()=>{
    const urls=intakePhotos.map(file=>URL.createObjectURL(file));
    setIntakePreviewUrls(urls);
    return ()=>urls.forEach(url=>URL.revokeObjectURL(url));
  },[intakePhotos]);

  const loadStoredIntakePhotos=useCallback(async()=>{
    setLoadingStoredPhotos(true);
    try{
      const folder=`${job.dbId}/접수사진`;
      const {data,error}=await supabase.storage.from("as-job-photos").list(folder,{limit:100,sortBy:{column:"created_at",order:"asc"}});
      if(error){ setStoredIntakePhotos([]); return; }
      const files=(data||[]).filter(item=>item.name && item.name!==".emptyFolderPlaceholder");
      if(!files.length){ setStoredIntakePhotos([]); return; }
      const result=await Promise.all(files.map(async item=>{
        const path=`${folder}/${item.name}`;
        const {data:signed}=await supabase.storage.from("as-job-photos").createSignedUrl(path,60*60);
        return signed?.signedUrl ? {name:item.name,url:signed.signedUrl} : null;
      }));
      setStoredIntakePhotos(result.filter((item): item is {name:string;url:string}=>Boolean(item)));
    } finally {
      setLoadingStoredPhotos(false);
    }
  },[job.dbId]);

  useEffect(()=>{ void loadStoredIntakePhotos(); },[loadStoredIntakePhotos]);

  const setField=(key:keyof typeof edit,value:string)=>setEdit(current=>({...current,[key]:value}));
  const appendFiles=(category:string,files:File[])=>setPhotos(current=>({...current,[category]:[...(current[category]||[]),...files]}));
  const saveEdits=async()=>{
    if(savingEdit) return null;
    setSavingEdit(true);
    try{
      const next=await saveJob(edit, true);
      if(!next) return null;
      if(intakePhotos.length){
        const newPhotoCount=intakePhotos.length;
        const photoSaved=await uploadPhotos("접수사진",intakePhotos);
        if(photoSaved===false) return null;
        setIntakePhotos([]);
        await loadStoredIntakePhotos();
        say(`수정 내용과 접수사진 ${newPhotoCount}장이 서버에 저장됐습니다`);
      } else {
        say("접수 내용을 수정했습니다");
      }
      return next;
    } finally { setSavingEdit(false); }
  };
  const moveToDispatch=async()=>{
    const next=await saveEdits();
    if(!next) return;
    await update("방문예정");
    saveWorkflow({step:"출동"});
  };
  const finishWork=async()=>{
    if(finishing) return;
    setFinishing(true);
    try{
      await save(value);
      for(const category of ["작업 전","작업 후"]){
        const files=photos[category]||[];
        if(files.length){
          const photoSaved=await uploadPhotos(category,files);
          if(photoSaved===false) return;
        }
      }
      await update("처리완료");
      saveWorkflow({step:"작업완료"});
      setPhotos({});
    } finally { setFinishing(false); }
  };

  return (
    <div className="mt-5 space-y-4">
      <section className="rounded-3xl bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-slate-500">접수번호 {receiptNo}</p>
            <h2 className="mt-1 text-xl font-black">A/S 접수 수정</h2>
          </div>
          {workflow.step === "접수" ? (
            <button type="button" onClick={()=>void moveToDispatch()} disabled={savingEdit} className="shrink-0 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-md ring-2 ring-blue-200 active:bg-blue-700 disabled:bg-slate-300 disabled:ring-0">출동</button>
          ) : (
            <span className="shrink-0 rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">{workflow.step}</span>
          )}
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-bold">고객사<input value={edit.company} onChange={e=>setField("company",e.target.value)} className="input" placeholder="하진 / 렉스코 / 디랙스 / 기타" /></label>
            <label className="text-sm font-bold">출동기사<input value={edit.worker} onChange={e=>setField("worker",e.target.value)} className="input" placeholder="기사명" /></label>
          </div>
          <label className="block text-sm font-bold">출동장소<input value={edit.site} onChange={e=>setField("site",e.target.value)} className="input" placeholder="현장 위치" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-bold">담당자 이름<input value={edit.manager} onChange={e=>setField("manager",e.target.value)} className="input" placeholder="담당자명" /></label>
            <label className="text-sm font-bold">담당자 연락처<input value={edit.phone} onChange={e=>setField("phone",e.target.value)} className="input" placeholder="010-0000-0000" /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-bold">출동 날짜<input type="date" value={edit.date} onChange={e=>setField("date",e.target.value)} className="input" /></label>
            <label className="text-sm font-bold">출동 시간<select value={edit.time} onChange={e=>setField("time",e.target.value)} className="input appearance-none"><option value="">시간 선택</option>{Array.from({length:13},(_,index)=>index+8).map(hour=><option key={hour} value={`${String(hour).padStart(2,"0")}:00`}>{hour}시</option>)}</select></label>
          </div>
          <label className="block text-sm font-bold">장비명 / 모델<input value={edit.machine} onChange={e=>setField("machine",e.target.value)} className="input" placeholder="예: DRAX 런닝머신" /></label>
          <label className="block text-sm font-bold">고장원인<textarea value={edit.issue} onChange={e=>setField("issue",e.target.value)} rows={3} className="input resize-none" placeholder="접수된 고장 증상" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-bold">필요장비 / 부품<textarea value={edit.requiredEquipment} onChange={e=>setField("requiredEquipment",e.target.value)} rows={4} className="input resize-none" placeholder="현장에서 필요한 장비·부품" /></label>
            <label className="block text-sm font-bold">전달 및 특이사항<textarea value={edit.specialNotes} onChange={e=>setField("specialNotes",e.target.value)} rows={4} className="input resize-none" placeholder="출입방법·주차·고객 요청사항" /></label>
          </div>
          <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <b className="text-sm text-blue-800">접수사진</b>
                <p className="mt-0.5 text-[11px] font-bold text-blue-600">{intakePhotos.length ? `새 사진 ${intakePhotos.length}장 선택됨 · 저장 전` : storedIntakePhotos.length ? `서버 저장 완료 · ${storedIntakePhotos.length}장` : "필요할 때만 추가"}</p>
              </div>
              <div className="flex gap-2">
                <label className="cursor-pointer rounded-xl bg-white px-3 py-2 text-xs font-black text-blue-700 shadow-sm">촬영<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={e=>{appendIntakePhotos(Array.from(e.target.files||[]));e.currentTarget.value="";}}/></label>
                <label className="cursor-pointer rounded-xl bg-white px-3 py-2 text-xs font-black text-blue-700 shadow-sm">갤러리<input type="file" accept="image/*" multiple className="sr-only" onChange={e=>{appendIntakePhotos(Array.from(e.target.files||[]));e.currentTarget.value="";}}/></label>
              </div>
            </div>
            {loadingStoredPhotos&&<p className="mt-3 text-xs font-bold text-slate-400">사진 불러오는 중...</p>}
            {storedIntakePhotos.length>0&&<div className="mt-3 grid grid-cols-4 gap-2">
              {storedIntakePhotos.map((photo,index)=><button type="button" key={photo.name} onClick={()=>window.open(photo.url,"_blank","noopener,noreferrer")} className="aspect-square overflow-hidden rounded-xl bg-white shadow-sm">
                <img src={photo.url} alt={`저장된 접수사진 ${index+1}`} className="h-full w-full object-cover"/>
              </button>)}
            </div>}
            {intakePreviewUrls.length>0&&<div className="mt-3">
              <p className="mb-2 text-[11px] font-black text-blue-700">새로 추가할 사진</p>
              <div className="grid grid-cols-4 gap-2">
                {intakePreviewUrls.map((url,index)=><div key={url} className="relative aspect-square overflow-hidden rounded-xl bg-white">
                  <img src={url} alt={`새 접수사진 ${index+1}`} className="h-full w-full object-cover"/>
                  <button type="button" onClick={()=>setIntakePhotos(current=>current.filter((_,i)=>i!==index))} className="absolute right-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-black text-white">×</button>
                </div>)}
              </div>
            </div>}
          </div>
          <button type="button" onClick={()=>void saveEdits()} disabled={savingEdit} className="w-full rounded-2xl bg-slate-900 py-3.5 text-sm font-black text-white disabled:bg-slate-300">{savingEdit?"저장 중...":"수정 내용 저장"}</button>
          <button type="button" onClick={()=>void deleteJob()} className="w-full rounded-2xl border border-rose-200 bg-rose-50 py-3 text-sm font-black text-rose-600">접수건 삭제</button>
        </div>
      </section>

      {workflow.step !== "접수" && <Box t="현장 작업 처리">
        <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold leading-5 text-blue-800">현장직은 작업내용과 사진만 남기고 마지막에 작업완료를 한 번 누르면 됩니다.</p>
        <textarea value={value} onChange={(e)=>setValue(e.target.value)} rows={4} placeholder="고장 원인 · 조치 내용 · 교체 부품을 간단히 입력하세요" className="input resize-none" />
        <div className="grid grid-cols-2 gap-3">
          {["작업 전","작업 후"].map((category,index)=>{
            const selected=photos[category]||[];
            return <div key={category} className={`rounded-2xl border-2 border-dashed p-3 text-center ${index===0?"border-blue-200 bg-blue-50 text-blue-700":"border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
              <Camera size={24} className="mx-auto"/><b className="mt-2 block text-sm">{category}</b>
              <span className="mt-1 block text-[11px] font-bold">{selected.length?`${selected.length}장 선택됨`:"선택사항"}</span>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <label className="cursor-pointer rounded-lg bg-white px-2 py-2 text-[11px] font-black shadow-sm">촬영<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e)=>appendFiles(category,Array.from(e.target.files||[]))}/></label>
                <label className="cursor-pointer rounded-lg bg-white px-2 py-2 text-[11px] font-black shadow-sm">갤러리<input type="file" accept="image/*" multiple className="sr-only" onClick={(e)=>{e.currentTarget.value=""}} onChange={(e)=>appendFiles(category,Array.from(e.target.files||[]))}/></label>
              </div>
            </div>;
          })}
        </div>
        <button type="button" disabled={finishing} onClick={()=>void finishWork()} className="w-full rounded-2xl bg-emerald-600 py-4 text-base font-black text-white shadow-sm disabled:bg-slate-300">{finishing?"저장 중...":"작업완료"}</button>
        <button type="button" onClick={()=>{void save(value); void update("재방문"); saveWorkflow({step:"출동"});}} className="w-full rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600">재방문 필요</button>
      </Box>}

      <details className="rounded-3xl bg-white p-4 shadow-sm">
        <summary className="cursor-pointer list-none text-sm font-black text-slate-700">사무직 지원 · 견적 / 입금 / 거래명세서 <span className="float-right text-slate-400">열기</span></summary>
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={openEstimate} className="rounded-xl bg-blue-600 py-3 text-sm font-black text-white">견적서 작성</button>
            <button type="button" onClick={()=>saveWorkflow({estimateSent:!workflow.estimateSent})} className={`rounded-xl border py-3 text-sm font-black ${workflow.estimateSent?"border-emerald-300 bg-emerald-50 text-emerald-700":"border-slate-200"}`}>{workflow.estimateSent?"✓ 견적 발송완료":"견적 발송 체크"}</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(["미입금","일부입금","입금완료"] as const).map(x=><button key={x} type="button" onClick={()=>saveWorkflow({paymentStatus:x})} className={`rounded-xl border py-2.5 text-xs font-black ${workflow.paymentStatus===x?"border-blue-600 bg-blue-50 text-blue-700":"border-slate-200"}`}>{x}</button>)}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={openTransaction} disabled={workflow.paymentStatus!=="입금완료"} className="rounded-xl bg-violet-600 py-3 text-sm font-black text-white disabled:bg-slate-300">거래명세서 작성</button>
            <button type="button" onClick={()=>saveWorkflow({transactionSent:!workflow.transactionSent})} disabled={workflow.paymentStatus!=="입금완료"} className={`rounded-xl border py-3 text-sm font-black disabled:opacity-40 ${workflow.transactionSent?"border-emerald-300 bg-emerald-50 text-emerald-700":"border-slate-200"}`}>{workflow.transactionSent?"✓ 발송완료":"발송 체크"}</button>
          </div>
          <button type="button" disabled={!(job.status==="처리완료"&&workflow.paymentStatus==="입금완료"&&workflow.transactionSent)} onClick={()=>saveWorkflow({step:"정산완료"})} className="w-full rounded-xl bg-slate-900 py-3 text-sm font-black text-white disabled:bg-slate-300">정산완료 · 최종 마감</button>
        </div>
      </details>
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
    const amount=Number(form.get("amount")||0);
    const proposalRow={
      document_type:"proposal" as const,
      company,
      recipient_email:String(form.get("email")||"").trim(),
      item_name:title,
      model_name:String(form.get("category")||"").trim(),
      quantity:1,
      unit_price:amount,
      memo:body,
      created_by:userId,
    };
    const {error}=await supabase.from("business_documents").insert(proposalRow);
    if(error){say("제안서를 저장하지 못했습니다");return}
    const savedAt=new Date().toISOString();
    cacheBusinessDocuments([{
      id:`local-${savedAt}-proposal`,document_type:"proposal",company:proposalRow.company,recipient_email:proposalRow.recipient_email,
      item_name:proposalRow.item_name,model_name:proposalRow.model_name,quantity:1,unit_price:proposalRow.unit_price,memo:proposalRow.memo,created_at:savedAt,
    }]);
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
  const [query,setQuery]=useState("");
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      const local=readLocalBusinessDocuments().filter(row=>row.document_type==="proposal");
      const {data,error}=await supabase.from("business_documents")
        .select("id,document_type,company,recipient_email,item_name,model_name,quantity,unit_price,memo,created_at")
        .eq("document_type","proposal")
        .order("created_at",{ascending:false});
      if(!active) return;
      if(error){
        setDocuments(local);
        setError(local.length?"":"작성한 제안서를 불러오지 못했습니다");
      }else{
        setDocuments(mergeBusinessDocuments((data??[]) as BusinessDocument[],local));
        setError("");
      }
      setLoading(false);
    };
    void load();
    const onVisible=()=>{ if(document.visibilityState==="visible") void load(); };
    window.addEventListener("focus",load);
    document.addEventListener("visibilitychange",onVisible);
    return()=>{active=false;window.removeEventListener("focus",load);document.removeEventListener("visibilitychange",onVisible)};
  },[]);
  if(loading) return <div className="mt-5 rounded-3xl bg-white p-8 text-center text-sm font-bold text-slate-500 shadow-sm">제안서를 불러오는 중입니다</div>;
  if(error) return <div className="mt-5 rounded-3xl bg-rose-50 p-6 text-center text-sm font-bold text-rose-700">{error}</div>;
  const filtered=useMemo(()=>{
    const keyword=query.trim().toLowerCase();
    if(!keyword) return documents;
    return documents.filter(document=>[
      document.company,document.item_name,document.model_name,document.memo,document.created_at,
    ].join(" ").toLowerCase().includes(keyword));
  },[documents,query]);
  if(!documents.length) return <div className="mt-5"><Empty text="아직 작성된 제안서가 없습니다"/></div>;
  return <div className="mt-5 space-y-3">
    <label className="relative block"><Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={19}/><input value={query} onChange={event=>setQuery(event.target.value)} className="input !mt-0" style={{paddingLeft:"3.25rem"}} placeholder="제안처·제안 제목·구분·내용 검색"/></label>
    <p className="text-sm font-bold text-slate-500">총 {documents.length}개 중 {filtered.length}개의 제안서가 조회됩니다</p>
    {!filtered.length&&<Empty text="검색 조건에 맞는 제안서가 없습니다"/>}
    {filtered.map(document=>{
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
          <button type="button" onClick={async()=>{if(await deleteBusinessDocuments([document],"제안서")) setDocuments(current=>current.filter(row=>String(row.id)!==String(document.id)));}} className="mt-3 w-full rounded-xl border border-rose-200 bg-rose-50 py-3 text-sm font-black text-rose-600">제안서 삭제</button>
        </div>
      </details>;
    })}
  </div>;
}
type SimpleOfficeType="contract"|"spec"|"opinion";
const simpleOfficeMeta:Record<SimpleOfficeType,{label:string;party:string;title:string;category:string;color:string}>={
  contract:{label:"계약서",party:"계약처",title:"계약명",category:"계약 구분",color:"cyan"},
  spec:{label:"사양서",party:"제출처",title:"사양서 제목",category:"제품·설비 구분",color:"amber"},
  opinion:{label:"소견서",party:"제출처",title:"소견서 제목",category:"소견 구분",color:"orange"},
};
function SimpleOfficeForm({type,userId,say,openList}:{type:SimpleOfficeType;userId:string;say:(s:string)=>void;openList:()=>void}){
  const meta=simpleOfficeMeta[type];
  const [saved,setSaved]=useState(false);
  const [lastExport,setLastExport]=useState<OfficeExportData|null>(null);
  const save=async(form:FormData)=>{
    const company=String(form.get("company")||"").trim();
    const title=String(form.get("title")||"").trim();
    const body=String(form.get("body")||"").trim();
    if(!company||!title||!body){say(`${meta.party}, ${meta.title}, 상세 내용을 입력해주세요`);return}
    const amount=Number(form.get("amount")||0);
    const date=String(form.get("written_date")||koreaDateKey());
    const category=String(form.get("category")||"").trim();
    const simpleRow={
      document_type:type,company,recipient_email:String(form.get("email")||"").trim(),
      item_name:title,model_name:category,quantity:1,unit_price:amount,memo:body,created_by:userId,
    };
    const {error}=await supabase.from("business_documents").insert(simpleRow);
    if(error){say(`${meta.label}를 저장하지 못했습니다`);return}
    const savedAt=new Date().toISOString();
    cacheBusinessDocuments([{
      id:`local-${savedAt}-${type}`,document_type:type,company:simpleRow.company,recipient_email:simpleRow.recipient_email,
      item_name:simpleRow.item_name,model_name:simpleRow.model_name,quantity:1,unit_price:simpleRow.unit_price,memo:simpleRow.memo,created_at:savedAt,
    }]);
    setLastExport({title:meta.label,company,date,headers:[meta.title,meta.category,"상세 내용","금액"],rows:[[title,category||"-",body,`${amount.toLocaleString()}원`]]});
    setSaved(true);say(`${meta.label}가 저장됐습니다`);
  };
  return <form action={save} className="mt-5 space-y-4">
    <Box t={`${meta.label} 기본정보`}>
      <label className="block text-sm font-bold">작성일<input name="written_date" type="date" defaultValue={koreaDateKey()} className="input"/></label>
      <Field n="company" l={`${meta.party} *`} p={`${meta.party}를 입력하세요`}/>
      <Field n="email" l="담당자 이메일" p="example@company.com"/>
      <Field n="title" l={`${meta.title} *`} p={`${meta.title}을 입력하세요`}/>
      <Field n="category" l={meta.category} p={`${meta.category}을 입력하세요`}/>
    </Box>
    <Box t="상세 내용">
      <label className="block text-sm font-bold">내용 *<textarea name="body" rows={10} className="input resize-none" placeholder="문서 내용을 입력하세요"/></label>
      <label className="block text-sm font-bold">관련 금액<input name="amount" type="number" min="0" className="input" placeholder="0"/></label>
    </Box>
    <button className="w-full rounded-2xl bg-[#1855a6] py-4 font-black text-white shadow-lg">{meta.label} 저장</button>
    {saved&&<>{lastExport&&<OfficeExportButtons data={lastExport}/>}<button type="button" onClick={openList} className="w-full rounded-2xl bg-blue-50 py-4 font-black text-blue-700">작성한 {meta.label} 보기</button></>}
  </form>;
}
function SimpleOfficeList({type}:{type:SimpleOfficeType}){
  const meta=simpleOfficeMeta[type];
  const [documents,setDocuments]=useState<BusinessDocument[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      const local=readLocalBusinessDocuments().filter(row=>row.document_type===type);
      const {data,error}=await supabase.from("business_documents")
        .select("id,document_type,company,recipient_email,item_name,model_name,quantity,unit_price,memo,created_at")
        .eq("document_type",type).order("created_at",{ascending:false});
      if(!active)return;
      if(error){
        setDocuments(local);
        setError(local.length?"":`작성한 ${meta.label}를 불러오지 못했습니다`);
      }else{
        setDocuments(mergeBusinessDocuments((data??[]) as BusinessDocument[],local));
        setError("");
      }
      setLoading(false);
    };
    void load();
    const onVisible=()=>{ if(document.visibilityState==="visible") void load(); };
    window.addEventListener("focus",load);
    document.addEventListener("visibilitychange",onVisible);
    return()=>{active=false;window.removeEventListener("focus",load);document.removeEventListener("visibilitychange",onVisible)};
  },[type,meta.label]);
  const filtered=useMemo(()=>{
    const keyword=query.trim().toLowerCase();
    if(!keyword)return documents;
    return documents.filter(document=>[
      document.company,document.item_name,document.model_name,document.memo,document.recipient_email,document.created_at,
    ].join(" ").toLowerCase().includes(keyword));
  },[documents,query]);
  if(loading)return <div className="mt-5 rounded-3xl bg-white p-8 text-center text-sm font-bold text-slate-500 shadow-sm">{meta.label}를 불러오는 중입니다</div>;
  if(error)return <div className="mt-5 rounded-3xl bg-rose-50 p-6 text-center text-sm font-bold text-rose-700">{error}</div>;
  if(!documents.length)return <div className="mt-5"><Empty text={`아직 작성된 ${meta.label}가 없습니다`}/></div>;
  return <div className="mt-5 space-y-3">
    <label className="relative block"><Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={19}/><input value={query} onChange={event=>setQuery(event.target.value)} className="input !mt-0" style={{paddingLeft:"3.25rem"}} placeholder={`${meta.party}·${meta.title}·구분·내용 검색`}/></label>
    <p className="text-sm font-bold text-slate-500">총 {documents.length}개 중 {filtered.length}개의 {meta.label}가 조회됩니다</p>
    {!filtered.length&&<Empty text={`검색 조건에 맞는 ${meta.label}가 없습니다`}/>}
    {filtered.map(document=>{
      const writtenAt=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(document.created_at));
      const exportData:OfficeExportData={title:meta.label,company:document.company,date:writtenAt,headers:[meta.title,meta.category,"상세 내용","금액"],rows:[[document.item_name,document.model_name||"-",document.memo,`${Number(document.unit_price).toLocaleString()}원`]]};
      return <details key={document.id} className="group overflow-hidden rounded-[22px] bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><FileText size={21}/></span><span className="min-w-0 flex-1"><b className="block truncate">{document.item_name}</b><small className="mt-1 block text-xs text-slate-500">{document.company} · {writtenAt}</small></span><ChevronRight className="shrink-0 transition group-open:rotate-90" size={18}/></summary>
        <div className="border-t border-slate-100 bg-slate-50 p-4 text-sm"><p className="font-bold text-slate-500">{meta.category}</p><p className="mt-1 font-black">{document.model_name||"구분 없음"}</p><p className="mt-4 font-bold text-slate-500">상세 내용</p><p className="mt-1 whitespace-pre-wrap leading-6">{document.memo}</p><p className="mt-4 flex justify-between rounded-xl bg-blue-50 p-3 font-black text-blue-700"><span>관련 금액</span><span>{Number(document.unit_price).toLocaleString()}원</span></p><OfficeExportButtons data={exportData}/><button type="button" onClick={async()=>{if(await deleteBusinessDocuments([document],meta.label)) setDocuments(current=>current.filter(row=>String(row.id)!==String(document.id)));}} className="mt-3 w-full rounded-xl border border-rose-200 bg-rose-50 py-3 text-sm font-black text-rose-600">{meta.label} 삭제</button></div>
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
const previewOfficeDocument=(data:OfficeExportData)=>{
  const popup=window.open("","_blank","width=900,height=1000");
  if(!popup){window.alert("문서 보기 창을 열 수 없습니다. 팝업 차단을 해제해주세요.");return;}
  popup.document.write(officeExportHtml(data).replace("</body>",'<div class="actions"><button onclick="window.print()">인쇄 · PDF 저장</button></div></body>'));
  popup.document.close();
  popup.focus();
};
function OfficeExportButtons({data}:{data:OfficeExportData}){
  return <div className="mt-3 grid grid-cols-2 gap-2">
    <button type="button" onClick={()=>previewOfficeDocument(data)} className="rounded-xl bg-slate-800 px-2 py-3 text-xs font-black text-white">문서 보기</button>
    <button type="button" onClick={()=>exportOfficeDocument("pdf",data)} className="rounded-xl bg-[#1855a6] px-2 py-3 text-xs font-black text-white">PDF 출력</button>
    <button type="button" onClick={()=>exportOfficeDocument("hangul",data)} className="rounded-xl bg-emerald-600 px-2 py-3 text-xs font-black text-white">한글 출력</button>
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
function EstimateList({type}:{type:"estimate"|"transaction"}){
  const documentLabel=type==="estimate"?"견적서":"거래명세서";
  const [documents,setDocuments]=useState<BusinessDocument[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      const local=readLocalBusinessDocuments().filter(row=>row.document_type===type);
      const {data,error}=await supabase.from("business_documents")
        .select("id,document_type,company,recipient_email,item_name,model_name,quantity,unit_price,memo,created_at")
        .eq("document_type",type)
        .order("created_at",{ascending:false});
      if(!active) return;
      if(error){
        setDocuments(local);
        setError(local.length?"":`작성한 ${documentLabel}를 불러오지 못했습니다`);
      }else{
        const remote=(data??[]) as BusinessDocument[];
        setDocuments(mergeBusinessDocuments(remote,local));
        setError("");
      }
      setLoading(false);
    };
    void load();
    const onVisible=()=>{ if(document.visibilityState==="visible") void load(); };
    window.addEventListener("focus",load);
    document.addEventListener("visibilitychange",onVisible);
    return()=>{ active=false; window.removeEventListener("focus",load); document.removeEventListener("visibilitychange",onVisible); };
  },[type,documentLabel]);
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
  if(loading) return <div className="mt-5 rounded-3xl bg-white p-8 text-center text-sm font-bold text-slate-500 shadow-sm">{documentLabel}를 불러오는 중입니다</div>;
  if(error) return <div className="mt-5 rounded-3xl bg-rose-50 p-6 text-center text-sm font-bold text-rose-700">{error}</div>;
  if(!groups.length) return <div className="mt-5"><Empty text={`아직 작성된 ${documentLabel}가 없습니다`}/></div>;
  return <div className="mt-5 space-y-3">
    <label className="relative block">
      <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={19}/>
      <input value={query} onChange={event=>setQuery(event.target.value)} className="input !mt-0" style={{paddingLeft:"3.25rem"}} placeholder={`${documentLabel} 거래처·품목·모델명 검색`}/>
    </label>
    <p className="text-sm font-bold text-slate-500">총 {groups.length}개 중 {filteredGroups.length}개의 {documentLabel}가 조회됩니다</p>
    {!filteredGroups.length&&<Empty text={`검색 조건에 맞는 ${documentLabel}가 없습니다`}/>}
    {filteredGroups.map((items,index)=>{
      const first=items[0];
      const supply=items.reduce((sum,item)=>sum+Number(item.quantity)*Number(item.unit_price),0);
      const total=supply+Math.round(supply*.1);
      const writtenAt=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(first.created_at));
      const exportData:OfficeExportData={
        title:documentLabel,company:first.company,date:writtenAt,
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
          <button type="button" onClick={async()=>{if(await deleteBusinessDocuments(items,documentLabel)) {const ids=new Set(items.map(item=>String(item.id))); setDocuments(current=>current.filter(row=>!ids.has(String(row.id))));}}} className="mt-3 w-full rounded-xl border border-rose-200 bg-rose-50 py-3 text-sm font-black text-rose-600">{documentLabel} 삭제</button>
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
    const savedAt=new Date().toISOString();
    const localRows:BusinessDocument[]=rows.map((row,index)=>({
      id:`local-${savedAt}-${index}`,document_type:row.document_type,company:row.company,recipient_email:row.recipient_email,
      item_name:row.item_name,model_name:row.model_name,quantity:row.quantity,unit_price:row.unit_price,memo:row.memo,created_at:savedAt,
    }));
    cacheBusinessDocuments(localRows);
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
  if(type==="transaction") return <form action={save} className="mt-5 space-y-4"><Box t={`${label} 작성`}><Field n="company" l="거래처 *" p="예: 한강센트럴자이"/><Field n="email" l="받는 사람 이메일" p="example@company.com"/><Field n="item_name" l="품목 *" p="예: 런닝머신 벨트"/><Field n="model_name" l="모델명" p="예: DRAX DX-3000"/><Field n="quantity" l="수량" p="1"/><Field n="unit_price" l="단가" p="0"/><label className="block text-sm font-bold">비고<textarea name="memo" rows={3} className="input resize-none" placeholder="추가 내용을 입력하세요"/></label></Box><button className="w-full rounded-2xl bg-[#1855a6] py-4 font-black text-white shadow-lg">{label} 저장</button>{saved&&<>{lastExport&&<OfficeExportButtons data={lastExport}/>} {openEstimateList&&<button type="button" onClick={openEstimateList} className="w-full rounded-2xl bg-violet-50 py-4 font-black text-violet-700">작성한 거래명세서 보기</button>}</>}</form>;

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
