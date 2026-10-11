"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, GripVertical, LoaderCircle, Plus, Video } from "lucide-react";
import toast from "react-hot-toast";
import { useConfirm } from "@/components/confirm-dialog";

type Lesson = {
  id: string;
  title: string;
  description: string | null;
  order: number;
  videoUrl: string | null;
  videoId: string | null;
  duration: number | null;
  isFree: boolean;
};

type Module = {
  id: string;
  title: string;
  description: string | null;
  order: number;
  lessons: Lesson[];
};

type ModuleForm = { title: string; description: string };

type LessonForm = {
  title: string;
  description: string;
  videoUrl: string;
  duration: string;
  isFree: boolean;
};

const EMPTY_MODULE_FORM: ModuleForm = { title: "", description: "" };

const EMPTY_LESSON_FORM: LessonForm = {
  title: "",
  description: "",
  videoUrl: "",
  duration: "",
  isFree: false,
};

async function callApi(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  if (!response.ok) throw new Error(data?.error ?? "Request failed");
  return data;
}

export function CourseContentManager({
  courseId,
  onChanged,
}: {
  courseId: string;
  onChanged?: () => void;
}) {
  const [modules, setModules] = useState<Module[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [addingModule, setAddingModule] = useState(false);
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [moduleForm, setModuleForm] = useState<ModuleForm>(EMPTY_MODULE_FORM);

  const [addingLessonModuleId, setAddingLessonModuleId] = useState<
    string | null
  >(null);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [lessonForm, setLessonForm] = useState<LessonForm>(EMPTY_LESSON_FORM);

  const [draggingModuleId, setDraggingModuleId] = useState<string | null>(null);
  const [dragOverModuleId, setDragOverModuleId] = useState<string | null>(null);
  const [draggingLessonId, setDraggingLessonId] = useState<string | null>(null);
  const [dragOverLessonId, setDragOverLessonId] = useState<string | null>(null);
  const confirm = useConfirm();

  const loadContent = useCallback(async () => {
    try {
      const data = (await callApi(
        `/api/courses/${courseId}/content`,
        "GET",
      )) as { modules?: Module[] };
      setModules(data.modules ?? []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load content",
      );
    } finally {
      setIsLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void loadContent();
  }, [loadContent]);

  async function run(action: () => Promise<void>, failureMessage: string) {
    setIsSaving(true);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : failureMessage);
    } finally {
      setIsSaving(false);
    }
  }

  function startAddModule() {
    setModuleForm(EMPTY_MODULE_FORM);
    setEditingModuleId(null);
    setAddingModule(true);
  }

  function startEditModule(module: Module) {
    setModuleForm({
      title: module.title,
      description: module.description ?? "",
    });
    setAddingModule(false);
    setEditingModuleId(module.id);
  }

  async function saveModule(
    event: FormEvent<HTMLFormElement>,
    moduleId: string | null,
  ) {
    event.preventDefault();
    await run(async () => {
      const payload = {
        title: moduleForm.title.trim(),
        description: moduleForm.description.trim(),
      };
      if (moduleId) {
        await callApi(`/api/modules/${moduleId}`, "PATCH", payload);
        toast.success("Module updated");
      } else {
        await callApi(`/api/courses/${courseId}/content`, "POST", payload);
        toast.success("Module added");
      }
      setAddingModule(false);
      setEditingModuleId(null);
      setModuleForm(EMPTY_MODULE_FORM);
      await loadContent();
      onChanged?.();
    }, "Could not save the module");
  }

  async function deleteModule(module: Module) {
    const lessonCount = module.lessons.length;
    if (
      !await confirm({
        title: "Delete module",
        message: `Delete "${module.title}"${lessonCount ? ` and its ${lessonCount} lesson(s)` : ""}? This cannot be undone.`,
      })
    )
      return;
    await run(async () => {
      await callApi(`/api/modules/${module.id}`, "DELETE");
      toast.success("Module deleted");
      if (editingModuleId === module.id) setEditingModuleId(null);
      await loadContent();
      onChanged?.();
    }, "Could not delete the module");
  }
  function startAddLesson(moduleId: string) {
    setLessonForm(EMPTY_LESSON_FORM);
    setEditingLessonId(null);
    setAddingLessonModuleId(moduleId);
  }

  function startEditLesson(lesson: Lesson) {
    setLessonForm({
      title: lesson.title,
      description: lesson.description ?? "",
      videoUrl: lesson.videoUrl ?? "",
      duration: lesson.duration != null ? String(lesson.duration) : "",
      isFree: lesson.isFree,
    });
    setAddingLessonModuleId(null);
    setEditingLessonId(lesson.id);
  }

  async function saveLesson(
    event: FormEvent<HTMLFormElement>,
    moduleId: string,
    lessonId: string | null,
  ) {
    event.preventDefault();
    await run(async () => {
      const payload = {
        title: lessonForm.title.trim(),
        description: lessonForm.description.trim(),
        videoUrl: lessonForm.videoUrl.trim(),
        duration:
          lessonForm.duration === "" ? undefined : Number(lessonForm.duration),
        isFree: lessonForm.isFree,
      };
      if (lessonId) {
        await callApi(`/api/lessons/${lessonId}`, "PATCH", {
          ...payload,
          duration: payload.duration ?? null,
        });
        toast.success("Lesson updated");
      } else {
        await callApi(`/api/modules/${moduleId}/lessons`, "POST", payload);
        toast.success("Lesson added");
      }
      setAddingLessonModuleId(null);
      setEditingLessonId(null);
      setLessonForm(EMPTY_LESSON_FORM);
      await loadContent();
      onChanged?.();
    }, "Could not save the lesson");
  }

  async function deleteLesson(lesson: Lesson) {
    if (!await confirm({ title: "Delete lesson", message: `Delete "${lesson.title}"?` })) return;
    await run(async () => {
      await callApi(`/api/lessons/${lesson.id}`, "DELETE");
      toast.success("Lesson deleted");
      if (editingLessonId === lesson.id) setEditingLessonId(null);
      await loadContent();
      onChanged?.();
    }, "Could not delete the lesson");
  }
  async function persistModuleOrder(list: Module[]) {
    setModules(list);
    await run(async () => {
      await callApi(`/api/courses/${courseId}/content`, "PATCH", {
        moduleIds: list.map((module) => module.id),
      });
      toast.success("Module order saved");
    }, "Could not reorder modules");
  }

  function handleModuleDragOver(
    event: React.DragEvent<HTMLElement>,
    moduleId: string,
  ) {
    if (draggingModuleId === null || draggingModuleId === moduleId) return;
    event.preventDefault();
    setDragOverModuleId(moduleId);
  }

  function handleModuleDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    const targetId = dragOverModuleId;
    const sourceId = draggingModuleId;
    setDraggingModuleId(null);
    setDragOverModuleId(null);
    if (!sourceId || !targetId || sourceId === targetId) return;
    const list = [...modules];
    const from = list.findIndex((module) => module.id === sourceId);
    const to = list.findIndex((module) => module.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    void persistModuleOrder(list);
  }

  async function persistLessonOrder(moduleId: string, list: Lesson[]) {
    setModules((current) =>
      current.map((module) =>
        module.id === moduleId ? { ...module, lessons: list } : module,
      ),
    );
    await run(async () => {
      await callApi(`/api/modules/${moduleId}/lessons`, "PATCH", {
        lessonIds: list.map((lesson) => lesson.id),
      });
      toast.success("Lesson order saved");
    }, "Could not reorder lessons");
  }

  function handleLessonDragOver(
    event: React.DragEvent<HTMLLIElement>,
    lessonId: string,
  ) {
    if (draggingLessonId === null || draggingLessonId === lessonId) return;
    event.preventDefault();
    setDragOverLessonId(lessonId);
  }

  function handleLessonDrop(
    event: React.DragEvent<HTMLLIElement>,
    moduleId: string,
  ) {
    event.preventDefault();
    const targetId = dragOverLessonId;
    const sourceId = draggingLessonId;
    setDraggingLessonId(null);
    setDragOverLessonId(null);
    if (!sourceId || !targetId || sourceId === targetId) return;
    const targetModule = modules.find((entry) => entry.id === moduleId);
    if (!targetModule) return;
    const list = [...targetModule.lessons];
    const from = list.findIndex((lesson) => lesson.id === sourceId);
    const to = list.findIndex((lesson) => lesson.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    void persistLessonOrder(moduleId, list);
  }

  const totalLessons = modules.reduce(
    (total, module) => total + module.lessons.length,
    0,
  );

  function moduleFormFields(moduleId: string | null) {
    return (
      <>
        <div className="ccm-form-row">
          <label>
            Module title
            <input
              value={moduleForm.title}
              minLength={2}
              maxLength={120}
              required
              autoFocus
              onChange={(event) =>
                setModuleForm({ ...moduleForm, title: event.target.value })
              }
            />
          </label>
          <label>
            Short description{" "}
            <span className="instructor-optional">Optional</span>
            <input
              value={moduleForm.description}
              maxLength={500}
              placeholder="What this module covers"
              onChange={(event) =>
                setModuleForm({
                  ...moduleForm,
                  description: event.target.value,
                })
              }
            />
          </label>
        </div>
        <div className="ccm-form-actions">
          <button
            type="button"
            className="admin-button"
            disabled={isSaving}
            onClick={() => {
              setAddingModule(false);
              setEditingModuleId(null);
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="admin-button admin-button-primary"
            disabled={isSaving}
          >
            {isSaving ? (
              <LoaderCircle size={14} className="admin-spin" />
            ) : (
              <Check size={14} />
            )}
            <span>{moduleId ? "Save module" : "Add module"}</span>
          </button>
        </div>
      </>
    );
  }

  function lessonFormFields(moduleId: string, lessonId: string | null) {
    return (
      <>
        <div className="ccm-form-row">
          <label>
            Lesson title
            <input
              value={lessonForm.title}
              minLength={2}
              maxLength={160}
              required
              autoFocus
              onChange={(event) =>
                setLessonForm({ ...lessonForm, title: event.target.value })
              }
            />
          </label>
          <label>
            Video URL <span className="instructor-optional">Optional</span>
            <input
              type="url"
              value={lessonForm.videoUrl}
              placeholder="https://www.youtube.com/watch?v=..."
              onChange={(event) =>
                setLessonForm({ ...lessonForm, videoUrl: event.target.value })
              }
            />
          </label>
        </div>
        <div className="ccm-form-row ccm-form-row-compact">
          <label>
            Duration (min)
            <input
              type="number"
              min="0"
              max="10000"
              step="1"
              value={lessonForm.duration}
              onChange={(event) =>
                setLessonForm({ ...lessonForm, duration: event.target.value })
              }
            />
          </label>
          <label className="ccm-checkbox">
            <input
              type="checkbox"
              checked={lessonForm.isFree}
              onChange={(event) =>
                setLessonForm({ ...lessonForm, isFree: event.target.checked })
              }
            />
            Free preview lesson
          </label>
        </div>
        <label>
          Lesson notes <span className="instructor-optional">Optional</span>
          <textarea
            value={lessonForm.description}
            maxLength={1000}
            rows={2}
            placeholder="Key takeaways for this lesson"
            onChange={(event) =>
              setLessonForm({ ...lessonForm, description: event.target.value })
            }
          />
        </label>
        <div className="ccm-form-actions">
          <button
            type="button"
            className="admin-button"
            disabled={isSaving}
            onClick={() => {
              setAddingLessonModuleId(null);
              setEditingLessonId(null);
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="admin-button admin-button-primary"
            disabled={isSaving}
          >
            {isSaving ? (
              <LoaderCircle size={14} className="admin-spin" />
            ) : (
              <Check size={14} />
            )}
            <span>{lessonId ? "Save lesson" : "Add lesson"}</span>
          </button>
        </div>
      </>
    );
  }

  if (isLoading) {
    return (
      <div className="ccm ccm-loading">
        <LoaderCircle size={22} className="admin-spin" />
        <span>Loading course content...</span>
      </div>
    );
  }

  return (
    <div className="ccm">
      <div className="ccm-toolbar">
        <div className="ccm-stats">
          <span>
            <strong>{modules.length}</strong> modules
          </span>
          <span>
            <strong>{totalLessons}</strong> lessons
          </span>
        </div>
        <button
          type="button"
          className="admin-button admin-button-primary"
          onClick={startAddModule}
          disabled={addingModule || isSaving}
        >
          <Plus size={15} />
          <span>Add module</span>
        </button>
      </div>

      {addingModule && (
        <form
          className="ccm-form"
          onSubmit={(event) => saveModule(event, null)}
        >
          {moduleFormFields(null)}
        </form>
      )}

      {modules.length === 0 && !addingModule && (
        <div className="ccm-empty">
          <Plus size={20} />
          <p>
            No modules yet. Add your first module to start building this
            course.
          </p>
        </div>
      )}

      {modules.map((module, moduleIndex) => (
        <section
          key={module.id}
          className={`ccm-module${draggingModuleId === module.id ? " is-dragging" : ""}${dragOverModuleId === module.id && draggingModuleId !== module.id ? " is-drop-target" : ""}`}
          draggable={draggingModuleId === null && !isSaving}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            setDraggingModuleId(module.id);
          }}
          onDragOver={(event) => handleModuleDragOver(event, module.id)}
          onDrop={(event) => handleModuleDrop(event)}
          onDragEnd={() => {
            setDraggingModuleId(null);
            setDragOverModuleId(null);
          }}
        >
          <div className="ccm-module-head">
            {editingModuleId === module.id ? (
              <form
                className="ccm-form"
                onSubmit={(event) => saveModule(event, module.id)}
              >
                {moduleFormFields(module.id)}
              </form>
            ) : (
              <>
                <span
                  className="ccm-drag-handle"
                  title="Drag to reorder module"
                  aria-hidden="true"
                >
                  <GripVertical size={16} />
                </span>
                <div className="ccm-module-copy">
                  <span className="ccm-index">MODULE {moduleIndex + 1}</span>
                  <strong>{module.title}</strong>
                  {module.description && <p>{module.description}</p>}
                </div>
                <div className="ccm-row-actions">
                  <button
                    type="button"
                    className="admin-row-action"
                    onClick={() => startAddLesson(module.id)}
                    disabled={isSaving}
                  >
                    + Lesson
                  </button>
                  <button
                    type="button"
                    className="admin-row-action"
                    onClick={() => startEditModule(module)}
                    disabled={isSaving}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="admin-row-action is-danger"
                    onClick={() => deleteModule(module)}
                    disabled={isSaving}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
          <ul className="ccm-lessons">
            {module.lessons.map((lesson, lessonIndex) => (
              <li
                key={lesson.id}
                className={`ccm-lesson${draggingLessonId === lesson.id ? " is-dragging" : ""}${dragOverLessonId === lesson.id && draggingLessonId !== lesson.id ? " is-drop-target" : ""}`}
                draggable={editingLessonId !== lesson.id && !isSaving}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  setDraggingLessonId(lesson.id);
                }}
                onDragOver={(event) => handleLessonDragOver(event, lesson.id)}
                onDrop={(event) => handleLessonDrop(event, module.id)}
                onDragEnd={() => {
                  setDraggingLessonId(null);
                  setDragOverLessonId(null);
                }}
              >
                {editingLessonId === lesson.id ? (
                  <form
                    className="ccm-form"
                    onSubmit={(event) =>
                      saveLesson(event, module.id, lesson.id)
                    }
                  >
                    {lessonFormFields(module.id, lesson.id)}
                  </form>
                ) : (
                  <>
                    <span
                      className="ccm-drag-handle ccm-lesson-handle"
                      title="Drag to reorder lesson"
                      aria-hidden="true"
                    >
                      <GripVertical size={14} />
                    </span>
                    <span className="ccm-lesson-icon">
                      {lesson.videoId ? <Video size={14} /> : <Check size={14} />}
                    </span>
                    <div className="ccm-lesson-copy">
                      <strong>{lesson.title}</strong>
                      <span className="ccm-lesson-meta">
                        Lesson {lessonIndex + 1}
                        {lesson.duration != null &&
                          ` · ${lesson.duration} min`}
                        {lesson.isFree && (
                          <em className="ccm-free">Free preview</em>
                        )}
                      </span>
                    </div>
                    <div className="ccm-row-actions">
                      <button
                        type="button"
                        className="admin-row-action"
                        onClick={() => startEditLesson(lesson)}
                        disabled={isSaving}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="admin-row-action is-danger"
                        onClick={() => deleteLesson(lesson)}
                        disabled={isSaving}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
            {addingLessonModuleId === module.id ? (
              <li className="ccm-lesson ccm-lesson-form">
                <form
                  className="ccm-form"
                  onSubmit={(event) => saveLesson(event, module.id, null)}
                >
                  {lessonFormFields(module.id, null)}
                </form>
              </li>
            ) : (
              <li className="ccm-lesson-add">
                <button
                  type="button"
                  className="admin-button"
                  onClick={() => startAddLesson(module.id)}
                  disabled={isSaving || editingLessonId !== null}
                >
                  <Plus size={14} />
                  <span>Add lesson</span>
                </button>
              </li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}