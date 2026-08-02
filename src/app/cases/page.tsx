"use client";

import { useSession } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RedirectPage() {
  const { data: session, isLoading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!session?.user || !session.organization) {
        router.push("/0000000000001admin");
      } else {
        router.push("/admin");
      }
    }
  }, [isLoading, session, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
