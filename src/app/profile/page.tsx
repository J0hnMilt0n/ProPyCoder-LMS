"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import {
  Award,
  Camera,
  LoaderCircle,
  Lock,
  Mail,
  Save,
  Shield,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

interface Profile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  role: string;
  createdAt: string;
}

const MAX_AVATAR_BYTES = 1_600_000; // keep well under the API's 2MB limit

export default function ProfilePage() {
  const router = useRouter();
  const { status, update } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const response = await fetch("/api/profile");
      if (response.ok) {
        const data: Profile = await response.json();
        setProfile(data);
        setFirstName(data.firstName);
        setLastName(data.lastName);
        setAvatar(data.avatar);
      } else if (response.status === 401) {
        router.push("/auth/login");
      } else {
        toast.error("Could not load your profile");
      }
    } catch {
      toast.error("Could not load your profile");
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      void loadProfile();
    }
  }, [status, loadProfile, router]);

  const handleAvatarPick = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Image is too large (max 1.5 MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAvatar(typeof reader.result === "string" ? reader.result : null);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveDetails = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSavingDetails) return;
    setIsSavingDetails(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, avatar }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Could not save your profile");
      }
      const updated: Profile = await response.json();
      setProfile(updated);
      // Refresh the session so the navbar avatar/name update immediately.
      await update({
        name: `${updated.firstName} ${updated.lastName}`,
        image: updated.avatar,
      });
      toast.success("Profile updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save your profile",
      );
    } finally {
      setIsSavingDetails(false);
    }
  };

  const handleSavePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSavingPassword) return;
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    setIsSavingPassword(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Could not change password");
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not change password",
      );
    } finally {
      setIsSavingPassword(false);
    }
  };

  const initials =
    `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "P";

  if (status === "loading" || (isLoading && !profile)) {
    return (
      <div className="auth-page">
        <Navbar />
        <main className="auth-layout">
          <div className="auth-content">
            <div className="auth-card" style={{ textAlign: "center" }}>
              <LoaderCircle
                className="animate-spin"
                size={28}
                style={{ margin: "0 auto", color: "#e95f32" }}
              />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="auth-page">
      <Navbar />
      <main className="auth-layout">
        <div className="auth-content">
          <div className="auth-card profile-card">
            <div className="auth-card-eyebrow">YOUR ACCOUNT</div>
            <h1>Profile</h1>
            <p className="auth-card-description">
              Update your details, profile photo and password.
            </p>

            <div className="profile-meta">
              <span className="profile-role">
                <Shield size={13} />
                {profile.role}
              </span>
              <Link href="/certificates" className="profile-cert-link">
                <Award size={13} />
                My certificates
              </Link>
            </div>

            {/* Details */}
            <form className="auth-form" onSubmit={handleSaveDetails}>
              <h2 className="profile-section-title">Account details</h2>

              <div className="profile-avatar-row">
                <div className="profile-avatar" aria-hidden="true">
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt="" />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                <div className="profile-avatar-actions">
                  <button
                    type="button"
                    className="auth-submit profile-photo-button"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Camera size={16} />
                    <span>Change photo</span>
                  </button>
                  {avatar && (
                    <button
                      type="button"
                      className="profile-remove-photo"
                      onClick={() => setAvatar(null)}
                    >
                      <Trash2 size={14} />
                      <span>Remove</span>
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) handleAvatarPick(file);
                      event.target.value = "";
                    }}
                  />
                  <p className="profile-hint">PNG, JPG or GIF up to 1.5 MB.</p>
                </div>
              </div>

              <div className="profile-grid">
                <div className="auth-field">
                  <label>First name</label>
                  <div className="auth-field-control">
                    <UserIcon size={17} />
                    <input
                      className="auth-input"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      required
                      minLength={2}
                    />
                  </div>
                </div>
                <div className="auth-field">
                  <label>Last name</label>
                  <div className="auth-field-control">
                    <UserIcon size={17} />
                    <input
                      className="auth-input"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      required
                      minLength={1}
                    />
                  </div>
                </div>
              </div>

              <div className="auth-field">
                <label>Email</label>
                <div className="auth-field-control">
                  <Mail size={17} />
                  <input className="auth-input" value={profile.email} disabled />
                </div>
              </div>

              <button
                type="submit"
                className="auth-submit"
                disabled={isSavingDetails}
              >
                {isSavingDetails ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                {isSavingDetails ? "Saving..." : "Save details"}
              </button>
            </form>

            {/* Password */}
            <form className="auth-form profile-password-form" onSubmit={handleSavePassword}>
              <h2 className="profile-section-title">
                <Lock size={16} /> Change password
              </h2>
              <div className="auth-field">
                <label>Current password</label>
                <div className="auth-field-control">
                  <Lock size={17} />
                  <input
                    type="password"
                    className="auth-input"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
              </div>
              <div className="auth-field">
                <label>New password</label>
                <div className="auth-field-control">
                  <Lock size={17} />
                  <input
                    type="password"
                    className="auth-input"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                </div>
              </div>
              <div className="auth-field">
                <label>Confirm new password</label>
                <div className="auth-field-control">
                  <Lock size={17} />
                  <input
                    type="password"
                    className="auth-input"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                </div>
              </div>
              <button
                type="submit"
                className="auth-submit"
                disabled={isSavingPassword}
              >
                {isSavingPassword ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                {isSavingPassword ? "Saving..." : "Update password"}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
