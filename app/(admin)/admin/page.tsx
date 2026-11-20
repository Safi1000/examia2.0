"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { isTa, taHome } from "@/lib/staff";

/** Hamza lands on Today, staff on their own first page; signed-out visitors see the sign in (layout). */
export default function AdminIndex() {
  const router = useRouter();
  const { session } = useAuth();
  const home = isTa(session) ? taHome(session) : "/admin/today";
  useEffect(() => router.replace(home), [router, home]);
  return null;
}
