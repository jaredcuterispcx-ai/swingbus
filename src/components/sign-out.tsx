"use client";

import { useRouter } from "next/navigation";

export function SignOutButton({ className = "sb-pill" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await fetch("/api/auth", { method: "DELETE" });
        router.replace("/");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
