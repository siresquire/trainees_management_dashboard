"use client";

import { useTransition, useState } from "react";
import { inviteTrainee } from "@/actions/trainees";
import { toast } from "@/lib/toast";

export default function ResendInviteButton({
  traineeId,
  cohortId,
  label = "Send invite",
}: {
  traineeId: string;
  cohortId: string;
  label?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  const handleClick = () => {
    startTransition(async () => {
      const result = await inviteTrainee(traineeId, cohortId);
      if (result?.error) {
        setErrMsg(result.error);
        setStatus("error");
        toast(result.error, "error");
        setTimeout(() => setStatus("idle"), 4000);
      } else {
        setStatus("sent");
        toast("Invite sent");
        setTimeout(() => setStatus("idle"), 4000);
      }
    });
  };

  if (status === "sent") {
    return <span className="text-xs text-green-600 font-medium">Sent ✓</span>;
  }

  if (status === "error") {
    return <span className="text-xs text-red-500" title={errMsg}>Failed</span>;
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="text-xs text-orange-600 hover:text-orange-800 hover:underline disabled:opacity-50 transition-colors"
    >
      {isPending ? "Sending…" : label}
    </button>
  );
}
