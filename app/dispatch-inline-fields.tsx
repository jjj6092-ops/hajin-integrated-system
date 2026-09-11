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

    const mergeWorkInfoBoxes = (card: HTMLElement) => {
      if (card.dataset.hajinWorkInfoMerged === "true") return;

      const labels = Array.from(card.querySelectorAll("span"));
      const requiredLabel = labels.find((node) => node.textContent?.trim() === "필요장비");
      const specialLabel = labels.find((node) => node.textContent?.trim() === "전달 및 특이사항");
      if (!requiredLabel || !specialLabel) return;

      const requiredBox = requiredLabel.parentElement as HTMLElement | null;
      const specialBox = specialLabel.parentElement as HTMLElement | null;
      const grid = requiredBox?.parentElement as HTMLElement | null;
      if (!requiredBox || !specialBox || !grid || specialBox.parentElement !== grid) return;

      const requiredValue = requiredBox.querySelector("b")?.textContent?.trim() || "";
      const specialValue = specialBox.querySelector("b")?.textContent?.trim() || "";
      const values = [requiredValue, specialValue].filter((value, index, list) => value && value !== "미입력" && list.indexOf(value) === index);

      const merged = document.createElement("div");
      merged.dataset.hajinWorkInfoBox = "true";
      merged.className = "min-h-[54px] rounded-xl bg-slate-50 p-2.5";

      const title = document.createElement("span");
      title.className = "block font-black text-slate-500";
      title.textContent = "작업내용 및 특이사항";

      const value = document.createElement("b");
      value.className = "mt-1 block break-words";
      value.textContent = values.length ? values.join(" · ") : "미입력";

      merged.append(title, value);
      grid.replaceChildren(merged);
      grid.className = "mt-3 grid grid-cols-1 gap-2 text-xs";
      card.dataset.hajinWorkInfoMerged = "true";
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
              const { data } = await supabase.from("as_jobs").select("id,status,visit_note").eq("id", id).maybeSingle();
              if (data) return data as { id: number; status?: string; visit_note?: string };
            }
          }
        } catch {}
      }

      const cardText = card.innerText || "";
      const { data, error } = await supabase
        .from("as_jobs")
        .select("id,company,site,worker,visit_note,status,created_at")
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

    const displayTime = (time: string) => {
      const match = time.match(/^(\d{1,2}):(\d{2})$/);
      if (!match) return time;
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      return minute === 0 ? `${hour}시` : `${hour}시${minute}분`;
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
        if (!card) continue;

        mergeWorkInfoBoxes(card);

        if (card.dataset.hajinRevisitReady === "true") continue;
        card.dataset.hajinRevisitReady = "true";

        card.querySelectorAll('[data-hajin-dispatch-panel="true"]').forEach((node) => node.remove());

        const row = await resolveJob(card);
        if (!row) continue;
        const schedule = scheduleParts(String(row.visit_note || ""));

        const dateBold = Array.from(card.querySelectorAll("b")).find((node) => /\d{4}-\d{2}-\d{2}/.test(node.textContent || "")) as HTMLElement | undefined;
        if (!dateBold || card.querySelector('[data-hajin-revisit-control="true"]')) continue;

        const control = document.createElement("span");
        control.dataset.hajinRevisitControl = "true";
        control.className = "ml-2 inline-flex flex-wrap items-center gap-1 align-middle";
        control.addEventListener("click", (event) => event.stopPropagation());
        control.addEventListener("pointerdown", (event) => event.stopPropagation());

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

        const timeInput = document.createElement("input");
        timeInput.type = "time";
        timeInput.value = schedule.time;
        timeInput.step = "3600";
        timeInput.className = "hidden w-[88px] rounded-lg border border-violet-200 bg-white px-2 py-1 text-[11px] font-black text-slate-700";

        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.textContent = "저장";
        saveButton.className = "hidden rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-black text-white";

        const toggleInputs = () => {
          const show = check.checked;
          dateInput.classList.toggle("hidden", !show);
          timeInput.classList.toggle("hidden", !show);
          saveButton.classList.toggle("hidden", !show);
        };
        toggleInputs();
        check.addEventListener("change", toggleInputs);

        saveButton.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!dateInput.value) { window.alert("재방문 날짜를 선택해주세요."); return; }
          if (!timeInput.value) { window.alert("재방문 시간을 선택해주세요."); return; }

          saveButton.disabled = true;
          saveButton.textContent = "저장중";
          try {
            const nextVisit = `${dateInput.value} ${timeInput.value}${schedule.suffix}`;
            const { error } = await supabase.from("as_jobs").update({ visit_note: nextVisit, status: "재방문" }).eq("id", row.id);
            if (error) throw error;

            try {
              const all = JSON.parse(localStorage.getItem(WORKFLOW_KEY) || "{}");
              all[String(row.id)] = { ...(all[String(row.id)] || {}), step: "출동" };
              localStorage.setItem(WORKFLOW_KEY, JSON.stringify(all));
            } catch {}

            row.status = "재방문";
            row.visit_note = nextVisit;
            const currentText = dateBold.textContent || "";
            dateBold.textContent = currentText
              .replace(/\d{4}-\d{2}-\d{2}/, dateInput.value)
              .replace(/\d{1,2}시(?:\d{1,2}분)?/, displayTime(timeInput.value));
            saveButton.textContent = "저장됨";
            window.setTimeout(() => { if (saveButton.isConnected) saveButton.textContent = "저장"; }, 1200);
          } catch {
            window.alert("재방문 일정 저장에 실패했습니다.");
            saveButton.textContent = "저장";
          } finally {
            saveButton.disabled = false;
          }
        });

        control.append(label, dateInput, timeInput, saveButton);
        dateBold.insertAdjacentElement("afterend", control);
      }
    };

    const observer = new MutationObserver(() => { void decorate(); });
    observer.observe(document.body, { childList: true, subtree: true });
    void decorate();

    return () => observer.disconnect();
  }, []);

  return null;
}
