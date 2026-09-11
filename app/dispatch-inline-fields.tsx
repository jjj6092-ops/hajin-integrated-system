"use client";

import { useEffect } from "react";
import { supabase } from "./supabase";

const WORKFLOW_KEY = "hajin_job_workflow_v1";

export default function DispatchInlineFields() {
  useEffect(() => {
    const visible = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const findDispatchHeading = () =>
      Array.from(document.querySelectorAll("h2")).find(
        (node) => node.textContent?.trim() === "출동" && visible(node as HTMLElement),
      ) as HTMLElement | undefined;

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
      const existingImage = card.querySelector('img[alt="접수사진"]') as HTMLImageElement | null;
      if (existingImage?.src) {
        try {
          const url = new URL(existingImage.src, window.location.origin);
          const decoded = decodeURIComponent(url.pathname);
          const marker = "/as-job-photos/";
          const markerIndex = decoded.indexOf(marker);
          if (markerIndex >= 0) {
            const id = Number(decoded.slice(markerIndex + marker.length).split("/")[0]);
            if (Number.isFinite(id) && id > 0) {
              const { data } = await supabase.from("as_jobs").select("id,resolution,status").eq("id", id).maybeSingle();
              if (data) return data as { id: number; resolution?: string; status?: string };
            }
          }
        } catch {}
      }

      const cardText = card.innerText || "";
      const { data, error } = await supabase
        .from("as_jobs")
        .select("id,company,site,worker,visit_note,resolution,status,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error || !data?.length) return null;

      let best: { row: any; score: number } | null = null;
      for (const row of data as any[]) {
        let score = 0;
        const company = String(row.company || "").trim();
        const site = String(row.site || "").trim();
        const worker = String(row.worker || "").trim();
        const visit = String(row.visit_note || "");
        const date = visit.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
        if (company && cardText.includes(company)) score += 4;
        if (site && cardText.includes(site)) score += 7;
        if (worker && cardText.includes(worker)) score += 4;
        if (date && cardText.includes(date)) score += 6;
        if (!best || score > best.score) best = { row, score };
      }
      return best && best.score >= 6 ? best.row : null;
    };

    const parseResolution = (value: string) => {
      const text = String(value || "").trim();
      const action = text.match(/(?:^|\n)조치내용:\s*([^\n]*)/)?.[1]?.trim() || (text && !text.includes("조치내용:") ? text : "");
      const parts = text.match(/(?:^|\n)교체부품:\s*([^\n]*)/)?.[1]?.trim() || "";
      const revisit = text.match(/(?:^|\n)재방문:\s*([^\n]*)/)?.[1]?.trim() || "";
      return { action, parts, revisit };
    };

    const buildResolution = (action: string, parts: string, revisit: string) =>
      [
        `조치내용: ${action.trim()}`,
        `교체부품: ${parts.trim()}`,
        `재방문: ${revisit.trim()}`,
      ].join("\n");

    const createField = (labelText: string, placeholder: string, multiline = false) => {
      const wrap = document.createElement("label");
      wrap.className = "block";
      const label = document.createElement("span");
      label.className = "mb-1.5 block text-xs font-black text-slate-600";
      label.textContent = labelText;
      const input = multiline ? document.createElement("textarea") : document.createElement("input");
      input.className = "w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-400";
      input.setAttribute("placeholder", placeholder);
      if (input instanceof HTMLTextAreaElement) input.rows = 2;
      wrap.append(label, input);
      return { wrap, input };
    };

    const decorate = async () => {
      const heading = findDispatchHeading();
      if (!heading) return;
      const root = heading.parentElement?.parentElement?.parentElement || document.body;
      const completeButtons = Array.from(root.querySelectorAll("button")).filter(
        (button) => button.textContent?.trim() === "작업완료" && visible(button),
      );

      for (const completeButton of completeButtons) {
        const card = findCard(completeButton);
        if (!card || card.dataset.hajinDispatchFields === "true") continue;
        card.dataset.hajinDispatchFields = "true";

        const panel = document.createElement("div");
        panel.dataset.hajinDispatchPanel = "true";
        panel.className = "mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-3";
        panel.addEventListener("click", (event) => event.stopPropagation());
        panel.addEventListener("pointerdown", (event) => event.stopPropagation());

        const title = document.createElement("div");
        title.className = "mb-3 flex items-center justify-between";
        title.innerHTML = '<span class="text-sm font-black text-slate-800">현장 처리 입력</span><span class="text-[11px] font-bold text-slate-400">상세보기 없이 바로 저장</span>';

        const action = createField("조치내용", "예: 벨트 장력 조정 및 테스트 완료", true);
        const parts = createField("교체부품", "예: 벨트 1EA / 스위치 2EA");
        const revisit = createField("재방문", "예: 9/18 부품 준비 후 재방문");
        action.wrap.classList.add("mb-3");
        parts.wrap.classList.add("mb-3");
        revisit.wrap.classList.add("mb-3");

        const buttons = document.createElement("div");
        buttons.className = "grid grid-cols-2 gap-2";
        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.className = "rounded-2xl bg-slate-900 py-3 text-sm font-black text-white";
        saveButton.textContent = "입력내용 저장";
        const revisitButton = document.createElement("button");
        revisitButton.type = "button";
        revisitButton.className = "rounded-2xl bg-violet-600 py-3 text-sm font-black text-white";
        revisitButton.textContent = "재방문 등록";
        buttons.append(saveButton, revisitButton);

        const status = document.createElement("p");
        status.className = "mt-2 text-center text-[11px] font-bold text-slate-500";

        panel.append(title, action.wrap, parts.wrap, revisit.wrap, buttons, status);
        card.appendChild(panel);

        const row = await resolveJob(card);
        if (row) {
          panel.dataset.jobId = String(row.id);
          const parsed = parseResolution(String(row.resolution || ""));
          action.input.value = parsed.action;
          parts.input.value = parsed.parts;
          revisit.input.value = parsed.revisit;
          if (row.status === "재방문") revisitButton.textContent = "재방문 등록됨";
        }

        const save = async (markRevisit: boolean) => {
          saveButton.disabled = true;
          revisitButton.disabled = true;
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

            const resolution = buildResolution(action.input.value, parts.input.value, revisit.input.value);
            const nextStatus = markRevisit ? "재방문" : currentStatus;
            const { error } = await supabase.from("as_jobs").update({ resolution, status: nextStatus }).eq("id", jobId);
            if (error) throw new Error((error as any).message || "저장 실패");

            if (markRevisit) {
              try {
                const all = JSON.parse(localStorage.getItem(WORKFLOW_KEY) || "{}");
                all[String(jobId)] = { ...(all[String(jobId)] || {}), step: "출동" };
                localStorage.setItem(WORKFLOW_KEY, JSON.stringify(all));
              } catch {}
              revisitButton.textContent = "재방문 등록됨";
            }
            status.textContent = markRevisit ? "재방문으로 등록했습니다." : "저장했습니다.";
            window.setTimeout(() => { if (status.isConnected) status.textContent = ""; }, 1800);
          } catch (error: any) {
            status.textContent = error?.message || "저장에 실패했습니다.";
          } finally {
            saveButton.disabled = false;
            revisitButton.disabled = false;
          }
        };

        saveButton.addEventListener("click", () => void save(false));
        revisitButton.addEventListener("click", () => void save(true));
      }
    };

    const observer = new MutationObserver(() => { void decorate(); });
    observer.observe(document.body, { childList: true, subtree: true });
    void decorate();

    return () => observer.disconnect();
  }, []);

  return null;
}
