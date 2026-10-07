import { Navbar } from "@/components/navbar";

interface PyCoderPageProps {
  searchParams: Promise<{ path?: string }>;
}

export default async function PyCoderPage({ searchParams }: PyCoderPageProps) {
  const { path } = await searchParams;
  const safePath = (path ?? "")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .map(encodeURIComponent)
    .join("/");
  const editorUrl = `/api/pycoder/proxy${safePath ? `/${safePath}` : ""}`;
  return (
    <main className="lab-page">
      <Navbar />
      <div className="lab-shell">
        <section
          className="lab-frame-shell"
          aria-label="Interactive Python coding environment"
        >
          <iframe
            src={editorUrl}
            title="PyCoder interactive coding lab"
            className="lab-frame"
            data-pycoder-lab
            allow="clipboard-read; clipboard-write"
            referrerPolicy="same-origin"
          />
        </section>
      </div>
    </main>
  );
}
