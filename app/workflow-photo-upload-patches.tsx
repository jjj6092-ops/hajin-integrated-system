"use client";

import { useEffect, useRef } from "react";
import { supabase } from "./supabase";

export default function WorkflowPhotoUploadPatches() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sourceRef = useRef<Element | null>(null);
  const uploadingRef = useRef(false);

  useEffect(() => {
    const visible = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const extractPhotoFolder = (signedUrl: string) => {
      try {
        const url = new URL(signedUrl, window.location.origin);
        const decoded = decodeURIComponent(url.pathname);
        const marker = "/as-job-photos/";
        const markerIndex = decoded.indexOf(marker);
        if (markerIndex < 0) return "";
        const storagePath = decoded.slice(markerIndex + marker.length);
        const slash = storagePath.lastIndexOf("/");
        if (slash <= 0) return "";
        return storagePath.slice(0, slash);
      } catch {
        return "";
      }
    };

    const findWorkflowCard = (start: Element) => {
      let current: HTMLElement | null = start as HTMLElement;
      while (current && current !== document.body) {
        const text = current.innerText || "";
        const hasWorkInfo = (text.includes("필요장비") && text.includes("전달 및 특이사항")) || text.includes("작업내용 및 특이사항");
        if (text.includes("출동기사") && hasWorkInfo) return current;
        current = current.parentElement;
      }
      return null;
    };

    const markPhotoAreas = () => {
      const heading = Array.from(document.querySelectorAll("h2")).find((node) => {
        const text = node.textContent?.trim();
        return ["접수", "출동", "작업완료", "정산완료"].includes(text || "") && visible(node as HTMLElement);
      });
      if (!heading) return;
      const root = heading.parentElement?.parentElement?.parentElement || document.body;

      Array.from(root.querySelectorAll('button[aria-label="접수사진 보기"]')).forEach((photoButton) => {
        const container = photoButton.parentElement as HTMLElement | null;
        if (!container || container.querySelector('[data-hajin-photo-add="true"]')) return;
        container.style.position = "relative";
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.textContent = "+";
        addButton.setAttribute("aria-label", "접수사진 추가");
        addButton.setAttribute("title", "사진 추가");
        addButton.dataset.hajinPhotoAdd = "true";
        addButton.className = "absolute right-2 top-2 z-30 grid size-8 place-items-center rounded-full bg-blue-600 text-lg font-black text-white shadow-lg";
        container.appendChild(addButton);
      });

      Array.from(root.querySelectorAll("button")).forEach((button) => {
        if (button.textContent?.trim() !== "사진 없음") return;
        if (!visible(button)) return;
        button.dataset.hajinPhotoEmpty = "true";
        button.setAttribute("title", "눌러서 사진 추가");
        button.style.cursor = "pointer";
        button.style.touchAction = "manipulation";
      });
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const action = target.closest('[data-hajin-photo-add="true"],[data-hajin-photo-empty="true"]');
      if (!action || uploadingRef.current) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      sourceRef.current = action;
      if (inputRef.current) {
        inputRef.current.value = "";
        inputRef.current.click();
      }
    };

    const observer = new MutationObserver(markPhotoAreas);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", handleClick, true);
    markPhotoAreas();

    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  const uploadFiles = async (files: File[]) => {
    const source = sourceRef.current;
    if (!source || !files.length || uploadingRef.current) return;
    uploadingRef.current = true;
    try {
      const images = files.filter((file) => file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name));
      if (!images.length) {
        window.alert("사진 파일을 선택해주세요.");
        return;
      }

      const card = (() => {
        let current: HTMLElement | null = source as HTMLElement;
        while (current && current !== document.body) {
          const text = current.innerText || "";
          if (text.includes("출동기사") && text.includes("필요장비") && text.includes("전달 및 특이사항")) return current;
          current = current.parentElement;
        }
        return null;
      })();
      if (!card) throw new Error("사진을 추가할 업무 카드를 찾지 못했습니다.");

      const existingImage = card.querySelector('img[alt="접수사진"]') as HTMLImageElement | null;
      let folder = "";
      if (existingImage?.src) {
        try {
          const url = new URL(existingImage.src, window.location.origin);
          const decoded = decodeURIComponent(url.pathname);
          const marker = "/as-job-photos/";
          const markerIndex = decoded.indexOf(marker);
          if (markerIndex >= 0) {
            const storagePath = decoded.slice(markerIndex + marker.length);
            const slash = storagePath.lastIndexOf("/");
            if (slash > 0) folder = storagePath.slice(0, slash);
          }
        } catch {}
      }

      if (!folder) {
        const cardText = card.innerText || "";
        const { data, error } = await supabase.from("as_jobs").select("id,company,site,worker,visit_note,created_at").order("created_at", { ascending: false }).limit(200);
        if (error || !data?.length) throw new Error("A/S 접수건 조회에 실패했습니다.");
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
        if (!best || best.score < 6) throw new Error("사진을 추가할 A/S 접수건을 정확히 찾지 못했습니다.");
        folder = `${best.id}/intake`;
      }

      for (const [index, file] of images.entries()) {
        const safeName = (file.name || `photo-${index}.jpg`).replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${folder}/${Date.now()}-${index}-${safeName}`;
        const { error } = await supabase.storage.from("as-job-photos").upload(path, file, { upsert: false });
        if (error) throw new Error(error.message);
      }

      // Do not reload the whole SPA here. Reloading resets the in-app view to Home.
      // Keep the user on the exact workflow screen and show an immediate local preview.
      const previewUrl = URL.createObjectURL(images[0]);
      const currentImage = card.querySelector('img[alt="접수사진"]') as HTMLImageElement | null;
      if (currentImage) {
        currentImage.src = previewUrl;
      } else {
        const emptyButton = card.querySelector('[data-hajin-photo-empty="true"]') as HTMLButtonElement | null;
        if (emptyButton) {
          emptyButton.textContent = "사진 추가됨";
          emptyButton.style.backgroundImage = `url(${previewUrl})`;
          emptyButton.style.backgroundSize = "cover";
          emptyButton.style.backgroundPosition = "center";
          emptyButton.style.color = "transparent";
        }
      }

      const countBadge = Array.from(card.querySelectorAll("span,div,p")).find((node) => /^사진\s*\d+장$/.test(node.textContent?.trim() || ""));
      if (countBadge) {
        const current = Number(countBadge.textContent?.match(/\d+/)?.[0] || 0);
        countBadge.textContent = `사진 ${current + images.length}장`;
      }

      window.dispatchEvent(new CustomEvent("hajin-photo-uploaded", { detail: { folder, count: images.length } }));
      window.alert(`접수사진 ${images.length}장이 추가되었습니다.`);
    } catch (error: any) {
      window.alert(`사진 추가에 실패했습니다. ${error?.message || "다시 시도해주세요."}`);
    } finally {
      uploadingRef.current = false;
      sourceRef.current = null;
    }
  };

  return (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      multiple
      style={{ position: "fixed", left: "-9999px", top: 0, width: 1, height: 1, opacity: 0 }}
      onChange={(event) => {
        const files = Array.from(event.currentTarget.files || []);
        void uploadFiles(files);
        event.currentTarget.value = "";
      }}
    />
  );
}
