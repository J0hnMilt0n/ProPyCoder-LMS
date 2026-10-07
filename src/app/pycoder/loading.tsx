import { Navbar } from "@/components/navbar";

export default function PyCoderLoading() {
  return (
    <main className="lab-page">
      <Navbar />
      <div className="lab-shell">
        <section
          className="lab-frame-shell"
          aria-busy="true"
          aria-label="Loading interactive coding lab"
        >
          <div className="lab-loading">
            <span className="lab-loading-spinner" aria-hidden="true" />
            <p>Loading lab…</p>
          </div>
        </section>
      </div>
    </main>
  );
}
