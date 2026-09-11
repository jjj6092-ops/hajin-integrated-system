import type { Metadata } from "next";
import "./globals.css";
import PwaRegister from "./pwa-register";
import UniversalBackPatches from "./universal-back-patches";
import GlobalUiPatches from "./global-ui-patches";
import WorkflowStagePatches from "./workflow-stage-patches";
import WorkflowPhotoUploadPatches from "./workflow-photo-upload-patches";
import DispatchInlineFields from "./dispatch-inline-fields";
import DispatchInlineFieldsFix from "./dispatch-inline-fields-fix";

export const metadata: Metadata = {
  title: "하진 A/S 관리",
  description: "A/S 접수부터 현장 처리와 작업 사진까지 한 번에 관리합니다.",
  applicationName: "하진 A/S",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "하진 A/S",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = {
  themeColor: "#1855a6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <PwaRegister />
        <UniversalBackPatches />
        <GlobalUiPatches />
        <WorkflowStagePatches />
        <WorkflowPhotoUploadPatches />
        <DispatchInlineFields />
        <DispatchInlineFieldsFix />
        {children}
      </body>
    </html>
  );
}
