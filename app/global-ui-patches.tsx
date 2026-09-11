"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

type GalleryPhoto = { name: string; url: string };

export default function GlobalUiPatches() {
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhoto[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const galleryOpenRef = useRef(false);
  const galleryHistoryRef = useRef(false);

  useEffect(() => {
    galleryOpenRef.current = galleryOpen;
  }, [galleryOpen]);

  useEffect(() => {
    const visible = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const applyWorkflowLabelsAndIcons = () => {
      const scheduleHeadings = Array.from(document.querySelectorAll("p")).filter((node) =>
        node.textContent?.trim().endsWith("오늘의 일정"),
      );

      scheduleHeadings.forEach((heading) => {
        const section = heading.closest("section");
        if (!section) return;
        const buttons = Array.from(section.querySelectorAll("button"));
        let dispatchButton: HTMLButtonElement | null = null;
        let completeButton: HTMLButtonElement | null = null;

        buttons.forEach((button) => {
          Array.from(button.querySelectorAll("p")).forEach((label) => {
            const text = label.textContent?.trim();
            if (text === "접수") label.textContent = "접수완료";
            if (text === "출동") label.textContent = "출동/작업진행중";
            if (label.textContent?.trim() === "출동/작업진행중") dispatchButton = button;
            if (label.textContent?.trim() === "작업완료") completeButton = button;
          });
        });

        if (section.getAttribute("data-workflow-icons-swapped") !== "true" && dispatchButton && completeButton) {
          const dispatchIcon = dispatchButton.querySelector("svg");
          const completeIcon = completeButton.querySelector("svg");
          if (dispatchIcon && completeIcon) {
            const dispatchMarkup = dispatchIcon.outerHTML;
            dispatchIcon.outerHTML = completeIcon.outerHTML;
            completeIcon.outerHTML = dispatchMarkup;
            section.setAttribute("data-workflow-icons-swapped", "true");
          }
        }
      });
    };

    const handleLogoClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('img[src*="hajin-emblem-transparent.png"]')) return;
      event.preventDefault();
      window.location.assign("/");
    };

    const markLogosClickable = () => {
      document.querySelectorAll('img[src*="hajin-emblem-transparent.png"]').forEach((logo) => {
        if (logo instanceof HTMLElement) {
          logo.style.cursor = "pointer";
          logo.setAttribute("title", "홈으로 이동");
        }
      });
    };

    const findWorkflowCard = (start: Element) => {
      let current: HTMLElement | null = start as HTMLElement;
      while (current && current !== document.body) {
        const text = current.innerText || "";
        if (text.includes("출동기사") && text.includes("필요장비") && text.includes("전달 및 특이사항")) return current;
        current = current.parentElement;
      }
      return null;
    };

    const jobIdFromSignedUrl = (signedUrl: string) => {
      try {
        const url = new URL(signedUrl, window.location.origin);
        const decoded = decodeURIComponent(url.pathname);
        const marker = "/as-job-photos/";
        const index = decoded.indexOf(marker);
        if (index < 0) return 0;
        const storagePath = decoded.slice(index + marker.length);
        const id = Number(storagePath.split("/")[0]);
        return Number.isFinite(id) && id > 0 ? id : 0;
      } catch {
        return 0;
      }
    };

    const inferJobIdFromCard = async (card: HTMLElement | null) => {
      if (!card) return 0;
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

    const loadGalleryPhotos = async (jobId: number) => {
      if (!jobId) return [] as GalleryPhoto[];
      const folder = `${jobId}/intake`;
      const { data, error } = await supabase.storage
        .from("as-job-photos")
        .list(folder, { limit: 100, sortBy: { column: "created_at", order: "asc" } });
      if (error) return [] as GalleryPhoto[];

      const files = (data || []).filter((item) => item.name && item.name !== ".emptyFolderPlaceholder");
      const signed = await Promise.all(
        files.map(async (item) => {
          const path = `${folder}/${item.name}`;
          const { data: signedData } = await supabase.storage.from("as-job-photos").createSignedUrl(path, 60 * 60);
          return signedData?.signedUrl ? { name: item.name, url: signedData.signedUrl } : null;
        }),
      );
      return signed.filter((item): item is GalleryPhoto => Boolean(item?.url));
    };

    const openPhotoGallery = async (source: Element, firstUrl: string) => {
      galleryOpenRef.current = true;
      setGalleryOpen(true);
      setGalleryLoading(true);
      setGalleryIndex(0);
      setGalleryPhotos(firstUrl ? [{ name: "사진 1", url: firstUrl }] : []);

      if (!galleryHistoryRef.current) {
        window.history.pushState({ hajinGallery: true }, "", window.location.href);
        galleryHistoryRef.current = true;
      }

      const card = findWorkflowCard(source);
      let jobId = jobIdFromSignedUrl(firstUrl);
      if (!jobId) jobId = await inferJobIdFromCard(card);

      const photos = await loadGalleryPhotos(jobId);
      if (photos.length) {
        setGalleryPhotos(photos);
        const firstName = (() => {
          try { return decodeURIComponent(new URL(firstUrl, window.location.origin).pathname.split("/").pop() || ""); }
          catch { return ""; }
        })();
        const found = photos.findIndex((photo) => photo.name === firstName || firstName.includes(photo.name));
        setGalleryIndex(found >= 0 ? found : 0);
      }
      setGalleryLoading(false);
    };

    const handlePhotoClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const photoButton = target.closest('button[aria-label="접수사진 보기"]');
      if (!photoButton) return;
      const container = photoButton.parentElement;
      const image = container?.querySelector('img[alt="접수사진"]') as HTMLImageElement | null;
      if (!image?.src) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void openPhotoGallery(photoButton, image.src);
    };

    const navigationStack: Array<() => void> = [];
    let pendingBackAction: (() => void) | null = null;
    let beforeClickSnapshot = document.body.innerText;
    let restoring = false;

    const findVisibleBackButton = () => {
      return Array.from(document.querySelectorAll("button")).find((button) => {
        const text = button.textContent?.trim() || "";
        const aria = button.getAttribute("aria-label") || "";
        const isBack = text === "뒤로" || text.startsWith("←") || aria.includes("뒤로") || Boolean(button.querySelector("svg.lucide-chevron-left"));
        if (!isBack) return false;
        return visible(button);
      }) as HTMLButtonElement | undefined;
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (restoring || galleryOpenRef.current) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('img[src*="hajin-emblem-transparent.png"]')) return;
      if (target.closest('button[aria-label="접수사진 보기"]')) return;

      const button = target.closest("button");
      if (!button) return;
      const text = button.textContent?.trim() || "";
      const aria = button.getAttribute("aria-label") || "";
      if (text === "뒤로" || text.startsWith("←") || aria.includes("뒤로") || button.querySelector("svg.lucide-chevron-left")) return;

      beforeClickSnapshot = document.body.innerText;
      const currentBack = findVisibleBackButton();
      pendingBackAction = currentBack ? () => currentBack.click() : () => window.location.assign("/");

      window.setTimeout(() => {
        if (restoring || !pendingBackAction || galleryOpenRef.current) return;
        const changed = document.body.innerText !== beforeClickSnapshot;
        if (!changed) {
          pendingBackAction = null;
          return;
        }
        navigationStack.push(pendingBackAction);
        pendingBackAction = null;
        window.history.pushState({ hajinInternal: true, depth: navigationStack.length }, "", window.location.href);
      }, 80);
    };

    const handleBack = () => {
      if (galleryOpenRef.current) {
        galleryOpenRef.current = false;
        galleryHistoryRef.current = false;
        setGalleryOpen(false);
        return;
      }

      const action = navigationStack.pop();
      if (!action) return;
      restoring = true;
      window.setTimeout(() => {
        action();
        window.setTimeout(() => { restoring = false; }, 100);
      }, 0);
    };

    const applyAll = () => {
      applyWorkflowLabelsAndIcons();
      markLogosClickable();
    };

    document.addEventListener("click", handlePhotoClick, true);
    document.addEventListener("click", handleLogoClick, true);
    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("popstate", handleBack);
    const observer = new MutationObserver(applyAll);
    observer.observe(document.body, { childList: true, subtree: true });
    applyAll();

    return () => {
      document.removeEventListener("click", handlePhotoClick, true);
      document.removeEventListener("click", handleLogoClick, true);
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("popstate", handleBack);
      observer.disconnect();
    };
  }, []);

  const closeGallery = () => {
    if (galleryHistoryRef.current) {
      window.history.back();
      return;
    }
    galleryOpenRef.current = false;
    setGalleryOpen(false);
  };

  const previousPhoto = () => {
    if (galleryPhotos.length <= 1) return;
    setGalleryIndex((index) => (index - 1 + galleryPhotos.length) % galleryPhotos.length);
  };

  const nextPhoto = () => {
    if (galleryPhotos.length <= 1) return;
    setGalleryIndex((index) => (index + 1) % galleryPhotos.length);
  };

  return (
    <>
      {galleryOpen && (
        <div
          className="fixed inset-0 z-[10000] flex flex-col bg-black text-white"
          onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
          onTouchEnd={(event) => {
            if (touchStartX.current == null) return;
            const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
            const distance = endX - touchStartX.current;
            touchStartX.current = null;
            if (Math.abs(distance) < 45) return;
            if (distance > 0) previousPhoto();
            else nextPhoto();
          }}
        >
          <div className="flex h-14 shrink-0 items-center justify-between px-4">
            <button type="button" onClick={closeGallery} className="grid size-10 place-items-center rounded-full bg-white/10 text-3xl leading-none" aria-label="사진 닫기">×</button>
            <div className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-black">
              {galleryLoading ? "불러오는 중" : `${galleryIndex + 1} / ${Math.max(galleryPhotos.length, 1)}`}
            </div>
            <div className="size-10" />
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3 pb-6">
            {galleryPhotos[galleryIndex]?.url ? (
              <img src={galleryPhotos[galleryIndex].url} alt={`작업사진 ${galleryIndex + 1}`} className="max-h-full max-w-full select-none object-contain" draggable={false}/>
            ) : (
              <div className="text-sm font-bold text-white/70">사진을 불러오는 중입니다.</div>
            )}

            {galleryPhotos.length > 1 && (
              <>
                <button type="button" onClick={previousPhoto} className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-3xl font-light backdrop-blur" aria-label="이전 사진">‹</button>
                <button type="button" onClick={nextPhoto} className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-3xl font-light backdrop-blur" aria-label="다음 사진">›</button>
              </>
            )}
          </div>

          {galleryPhotos.length > 1 && (
            <div className="shrink-0 px-5 pb-[max(18px,env(safe-area-inset-bottom))] text-center text-xs font-bold text-white/60">좌우로 밀어서 사진을 넘길 수 있습니다.</div>
          )}
        </div>
      )}
    </>
  );
}
