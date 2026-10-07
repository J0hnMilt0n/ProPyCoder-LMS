"use client";

import { useState, FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { Navbar } from "@/components/navbar";
import { ArrowRight, Eye, EyeOff, Lock, Mail, Loader } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        toast.error(result.error || "Login failed");
      } else {
        toast.success("Login successful!");
        router.push("/dashboard");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <Navbar />

      <main className="auth-layout">
        <aside className="auth-story">
          <span className="auth-story-eyebrow">LEARN SOMETHING REAL</span>
          <h2>
            Build a skill.
            <br />
            <em>Build your future.</em>
          </h2>
          <p>
            Pick up your learning journey where you left off. Your next project
            is closer than you think.
          </p>
          <div className="auth-story-code">
            <span>01</span>
            <code>learn()</code>
            <i />
            <code>build()</code>
            <i />
            <code>repeat()</code>
          </div>
          <span className="auth-story-caption">
            A little progress, every day.
          </span>
        </aside>
        <section className="auth-content">
          <div className="auth-card">
            <div className="auth-card-eyebrow">YOUR WORKSPACE</div>
            <h1>Welcome Back</h1>
            <p className="auth-card-description">
              Sign in to your ProPyCoder account
            </p>

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="auth-field">
                <label>Email Address</label>
                <div className="auth-field-control">
                  <Mail size={17} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="auth-input"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div className="auth-field">
                <label>Password</label>
                <div className="auth-field-control">
                  <Lock size={17} />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="auth-input"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="auth-submit"
              >
                {isLoading && <Loader className="h-4 w-4 animate-spin" />}
                {isLoading ? (
                  "Signing in..."
                ) : (
                  <>
                    Sign in <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            <div className="auth-switch">
              New to ProPyCoder?{" "}
              <Link href="/auth/register">Create an account</Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
