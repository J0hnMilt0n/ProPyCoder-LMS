"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  LoaderCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import toast from "react-hot-toast";
import { formatINR } from "@/lib/currency";
import { bundleMrpTotal, discountPercent } from "@/lib/pricing";
import { ImageUploadField } from "@/components/image-upload-field";
import { useConfirm } from "@/components/confirm-dialog";
interface BundleCourse {
  order: number;
  course: {
    id: string;
    title: string;
    price: number;
    offerPrice: number | null;
    image: string | null;
    status: string;
  };
}

interface Bundle {
  id: string;
  title: string;
  description: string;
  image: string | null;
  price: number;
  status: "DRAFT" | "PUBLISHED";
  updatedAt: string;
  courses: BundleCourse[];
}

export interface BundleCourseOption {
  id: string;
  title: string;
  price: number;
  offerPrice: number | null;
}

interface Props {
  courses: BundleCourseOption[];
}

const EMPTY_FORM = {
  title: "",
  description: "",
  image: "",
  price: "",
  status: "DRAFT",
  courseIds: [] as string[],
};

export function BundleManager({ courses }: Props) {
  const confirm = useConfirm();
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modal, setModal] = useState<
    { mode: "create" } | { mode: "edit"; bundleId: string } | null
  >(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const loadBundles = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/bundles", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Load failed");
      const data = (await response.json()) as { bundles: Bundle[] };
      setBundles(data.bundles);
    } catch {
      toast.error("Could not load bundles");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBundles();
  }, [loadBundles]);

  const selectedCourses = form.courseIds
    .map((id) => courses.find((course) => course.id === id))
    .filter((course): course is BundleCourseOption => Boolean(course));
  const mrpTotal = bundleMrpTotal(selectedCourses);
  const bundlePrice = Number(form.price) || 0;
  const bundleDiscount = discountPercent({
    price: mrpTotal,
    offerPrice: bundlePrice > 0 && bundlePrice < mrpTotal ? bundlePrice : null,
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setModal({ mode: "create" });
  }

  function openEdit(bundleId: string) {
    const bundle = bundles.find((entry) => entry.id === bundleId);
    if (!bundle) return;
    setForm({
      title: bundle.title,
      description: bundle.description,
      image: bundle.image ?? "",
      price: String(bundle.price),
      status: bundle.status,
      courseIds: bundle.courses.map((entry) => entry.course.id),
    });
    setModal({ mode: "edit", bundleId });
  }

  function toggleCourse(courseId: string) {
    setForm((current) => ({
      ...current,
      courseIds: current.courseIds.includes(courseId)
        ? current.courseIds.filter((id) => id !== courseId)
        : [...current.courseIds, courseId],
    }));
  }

  async function saveBundle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal) return;
    if (form.courseIds.length < 2) {
      toast.error("Pick at least 2 courses for the bundle");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        image: form.image.trim(),
        price: Number(form.price),
        status: form.status,
        courseIds: form.courseIds,
      };
      const editing = modal.mode === "edit";
      const response = await fetch(
        editing ? `/api/admin/bundles/${modal.bundleId}` : "/api/admin/bundles",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        };
        throw new Error(data?.error || "Could not save bundle");
      }
      toast.success(editing ? "Bundle updated" : "Bundle created");
      setModal(null);
      await loadBundles();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save bundle",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleStatus(bundle: Bundle) {
    const next = bundle.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    try {
      const response = await fetch(`/api/admin/bundles/${bundle.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) throw new Error("Status change failed");
      toast.success(
        next === "PUBLISHED" ? "Bundle published" : "Bundle unpublished",
      );
      await loadBundles();
    } catch {
      toast.error("Could not change bundle status");
    }
  }

  async function deleteBundle(bundle: Bundle) {
    const ok = await confirm({
      title: `Delete “${bundle.title}”?`,
      message:
        "The bundle is removed from the store. Courses inside it are not affected.",
      confirmLabel: "Delete bundle",
      danger: true,
    });
    if (!ok) return;
    try {
      const response = await fetch(`/api/admin/bundles/${bundle.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Delete failed");
      toast.success("Bundle deleted");
      await loadBundles();
    } catch {
      toast.error("Could not delete bundle");
    }
  }

  return (
    <div className="bundle-manager">
      <div className="admin-management-heading">
        <div>
          <div className="admin-eyebrow">BUNDLES</div>
          <h2>Course bundles</h2>
          <p>
            Package 2+ courses at a reduced price. Deleting a bundle never
            affects the courses inside it.
          </p>
        </div>
        <div className="admin-management-actions">
          <button
            className="admin-button admin-button-primary"
            onClick={openCreate}
          >
            <Plus size={16} />
            <span>Create bundle</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="admin-empty">
          <LoaderCircle size={26} className="admin-spin" />
          <p>Loading bundles…</p>
        </div>
      ) : bundles.length === 0 ? (
        <div className="admin-empty">
          <Package size={30} />
          <h3>No bundles yet</h3>
          <p>Create your first bundle to offer several courses at once.</p>
          <button
            className="admin-button admin-button-primary"
            onClick={openCreate}
          >
            <Plus size={16} />
            <span>Create bundle</span>
          </button>
        </div>
      ) : (
        <div className="bundle-list">
          {bundles.map((bundle) => {
            const mrp = bundleMrpTotal(
              bundle.courses.map((entry) => entry.course),
            );
            const off = discountPercent({
              price: mrp,
              offerPrice:
                bundle.price > 0 && bundle.price < mrp ? bundle.price : null,
            });
            return (
              <article key={bundle.id} className="bundle-card">
                <div className="bundle-card-head">
                  <div>
                    <h3>{bundle.title}</h3>
                    <p>{bundle.description}</p>
                  </div>
                  <span
                    className={`admin-pill ${bundle.status === "PUBLISHED" ? "is-good" : "is-muted"}`}
                  >
                    {bundle.status.toLowerCase()}
                  </span>
                </div>

                <ul className="bundle-courses">
                  {bundle.courses.map((entry) => (
                    <li key={entry.course.id}>
                      {entry.course.title}
                      <span>{formatINR(entry.course.price)}</span>
                    </li>
                  ))}
                </ul>

                <div className="bundle-card-foot">
                  <div className="bundle-pricing">
                    <span className="bundle-mrp">{formatINR(mrp)}</span>
                    <strong className="bundle-price">
                      {formatINR(bundle.price)}
                    </strong>
                    {off > 0 && (
                      <span className="price-tag-badge">{off}% OFF</span>
                    )}
                  </div>
                  <div className="bundle-actions">
                    <button
                      className="admin-row-action"
                      onClick={() => void toggleStatus(bundle)}
                      title={
                        bundle.status === "PUBLISHED"
                          ? "Unpublish bundle"
                          : "Publish bundle"
                      }
                    >
                      {bundle.status === "PUBLISHED" ? (
                        <>
                          <EyeOff size={15} /> Unpublish
                        </>
                      ) : (
                        <>
                          <Eye size={15} /> Publish
                        </>
                      )}
                    </button>
                    <button
                      className="admin-row-action"
                      onClick={() => openEdit(bundle.id)}
                    >
                      <Pencil size={15} /> Edit
                    </button>
                    <button
                      className="admin-row-action is-danger"
                      onClick={() => void deleteBundle(bundle)}
                    >
                      <Trash2 size={15} /> Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {modal && (
        <div
          className="admin-modal-backdrop"
          role="presentation"
          onClick={() => !isSaving && setModal(null)}
        >
          <div
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="admin-modal-head">
              <h3>
                {modal.mode === "edit" ? "Edit bundle" : "Create bundle"}
              </h3>
              <button
                type="button"
                onClick={() => setModal(null)}
                disabled={isSaving}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form onSubmit={saveBundle} className="instructor-form admin-modal-form">
              <label>
                Bundle title
                <input
                  required
                  minLength={4}
                  maxLength={120}
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  placeholder="Python + Web Development bundle"
                />
              </label>
              <label>
                Description
                <textarea
                  required
                  minLength={20}
                  maxLength={5000}
                  rows={3}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="What does this bundle include and who is it for?"
                />
              </label>
              <ImageUploadField
                label="Cover image — URL or upload"
                value={form.image}
                onChange={(value) => setForm({ ...form, image: value })}
              />
              <div className="instructor-form-row">
                <label>
                  Bundle price (₹)
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={form.price}
                    onChange={(event) =>
                      setForm({ ...form, price: event.target.value })
                    }
                  />
                </label>
                <label>
                  Status
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm({ ...form, status: event.target.value })
                    }
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                  </select>
                </label>
              </div>

              <div className="bundle-picker">
                <div className="bundle-picker-head">
                  <strong>Courses in this bundle</strong>
                  <span>
                    {form.courseIds.length} selected
                    {selectedCourses.length > 0 && mrpTotal > 0 && (
                      <>
                        {" · "}MRP {formatINR(mrpTotal)}
                        {bundleDiscount > 0 && bundlePrice > 0 && (
                          <>
                            {" · "}
                            <em className="text-emerald-600 not-italic font-semibold">
                              {bundleDiscount}% OFF at {formatINR(bundlePrice)}
                            </em>
                          </>
                        )}
                      </>
                    )}
                  </span>
                </div>
                <div className="bundle-picker-list">
                  {courses.length === 0 ? (
                    <p className="bundle-picker-empty">
                      No published courses available yet.
                    </p>
                  ) : (
                    courses.map((course) => (
                      <label key={course.id} className="bundle-picker-item">
                        <input
                          type="checkbox"
                          checked={form.courseIds.includes(course.id)}
                          onChange={() => toggleCourse(course.id)}
                        />
                        <span>{course.title}</span>
                        <em>{formatINR(course.price)}</em>
                      </label>
                    ))
                  )}
                </div>
                {form.courseIds.length > 0 && form.courseIds.length < 2 && (
                  <p className="bundle-picker-hint">
                    Select at least 2 courses.
                  </p>
                )}
              </div>

              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="admin-button"
                  onClick={() => setModal(null)}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-button admin-button-primary"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <LoaderCircle size={16} className="admin-spin" />
                  ) : (
                    <Package size={16} />
                  )}
                  <span>
                    {modal.mode === "edit" ? "Save bundle" : "Create bundle"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

