import { Navbar } from "@/components/navbar";

export default function InstructorLoading() {
  return (
    <div className="instructor-page">
      <Navbar />
      <div className="skeleton-shell">
        <div className="skeleton-block skeleton-hero" />
        <div className="skeleton-grid">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="skeleton-block skeleton-card" />
          ))}
        </div>
      </div>
    </div>
  );
}
