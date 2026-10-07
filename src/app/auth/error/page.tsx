import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { Navbar } from "@/components/navbar";

export default function AuthErrorPage() {
  return (
    <main className="auth-page">
      <Navbar />
      <section className="account-status-page">
        <div className="account-status-icon">
          <ShieldAlert size={26} />
        </div>
        <span>ACCOUNT ACCESS</span>
        <h1>We couldn&apos;t sign you in.</h1>
        <p>
          Check your email and password, or create an account to start learning.
        </p>
        <div>
          <Link href="/auth/login" className="status-primary">
            Return to sign in <ArrowRight size={16} />
          </Link>
          <Link href="/auth/register" className="status-secondary">
            Create an account
          </Link>
        </div>
      </section>
    </main>
  );
}
