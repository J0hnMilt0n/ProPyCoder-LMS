import { Navbar } from "@/components/navbar";

export default function CourseDetailLoading() {
  return (
    <main className="course-detail-page">
      <Navbar />
      <div className="course-detail-shell">
        <div className="skeleton-block skeleton-line" />
        <div className="skeleton-detail-grid">
          <div className="skeleton-block skeleton-detail-main" />
          <div className="skeleton-block skeleton-detail-side" />
        </div>
      </div>
    </main>
  );
}
