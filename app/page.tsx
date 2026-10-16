"use client";

import { useEffect } from "react";

// The application root is the company homepage. AS lives exclusively at /as.
export default function CompanyHome() {
  useEffect(() => {
    window.location.replace("/office/");
  }, []);

  return (
    <main className="min-h-screen bg-[#f7faf4] p-10 text-center text-[#254f3d]">
      <h1 className="text-2xl font-bold">하진 통합 홈페이지</h1>
      <p className="mt-4">홈페이지로 이동하고 있습니다.</p>
      <a className="mt-6 inline-block underline" href="/office/">하진 홈페이지 열기</a>
    </main>
  );
}
