"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { Navbar } from "@/components/navbar";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
  Loader,
} from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.firstName || !formData.lastName) {
      toast.error("First and last name are required");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (formData.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          password: formData.password,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        toast.error(error.error || "Registration failed");
        return;
      }

      toast.success("Registration successful! Please log in.");
      router.push("/auth/login");
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
        <aside className="auth-story auth-story-register">
          <span className="auth-story-eyebrow">MAKE YOUR NEXT MOVE</span>
          <h2>
            Curiosity gets
            <br />
            <em>you started.</em>
          </h2>
          <p>
            Learn practical skills by making practical things. Your first
            project begins with an account.
          </p>
          <div className="auth-story-code">
            <span>01</span>
            <code>curiosity</code>
            <i />
            <code>practice</code>
            <i />
            <code>progress</code>
          </div>
          <span className="auth-story-caption">
            Your pace. Your next chapter.
          </span>
        </aside>
        <section className="auth-content">
          <div className="auth-card">
            <div className="auth-card-eyebrow">START BUILDING</div>
            <h1>Create Account</h1>
            <p className="auth-card-description">
              Join ProPyCoder and start learning today
            </p>

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="auth-name-fields">
                <div className="auth-field">
                  <label>First Name</label>
                  <div className="auth-field-control">
                    <User size={17} />
                    <input
                      type="text"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleChange}
                      required
                      className="auth-input"
                      placeholder="John"
                    />
                  </div>
                </div>

                <div className="auth-field">
                  <label>Last Name</label>
                  <div className="auth-field-control">
                    <User size={17} />
                    <input
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleChange}
                      required
                      className="auth-input"
                      placeholder="Doe"
                    />
                  </div>
                </div>
              </div>

              <div className="auth-field">
                <label>Email Address</label>
                <div className="auth-field-control">
                  <Mail size={17} />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
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
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
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

              <div className="auth-field">
                <label>Confirm Password</label>
                <div className="auth-field-control">
                  <Lock size={17} />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                    className="auth-input"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    aria-label={
                      showConfirmPassword ? "Hide password" : "Show password"
                    }
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff size={16} />
                    ) : (
                      <Eye size={16} />
                    )}
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
                  "Creating account..."
                ) : (
                  <>
                    Create account <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            <div className="auth-switch">
              Already have an account? <Link href="/auth/login">Sign in</Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
