import { Navbar } from "@/components/navbar";
import { LoaderCircle } from "lucide-react";

export default function AdminLoading() {
  return (
    <div className="admin-app">
      <Navbar />
      <div className="admin-loading">
        <LoaderCircle size={27} className="admin-spin" />
        <span>Loading your workspace</span>
      </div>
    </div>
  );
}
