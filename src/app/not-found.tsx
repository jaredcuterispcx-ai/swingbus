import Link from "next/link";
import { AppHeader } from "@/components/app-header";

export default function NotFound() {
  return (
    <main className="sb-shell">
      <AppHeader />
      <h1 className="sb-brand text-3xl">Page not found</h1>
      <Link href="/" className="sb-btn sb-btn-primary mt-5 w-full">
        Choose a stop
      </Link>
    </main>
  );
}
