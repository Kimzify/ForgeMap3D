import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const DEFAULT_UMAMI_WEBSITE_ID = "6156ff41-c3c3-4d09-b01e-f0ced6c8e20c";
const umamiWebsiteId =
  process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID?.trim() ||
  (process.env.NODE_ENV === "production" ? DEFAULT_UMAMI_WEBSITE_ID : undefined);
const umamiScriptUrl =
  process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL?.trim() ||
  "https://cloud.umami.is/script.js";

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  applicationName: SITE_NAME,
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "3D map",
    "printable map",
    "3D printing",
    "STL map generator",
    "OpenStreetMap",
    "Overture Maps",
    "3DBAG",
  ],
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/forge-map-3d-logo.png",
        width: 1254,
        height: 1254,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: "summary",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ["/forge-map-3d-logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        {umamiWebsiteId ? (
          <Script
            data-exclude-search="true"
            data-website-id={umamiWebsiteId}
            id="umami-analytics"
            src={umamiScriptUrl}
            strategy="afterInteractive"
          />
        ) : null}
      </body>
    </html>
  );
}
