"use client";
import { useEffect } from "react";
import { recordDashboardVisit } from "@/actions/trainees";

/** Invisible component — fires a visit-count increment once on mount. */
export default function VisitTracker() {
  useEffect(() => {
    recordDashboardVisit();
  }, []);
  return null;
}
