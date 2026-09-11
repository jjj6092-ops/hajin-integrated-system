"use client";

import { useEffect } from "react";
import { supabase } from "./supabase";

const WORKFLOW_KEY = "hajin_job_workflow_v1";

export default function DispatchInlineFieldsFix() {
  useEffect(() => {
    const visible = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const findCard = (start: Element) => {
      let current: HTMLElement | null = start as HTMLElement;
      while (current && current !== document.body) {
        const text = current.innerText || "";
        if (text.includes("출동기사") && text.includes("필요장비") && text.includes("전달 및 특이사항")) return current;
        current = current.parentElement;
      }
      return null;
    };

    const resolveJob = async (card: HTMLElement) => {
      const image = card.querySelector('img[alt="접수사진"]') as HTMLImageElement | null;
      if (image?.src) {
        try {
          const decoded = decodeURIComponent(new URL(image.src, window.location.origin).pathname);
          const marker = "/as-job-photos/";
          const idx = decoded.indexOf(marker);
          if (idx >= 0) {
            const id = Number(decoded.slice(idx + marker.length).split("/")[0]);
            if (id > 0) {
              const { data } = await supabase.from("as_jobs").select("id,resolution,status").eq("id", id).maybeSingle();
              if (data) return data as any;
            }
          }
        } catch {}
      }

      const text = card.innerText || "";
      const { data, error } = await supabase.from("as_jobs")
        .select("id,company,site,worker,visit_note,resolution,status,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error || !data?.length) return null;

      let best: any = null;
      let bestScore = -1;
      for (const row of data as any[]) {
        let score = 0;
        const company = String(row.company || "").trim();
        const site = String(row.site || "").trim();
        const worker = String(row.worker || "").trim();
        const date = String(row.visit_note || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
        if (company && text.includes(company)) score += 4;
        if (site && text.includes(site)) score += 7;
        if (worker && text.includes(worker)) score += 4;
        if (date && text.includes(date)) score += 6;
        if (score > bestScore) { best = row; bestScore = score; }
      }
      return bestScore >= 6 ? best : null;
    };

    const parseResolution = (value: string) => {
      const text = String(value || "");
      return {
        action: text.match(/(?:^|\n)조치내용:\s*([^\n]*)/)?.[1]?.trim() || (text && !text.includes("조치내용:") ? text.trim() : ""),
        parts: text.match(/(?:^|\n)교체부품:\s*([^\n]*)/)?.[1]?.trim() || "",
        revisit: text.match(/(?:^|\n)재방문:\s*([^\n]*)/)?.[1]?.trim() || "",
      };
    };

    const decorate = async () => {
      const heading = Array.from(document.querySelectorAll("h2")).find(node => node.textContent?.trim() === "출동" && visible(node as HTMLElement));
      if (!heading) return;
      const root = heading.parentElement?.parentElement?.parentElement || document.body;
      const actionLabels = Array.from(root.querySelectorAll("span,button")).filter(el => el.textContent?.trim() === "작업완료" && visible(el as HTMLElement));

      for (const label of actionLabels) {
        const card = findCard(label);
        if (!card || card.querySelector('[data-hajin-dispatch-panel="true"]')) continue;

        const panel = document.createElement("div");
        panel.dataset.hajinDispatchPanel = "true";
        panel.className = "mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-3";
        panel.addEventListener("click", e => e.stopPropagation());
        panel.addEventListener("pointerdown", e => e.stopPropagation());

        const title = document.createElement("div");
        title.className = "mb-3 text-sm font-black text-slate-800";
        title.textContent = "현장 처리 입력";

        const makeField = (labelText: string, placeholder: string, rows = 1) => {
          const wrap = document.createElement("label");
          wrap.className = "mb-3 block";
          const caption = document.createElement("span");
          caption.className = "mb-1.5 block text-xs font-black text-slate-600";
          caption.textContent = labelText;
          const input = rows > 1 ? document.createElement("textarea") : document.createElement("input");
          if (input instanceof HTMLTextAreaElement) input.rows = rows;
          input.className = "w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-900 outline-none";
          input.setAttribute("placeholder", placeholder);
          wrap.append(caption, input);
          return { wrap, input };
        };

        const action = makeField("조치내용", "예: 벨트 장력 조정 및 테스트 완료", 2);
        const parts = makeField("교체부품", "예: 벨트 1EA / 스위치 2EA");
        const revisit = makeField("재방문", "예: 9/18 부품 준비 후 재방문");

        const buttons = document.createElement("div");
        buttons.className = "grid grid-cols-2 gap-2";
        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "rounded-2xl bg-slate-900 py-3 text-sm font-black text-white";
        saveBtn.textContent = "입력내용 저장";
        const revisitBtn = document.createElement("button");
        revisitBtn.type = "button";
        revisitBtn.className = "rounded-2xl bg-violet-600 py-3 text-sm font-black text-white";
        revisitBtn.textContent = "재방문 등록";
        buttons.append(saveBtn, revisitBtn);

        const status = document.createElement("p");
        status.className = "mt-2 text-center text-[11px] font-bold text-slate-500";
        panel.append(title, action.wrap, parts.wrap, revisit.wrap, buttons, status);
        card.appendChild(panel);

        const row = await resolveJob(card);
        if (row?.id) {
          panel.dataset.jobId = String(row.id);
          const parsed = parseResolution(String(row.resolution || ""));
          action.input.value = parsed.action;
          parts.input.value = parsed.parts;
          revisit.input.value = parsed.revisit;
          if (row.status === "재방문") revisitBtn.textContent = "재방문 등록됨";
        }

        const save = async (markRevisit: boolean) => {
          saveBtn.disabled = true;
          revisitBtn.disabled = true;
          status.textContent = "저장 중...";
          try {
            let jobId = Number(panel.dataset.jobId || 0);
            let currentStatus = "방문예정";
            if (!jobId) {
              const resolved = await resolveJob(card);
              if (!resolved?.id) throw new Error("A/S 접수건을 찾지 못했습니다.");
              jobId = Number(resolved.id);
              currentStatus = String(resolved.status || "방문예정");
              panel.dataset.jobId = String(jobId);
            } else {
              const { data } = await supabase.from("as_jobs").select("id,status").eq("id", jobId).maybeSingle();
              currentStatus = String(data?.status || "방문예정");
            }

            const resolution = [`조치내용: ${action.input.value.trim()}`, `교체부품: ${parts.input.value.trim()}`, `재방문: ${revisit.input.value.trim()}`].join("\n");
            const { error } = await supabase.from("as_jobs").update({ resolution, status: markRevisit ? "재방문" : currentStatus }).eq("id", jobId);
            if (error) throw new Error((error as any).message || "저장 실패");

            if (markRevisit) {
              try {
                const all = JSON.parse(localStorage.getItem(WORKFLOW_KEY) || "{}");
                all[String(jobId)] = { ...(all[String(jobId)] || {}), step: "출동" };
                localStorage.setItem(WORKFLOW_KEY, JSON.stringify(all));
              } catch {}
              revisitBtn.textContent = "재방문 등록됨";
            }
            status.textContent = markRevisit ? "재방문으로 등록했습니다." : "저장했습니다.";
            setTimeout(() => { if (status.isConnected) status.textContent = ""; }, 1800);
          } catch (error: any) {
            status.textContent = error?.message || "저장에 실패했습니다.";
          } finally {
            saveBtn.disabled = false;
            revisitBtn.disabled = false;
          }
        };

        saveBtn.addEventListener("click", () => void save(false));
        revisitBtn.addEventListener("click", () => void save(true));
      }
    };

    const observer = new MutationObserver(() => { void decorate(); });
    observer.observe(document.body, { childList: true, subtree: true });
    void decorate();
    return () => observer.disconnect();
  }, []);

  return null;
}
