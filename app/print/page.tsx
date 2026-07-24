import type { Metadata } from "next";
import PrintClientPage from "./PrintClientPage";

export const metadata: Metadata = {
  title: "Print Preview",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PrintRoute() {
  return <PrintClientPage />;
}
