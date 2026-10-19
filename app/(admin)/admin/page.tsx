"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Authed admins land on Today; unauthenticated visitors see the login (layout). */
export default function AdminIndex() {
  const router = useRouter();
  useEffect(() => router.replace("/admin/today"), [router]);
  return null;
}
