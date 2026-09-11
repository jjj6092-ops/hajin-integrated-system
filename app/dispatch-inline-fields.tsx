"use client";

import { useEffect } from "react";
import { supabase } from "./supabase";

const WORKFLOW_KEY = "hajin_job_workflow_v1";
const META = "|||HAJIN_META|||";

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
              const { data } = await supabase.from("as_jobs").select("id,resolution,status,visit_note").eq("id", id).maybeSingle();
              if (data) return data as { id: number; resolution?: string; status?: string; visit_note?: string };
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
      return { action, parts };
    };

    const buildResolution = (action: string, parts: string, oldValue = "") => {
      const oldRevisit = String(oldValue).match(/(?:^|\n)재방문:\s*([^\n]*)/)?.[1]?.trim() || "";
      return [
        `조치내용: ${action.trim()}`,
        `교체부품: ${parts.trim()}`,
        oldRevisit ? `재방문: ${oldRevisit}` : "",
      ].filter(Boolean).join("\n");
    };

    const scheduleParts = (visitNote: string) => {
      const raw = String(visitNote || "");
      const [schedule, ...rest] = raw.split(META);
      const match = schedule.trim().match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?/);
      return {
        date: match?.[1] || "",
        time: match?.[2] || "10:00",
        suffix: rest.length ? `${META}${rest.join(META)}` : "",
      };
    };

    const createField = (labelText: string, placeholder: string) => {
      const wrap = document.createElement("label");
      wrap.className = "block min-w-0";
      const label = document.createElement("span");
      label.className = "mb-1 block text-[11px] font-black text-slate-600";
      label.textContent = labelText;
      const input = document.createElement("input");
      input.className = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-400";
      input.setAttribute("placeholder", placeholder);
      wrap.append(label, input);
      return { wrap, input };
    };

    const decorate = async () => {
      const heading = findDispatchHeading();
      if (!heading) return;
      const root = heading.parentElement?.parentElement?.parentElement || document.body;
      const workCompleteMarks = Array.from(root.querySelectorAll("button,span")).filter(
        (node) => node.textContent?.trim() === "작업완료" && visible(node as HTMLElement),
      );

      for (const mark of workCompleteMarks) {
        const card = findCard(mark);
        if (!card || card.dataset.hajinDispatchFields === "true") continue;
        card.dataset.hajinDispatchFields = "true";

        const row = await resolveJob(card);
        if (!row) continue;

        const parsed = parseResolution(String(row.resolution || ""));
        const schedule = scheduleParts(String(row.visit_note || ""));

        // 날짜/시간 옆에 재방문 체크 + 날짜 선택
        const dateBold = Array.from(card.querySelectorAll("b")).find((node) => /\d{4}-\d{2}-\d{2}/.test(node.textContent || "")) as HTMLElement | undefined;
        if (dateBold && !card.querySelector('[data-hajin-revisit-control="true"]')) {
          const control = document.createElement("span");
          control.dataset.hajinRevisitControl = "true";
          control.className = "ml-2 inline-flex flex-wrap items-center gap-1 align-middle";

          const label = document.createElement("label");
          label.className = "inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2 py-1 text-[11px] font-black text-violet-700";
          const check = document.createElement("input");
          check.type = "checkbox";
          check.className = "size-3.5 accent-violet-600";
          check.checked = String(row.status || "") === "재방문";
          label.append(check, document.createTextNode("재방문"));

          const dateInput = document.createElement("input");
          dateInput.type = "date";
          dateInput.value = schedule.date;
          dateInput.className = "hidden rounded-lg border border-violet-200 bg-white px-2 py-1 text-[11px] font-black text-slate-700";

          const applyButton = document.createElement("button");
          applyButton.type = "button";
          applyButton.textContent = "적용";
          applyButton.className = "hidden rounded-lg bg-violet-600 px-2 py-1 text-[11px] font-black text-white";

          const toggleDate = () => {
            const show = check.checked;
            dateInput.classList.toggle("hidden", !show);
            applyButton.classList.toggle("hidden", !show);
          };
          toggleDate();
          check.addEventListener("change", toggleDate);

          applyButton.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!dateInput.value) { window.alert("재방문 날짜를 선택해주세요."); return; }
            applyButton.disabled = true;
            applyButton.textContent = "저장";
            try {
              const nextVisit = `${dateInput.value} ${schedule.time}${schedule.suffix}`;
              const { error } = await supabase.from("as_jobs").update({ visit_note: nextVisit, status: "재방문" }).eq("id", row.id);
              if (error) throw error;
              try {
                const all = JSON.parse(localStorage.getItem(WORKFLOW_KEY) || "{}");
                all[String(row.id)] = { ...(all[String(row.id)] || {}), step: "출동" };
                localStorage.setItem(WORKFLOW_KEY, JSON.stringify(all));
              } catch {}
              const currentText = dateBold.textContent || "";
              dateBold.textContent = currentText.replace(/\d{4}-\d{2}-\d{2}/, dateInput.value);
              applyButton.textContent = "완료";
              window.setTimeout(() => { if (applyButton.isConnected) applyButton.textContent = "적용"; }, 1200);
            } catch {
              window.alert("재방문 날짜 저장에 실패했습니다.");
              applyButton.textContent = "적용";
            } finally {
              applyButton.disabled = false;
            }
          });

          control.append(label, dateInput, applyButton);
          dateBold.insertAdjacentElement("afterend", control);
        }

        // 하단 입력은 조치내용 + 교체부품만 한 줄에 компакт하게
        const panel = document.createElement("div");
        panel.dataset.hajinDispatchPanel = "true";
        panel.className = "mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5";
        panel.addEventListener("click", (event) => event.stopPropagation());
        panel.addEventListener("pointerdown", (event) => event.stopPropagation());

        const fields = document.createElement("div");
        fields.className = "grid grid-cols-2 gap-2";
        const action = createField("조치내용", "예: 장력 조정 완료");
        const parts = createField("교체부품", "예: 벨트 1EA");
        action.input.value = parsed.action;
        parts.input.value = parsed.parts;
        fields.append(action.wrap, parts.wrap);

        const footer = document.createElement("div");
        footer.className = "mt-2 flex items-center justify-between gap-2";
        const status = document.createElement("span");
        status.className = "min-w-0 text-[11px] font-bold text-slate-500";
        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.className = "shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white";
        saveButton.textContent = "저장";
        footer.append(status, saveButton);
        panel.append(fields, footer);
        card.appendChild(panel);

        saveButton.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          saveButton.disabled = true;
          saveButton.textContent = "저장중";
          try {
            const resolution = buildResolution(action.input.value, parts.input.value, String(row.resolution || ""));
            const { error } = await supabase.from("as_jobs").update({ resolution }).eq("id", row.id);
            if (error) throw error;
            row.resolution = resolution;
            status.textContent = "저장됨";
            saveButton.textContent = "저장";
            window.setTimeout(() => { if (status.isConnected) status.textContent = ""; }, 1200);
          } catch {
            status.textContent = "저장 실패";
            saveButton.textContent = "저장";
          } finally {
            saveButton.disabled = false;
          }
        });
      }
    };

    const observer = new MutationObserver(() => { void decorate(); });
    observer.observe(document.body, { childList: true, subtree: true });
    void decorate();

    return () => observer.disconnect();
  }, []);

  return null;
}
