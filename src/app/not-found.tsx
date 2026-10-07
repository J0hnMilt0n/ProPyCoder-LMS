import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { Navbar } from "@/components/navbar";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <Navbar />
      <section className="not-found-content">
        <span>404 / PAGE NOT FOUND</span>
        <h1>
          This page took
          <br />
          <em>a different path.</em>
        </h1>
        <p>The link may be old, or the page may have moved.</p>
        <div>
          <Link href="/" className="status-primary">
            <ArrowLeft size={16} /> Go home
          </Link>
          <Link href="/courses" className="status-secondary">
            <Search size={15} /> Browse courses
          </Link>
        </div>
      </section>
    </main>
  );
}
