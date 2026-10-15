import { Navbar } from "@/components/navbar";
import { LoaderCircle } from "lucide-react";

export default function AnnouncementsLoading() {
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
