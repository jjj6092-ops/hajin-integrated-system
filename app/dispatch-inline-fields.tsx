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

    const compactWorkPhoto = (card: HTMLElement) => {
      const image = card.querySelector('img[alt="접수사진"]') as HTMLImageElement | null;
      if (!image) return;
      const wrap = image.parentElement as HTMLElement | null;
      if (!wrap) return;
      wrap.style.width = "78px";
      wrap.style.height = "88px";
      wrap.style.minWidth = "78px";
      wrap.style.minHeight = "88px";
      wrap.style.maxHeight = "88px";
      wrap.style.flex = "0 0 78px";
      wrap.style.alignSelf = "start";
      wrap.style.marginLeft = "auto";
      wrap.style.borderRadius = "14px";
      wrap.style.overflow = "hidden";
      const detailsRow = wrap.parentElement as HTMLElement | null;
      if (detailsRow) {
        detailsRow.style.gridTemplateColumns = "minmax(0, 1fr) 78px";
        detailsRow.style.gap = "10px";
      }
      image.style.width = "100%";
      image.style.height = "100%";
      image.style.minHeight = "0";
      image.style.objectFit = "cover";
      const plus = wrap.querySelector("button");
      if (plus instanceof HTMLElement) {
        plus.style.width = "30px";
        plus.style.height = "30px";
        plus.style.minWidth = "30px";
      }
      const badge = Array.from(wrap.querySelectorAll("span,div")).find((node) => node.textContent?.trim().startsWith("사진 ")) as HTMLElement | undefined;
      if (badge) {
        badge.style.fontSize = "9px";
        badge.style.padding = "2px 5px";
      }
    };

    const compactCardSpacing = (card: HTMLElement) => {
      card.style.paddingTop = "18px";
      card.style.paddingBottom = "18px";
      card.style.minHeight = "0";
      const children = Array.from(card.children) as HTMLElement[];
      children.forEach((child) => {
        const style = window.getComputedStyle(child);
        if (parseFloat(style.marginTop) > 16) child.style.marginTop = "10px";
        if (parseFloat(style.marginBottom) > 16) child.style.marginBottom = "10px";
      });
    };

    const compactDetailBlock = (card: HTMLElement) => {
      const labels = Array.from(card.querySelectorAll("span,b,p"));
      const start = labels.find((node) => node.textContent?.trim() === "출동장소") as HTMLElement | undefined;
      if (!start) return;
      let block: HTMLElement | null = start.parentElement;
      while (block && block !== card) {
        const text = block.innerText || "";
        if (text.includes("출동장소") && text.includes("고장원인") && text.includes("담당자")) break;
        block = block.parentElement;
      }
      if (!block || block === card) return;
      block.style.marginTop = "10px";
      block.style.marginBottom = "6px";
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
      merged.className = "min-h-[76px] rounded-2xl bg-slate-50 px-3.5 py-3";
      const title = document.createElement("span");
      title.className = "block font-black text-slate-500";
      title.textContent = "작업내용 및 특이사항";
      const value = document.createElement("b");
      value.className = "mt-1 block break-words";
      value.textContent = values.length ? values.join(" · ") : "미입력";
      merged.append(title, value);
      grid.replaceChildren(merged);
      grid.className = "mt-4 grid grid-cols-1 gap-1 text-sm";
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
      const { data, error } = await supabase.from("as_jobs").select("id,company,site,worker,visit_note,status,created_at").order("created_at", { ascending: false }).limit(200);
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
      return { date: match?.[1] || "", time: match?.[2] || "10:00", suffix: rest.length ? `${META}${rest.join(META)}` : "" };
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
      const workCompleteMarks = Array.from(root.querySelectorAll("button,span")).filter((node) => node.textContent?.trim() === "작업완료" && visible(node as HTMLElement));
      for (const mark of workCompleteMarks) {
        const card = findCard(mark);
        if (!card) continue;
        compactCardSpacing(card);
        compactWorkPhoto(card);
        compactDetailBlock(card);
        mergeWorkInfoBoxes(card);
        if (card.dataset.hajinRevisitReady === "true") continue;
        card.dataset.hajinRevisitReady = "true";
        card.querySelectorAll('[data-hajin-dispatch-panel="true"]').forEach((node) => node.remove());
        const row = await resolveJob(card);
        if (!row) continue;
        const schedule = scheduleParts(String(row.visit_note || ""));
        const dateBold = Array.from(card.querySelectorAll("b")).find((node) => /\d{4}-\d{2}-\d{2}/.test(node.textContent || "")) as HTMLElement | undefined;
        if (!dateBold || card.querySelector('[data-hajin-revisit-control="true"]')) continue;

        const control = document.createElement("div");
        control.dataset.hajinRevisitControl = "true";
        control.className = "mt-4 grid w-full grid-cols-[minmax(0,1.35fr)_minmax(0,.78fr)_auto] gap-2";
        control.addEventListener("click", (event) => event.stopPropagation());
        control.addEventListener("pointerdown", (event) => event.stopPropagation());

        const makeIcon = (kind: "calendar" | "clock") => {
          const icon = document.createElement("span");
          icon.className = "pointer-events-none grid size-5 shrink-0 place-items-center text-slate-500";
          icon.innerHTML = kind === "calendar"
            ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18"/><rect x="3" y="4" width="18" height="17" rx="2"/></svg>'
            : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
          return icon;
        };

        const dateWrap = document.createElement("label");
        dateWrap.className = "relative flex min-w-0 items-center gap-2 overflow-hidden rounded-full border border-slate-200 bg-white px-3 shadow-sm";
        const dateText = document.createElement("span");
        dateText.className = "min-w-0 truncate text-[13px] font-black text-slate-800";
        dateText.textContent = schedule.date || "날짜 선택";

        const dateInput = document.createElement("input");
        dateInput.type = "date";
        dateInput.value = schedule.date;
        dateInput.setAttribute("aria-label", "방문 날짜");
        dateInput.className = "absolute inset-0 h-full w-full cursor-pointer opacity-0";
        dateInput.addEventListener("input", () => { dateText.textContent = dateInput.value || "날짜 선택"; });
        dateWrap.append(makeIcon("calendar"), dateText, dateInput);

        const timeWrap = document.createElement("label");
        timeWrap.className = "relative flex min-w-0 items-center gap-1.5 overflow-hidden rounded-full border border-slate-200 bg-white px-2.5 shadow-sm";
        const timeText = document.createElement("span");
        timeText.className = "min-w-0 truncate text-[13px] font-black text-slate-800";
        timeText.textContent = displayTime(schedule.time);

        const timeInput = document.createElement("select");
        timeInput.value = schedule.time;
        timeInput.setAttribute("aria-label", "방문 시간");
        timeInput.className = "absolute inset-0 h-full w-full cursor-pointer opacity-0";
        for (let hour = 0; hour < 24; hour += 1) {
          const option = document.createElement("option");
          option.value = `${String(hour).padStart(2, "0")}:00`;
          option.textContent = `${hour}시`;
          timeInput.append(option);
        }
        timeInput.value = schedule.time.match(/^\d{2}:00$/) ? schedule.time : `${String(Number(schedule.time.split(":")[0]) || 0).padStart(2, "0")}:00`;
        timeText.textContent = displayTime(timeInput.value);
        timeInput.addEventListener("input", () => { timeText.textContent = displayTime(timeInput.value); });
        timeWrap.append(makeIcon("clock"), timeText, timeInput);

        const applyButton = document.createElement("button");
        applyButton.type = "button";
        applyButton.textContent = "방문일정수정";
        applyButton.className = "whitespace-nowrap rounded-full bg-blue-600 px-3 text-[12px] font-black text-white shadow-sm active:scale-[0.98] disabled:bg-blue-300";
        const statusHeight = Math.max(32, Math.round((mark as HTMLElement).getBoundingClientRect().height));
        [dateWrap, timeWrap, applyButton].forEach((element) => {
          element.style.height = `${statusHeight}px`;
          element.style.minHeight = `${statusHeight}px`;
        });
        applyButton.addEventListener("click", async (event) => {
          event.preventDefault(); event.stopPropagation();
          if (!dateInput.value) { window.alert("방문 날짜를 선택해주세요."); return; }
          if (!timeInput.value) { window.alert("방문 시간을 선택해주세요."); return; }
          applyButton.disabled = true; applyButton.textContent = "수정중";
          try {
            const nextVisit = `${dateInput.value} ${timeInput.value}${schedule.suffix}`;
            const { error } = await supabase.from("as_jobs").update({ visit_note: nextVisit }).eq("id", row.id);
            if (error) throw error;
            try {
              const all = JSON.parse(localStorage.getItem(WORKFLOW_KEY) || "{}");
              all[String(row.id)] = { ...(all[String(row.id)] || {}), step: "출동" };
              localStorage.setItem(WORKFLOW_KEY, JSON.stringify(all));
            } catch {}
            row.visit_note = nextVisit;
            const currentText = dateBold.textContent || "";
            dateBold.textContent = currentText.replace(/\d{4}-\d{2}-\d{2}/, dateInput.value).replace(/\d{1,2}시(?:\d{1,2}분)?/, displayTime(timeInput.value));
            applyButton.textContent = "수정완료";
            window.setTimeout(() => { if (applyButton.isConnected) applyButton.textContent = "방문일정수정"; }, 1200);
          } catch {
            window.alert("방문 일정 수정에 실패했습니다."); applyButton.textContent = "방문일정수정";
          } finally { applyButton.disabled = false; }
        });

        control.append(dateWrap, timeWrap, applyButton);
        const dateRow = dateBold.parentElement as HTMLElement | null;
        if (dateRow) {
          dateRow.insertAdjacentElement("afterend", control);
          dateRow.style.display = "none";
        } else {
          dateBold.insertAdjacentElement("afterend", control);
        }
      }
    };

    const observer = new MutationObserver(() => { void decorate(); });
    observer.observe(document.body, { childList: true, subtree: true });
    void decorate();
    return () => observer.disconnect();
  }, []);

  return null;
}
