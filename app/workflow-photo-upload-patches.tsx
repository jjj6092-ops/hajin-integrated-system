"use client";

import { useEffect, useRef } from "react";
import { supabase } from "./supabase";

export default function WorkflowPhotoUploadPatches() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const targetFolderRef = useRef("");
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
        if (text.includes("출동기사") && text.includes("필요장비") && text.includes("전달 및 특이사항")) {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    };

    const resolveFolderFromCard = async (start: Element) => {
      const card = findWorkflowCard(start);
      if (!card) return "";

      const existingImage = card.querySelector('img[alt="접수사진"]') as HTMLImageElement | null;
      if (existingImage?.src) {
        const folder = extractPhotoFolder(existingImage.src);
        if (folder) return folder;
      }

      const cardText = card.innerText || "";
      const { data, error } = await supabase
        .from("as_jobs")
        .select("id,company,site,worker,visit_note,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error || !data?.length) return "";

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

      if (!best || best.score < 8) return "";
      return `${best.id}/intake`;
    };

    const choosePhotos = async (source: Element) => {
      if (uploadingRef.current) return;
      const folder = await resolveFolderFromCard(source);
      if (!folder) {
        window.alert("사진을 추가할 A/S 접수건을 찾지 못했습니다. 접수 상세에서 사진을 추가해주세요.");
        return;
      }
      targetFolderRef.current = folder;
      if (inputRef.current) {
        inputRef.current.value = "";
        inputRef.current.click();
      }
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
      const add = target.closest('[data-hajin-photo-add="true"]');
      const empty = target.closest('[data-hajin-photo-empty="true"]');
      const action = add || empty;
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void choosePhotos(action);
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
    const folder = targetFolderRef.current;
    if (!folder || !files.length || uploadingRef.current) return;
    uploadingRef.current = true;
    try {
      const images = files.filter((file) => file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name));
      if (!images.length) {
        window.alert("사진 파일을 선택해주세요.");
        return;
      }
      for (const [index, file] of images.entries()) {
        const safeName = (file.name || `photo-${index}.jpg`).replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${folder}/${Date.now()}-${index}-${safeName}`;
        const { error } = await supabase.storage.from("as-job-photos").upload(path, file, { upsert: false });
        if (error) throw new Error(error.message);
      }
      window.alert(`접수사진 ${images.length}장이 추가되었습니다.`);
      window.location.reload();
    } catch (error: any) {
      window.alert(`사진 추가에 실패했습니다. ${error?.message || "다시 시도해주세요."}`);
    } finally {
      uploadingRef.current = false;
      targetFolderRef.current = "";
    }
  };

  return (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      multiple
      className="sr-only"
      onChange={(event) => {
        const files = Array.from(event.currentTarget.files || []);
        void uploadFiles(files);
        event.currentTarget.value = "";
      }}
    />
  );
}
