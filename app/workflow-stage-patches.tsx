"use client";

import { useEffect } from "react";
import { supabase } from "./supabase";

const WORKFLOW_KEY = "hajin_job_workflow_v1";

export default function WorkflowStagePatches() {
  useEffect(() => {
    let advancing = false;

    const visible = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const findStageHeading = () =>
      Array.from(document.querySelectorAll("h2")).find(
        (node) => node.textContent?.trim() === "접수" && visible(node as HTMLElement),
      ) as HTMLElement | undefined;

    const markDispatchActions = () => {
      const heading = findStageHeading();
      if (!heading) return;
      const root = heading.parentElement?.parentElement?.parentElement || document.body;

      Array.from(root.querySelectorAll("span")).forEach((span) => {
        if (span.textContent?.trim() !== "출동") return;
        const element = span as HTMLElement;
        if (!visible(element)) return;
        element.style.cursor = "pointer";
        element.style.touchAction = "manipulation";
        element.setAttribute("role", "button");
        element.setAttribute("tabindex", "0");
        element.setAttribute("aria-label", "출동 단계로 이동");
        element.dataset.hajinWorkflowDispatch = "true";
      });
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

    const resolveJobId = async (card: HTMLElement) => {
      const existingImage = card.querySelector('img[alt="접수사진"]') as HTMLImageElement | null;
      if (existingImage?.src) {
        try {
          const url = new URL(existingImage.src, window.location.origin);
          const decoded = decodeURIComponent(url.pathname);
          const marker = "/as-job-photos/";
          const markerIndex = decoded.indexOf(marker);
          if (markerIndex >= 0) {
            const storagePath = decoded.slice(markerIndex + marker.length);
            const firstSegment = storagePath.split("/")[0];
            const id = Number(firstSegment);
            if (Number.isFinite(id) && id > 0) return id;
          }
        } catch {}
      }

      const cardText = card.innerText || "";
      const { data, error } = await supabase
        .from("as_jobs")
        .select("id,company,site,worker,visit_note,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error || !data?.length) return 0;

      let best: { id: number; score: number } | null = null;
      for (const row of data as Array<{ id: number; company?: string; site?: string; worker?: string; visit_note?: string }>) {
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
        if (!best || score > best.score) best = { id: Number(row.id), score };
      }
      return best && best.score >= 6 ? best.id : 0;
    };

    const moveCardToDispatch = async (source: Element) => {
      if (advancing) return;
      const card = findCard(source);
      if (!card) {
        window.alert("출동 처리할 업무 카드를 찾지 못했습니다.");
        return;
      }

      advancing = true;
      try {
        const jobId = await resolveJobId(card);
        if (!jobId) throw new Error("A/S 접수건을 정확히 찾지 못했습니다.");

        const { error } = await supabase.from("as_jobs").update({ status: "방문예정" }).eq("id", jobId);
        if (error) throw new Error(error.message);

        try {
          const all = JSON.parse(localStorage.getItem(WORKFLOW_KEY) || "{}");
          all[String(jobId)] = { ...(all[String(jobId)] || {}), step: "출동" };
          localStorage.setItem(WORKFLOW_KEY, JSON.stringify(all));
        } catch {}

        window.location.reload();
      } catch (error: any) {
        window.alert(`출동 단계 이동에 실패했습니다. ${error?.message || "다시 시도해주세요."}`);
      } finally {
        advancing = false;
      }
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const action = target.closest('[data-hajin-workflow-dispatch="true"]');
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void moveCardToDispatch(action);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const action = target.closest('[data-hajin-workflow-dispatch="true"]');
      if (!action) return;
      event.preventDefault();
      void moveCardToDispatch(action);
    };

    const observer = new MutationObserver(markDispatchActions);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKeyDown, true);
    markDispatchActions();

    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  return null;
}
