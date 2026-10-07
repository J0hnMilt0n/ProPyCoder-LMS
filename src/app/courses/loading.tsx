import { Navbar } from "@/components/navbar";

export default function CoursesLoading() {
  return (
    <main className="catalog-page">
      <Navbar />
      <div className="skeleton-shell">
        <div className="skeleton-block skeleton-hero" />
        <div className="skeleton-block skeleton-line" />
        <div className="skeleton-grid">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="skeleton-block skeleton-card" />
          ))}
        </div>
      </div>
    </main>
  );
}
