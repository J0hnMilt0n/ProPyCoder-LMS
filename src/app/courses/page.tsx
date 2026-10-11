"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { ArrowLeft, ArrowRight, BookOpen, Search, Users } from "lucide-react";
import toast from "react-hot-toast";
import { InstructorAvatar } from "@/components/instructor-avatar";

interface Course {
  id: string;
  title: string;
  description: string;
  category: string;
  level: string;
  price: number;
  image: string | null;
  duration: number;
  instructor: { firstName: string; lastName: string; avatar: string | null };
  _count: { enrollments: number };
}

const categories = [
  "Web Development",
  "Mobile Development",
  "Data Science",
  "DevOps",
  "Cloud Computing",
  "Python",
];
const levels = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];

export default function CoursesPage() {
  const { data: session } = useSession();
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError(false);
      const params = new URLSearchParams({ page: String(page), limit: "9" });
      if (searchQuery.trim()) params.set("title", searchQuery.trim());
      if (selectedCategory) params.set("category", selectedCategory);
      if (selectedLevel) params.set("level", selectedLevel);

      try {
        const response = await fetch(`/api/courses?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Course request failed");
        const result = await response.json();
        setCourses(result.data);
        setPageCount(Math.max(1, result.pagination.pages));
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        )
          return;
        setError(true);
        toast.error("Could not load the course catalog");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [page, retry, searchQuery, selectedCategory, selectedLevel]);

  function resetFilters() {
    setSearchQuery("");
    setSelectedCategory("");
    setSelectedLevel("");
    setPage(1);
  }

  return (
    <main className="catalog-page">
      <Navbar />
      <header className="catalog-hero">
        <div className="catalog-hero-inner">
          <div className="catalog-eyebrow">
            <BookOpen size={14} /> THE PROPYCODER LIBRARY
          </div>
          <div className="catalog-hero-row">
            <div>
              <h1>
                Find your next <em>skill.</em>
              </h1>
              <p>Practical courses for the things you want to make next.</p>
            </div>
            <div className="catalog-hero-note">
              <span>LEARN BY BUILDING</span>
              <strong>One project at a time.</strong>
            </div>
          </div>
          <div className="catalog-searchbar">
            <Search size={19} />
            <input
              type="search"
              aria-label="Search courses"
              placeholder="Search Python, web development, data..."
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setPage(1);
              }}
            />
            <kbd>ENTER</kbd>
          </div>
        </div>
      </header>

      <section className="catalog-content">
        <div className="catalog-toolbar">
          <div className="catalog-results-label">
            {isLoading
              ? "Finding courses"
              : `${courses.length ? `Showing ${courses.length}` : "No"} ${courses.length === 1 ? "course" : "courses"}`}
          </div>
          <div className="catalog-filters">
            <label>
              <span>Category</span>
              <select
                value={selectedCategory}
                onChange={(event) => {
                  setSelectedCategory(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All topics</option>
                {categories.map((category) => (
                  <option value={category} key={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Level</span>
              <select
                value={selectedLevel}
                onChange={(event) => {
                  setSelectedLevel(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All levels</option>
                {levels.map((level) => (
                  <option value={level} key={level}>
                    {level.charAt(0) + level.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {isLoading ? (
          <div className="catalog-grid" aria-label="Loading courses">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="catalog-skeleton" key={index}>
                <span />
                <div />
                <div />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="catalog-empty">
            <BookOpen />
            <h2>The catalog is taking a break.</h2>
            <p>Your filters are saved. Try loading the courses again.</p>
            <button onClick={() => setRetry((current) => current + 1)}>
              Retry
            </button>
          </div>
        ) : courses.length === 0 ? (
          <div className="catalog-empty">
            <Search />
            <h2>No courses found.</h2>
            <p>Try a different search or clear your filters.</p>
            <button onClick={resetFilters}>Clear filters</button>
          </div>
        ) : (
          <div className="catalog-grid">
            {courses.map((course, index) => (
              <article className="catalog-card" key={course.id}>
                <Link
                  href={`/courses/${course.id}`}
                  className={`catalog-art catalog-art-${index % 3}`}
                  style={
                    course.image
                      ? {
                          backgroundImage: `linear-gradient(0deg, rgba(24, 24, 27, .25), rgba(24, 24, 27, .04)), url("${course.image}")`,
                        }
                      : undefined
                  }
                  aria-label={`View ${course.title}`}
                >{
                !course.image
                  ? ( <>
                  <span className="catalog-art-category">
                    {course.category}
                  </span>
                  <span className="catalog-art-index">0{index + 1}</span>
                  <div className="catalog-art-glyph">
                    <BookOpen size={39} strokeWidth={1.3} />
                  </div> </>) :<></> }
                </Link>
                <div className="catalog-card-body">
                  <div className="catalog-card-tags">
                    <span>{course.level.toLowerCase()}</span>
                    <span>
                      {course.duration} hour{course.duration === 1 ? "" : "s"}
                    </span>
                  </div>
                  <Link
                    href={`/courses/${course.id}`}
                    className="catalog-card-title"
                  >
                    <h2>{course.title}</h2>
                  </Link>
                  <p>{course.description}</p>
                  <div className="catalog-instructor">
                    <InstructorAvatar
                      className="catalog-instructor-avatar"
                      avatar={course.instructor.avatar}
                      firstName={course.instructor.firstName}
                      lastName={course.instructor.lastName}
                    />
                    <span>
                      {course.instructor.firstName} {course.instructor.lastName}
                    </span>
                    <span className="catalog-student-count">
                      <Users size={13} /> {course._count.enrollments}
                    </span>
                  </div>
                  <div className="catalog-card-footer">
                    <strong>
                      {course.price > 0
                        ? `$${course.price.toFixed(0)}`
                        : "Free"}
                    </strong>
                    <Link
                      href={
                        session?.user
                          ? `/courses/${course.id}`
                          : "/auth/register"
                      }
                    >
                      {session?.user ? "View course" : "Start learning"}
                      <ArrowRight size={15} />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {!isLoading && !error && pageCount > 1 && (
          <nav className="catalog-pagination" aria-label="Course pages">
            <button
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ArrowLeft size={15} /> Previous
            </button>
            <span>
              Page <strong>{page}</strong> of {pageCount}
            </span>
            <button
              disabled={page >= pageCount}
              onClick={() =>
                setPage((current) => Math.min(pageCount, current + 1))
              }
            >
              Next <ArrowRight size={15} />
            </button>
          </nav>
        )}
      </section>
      <footer className="catalog-footer">
        <span>PROPYCODER LEARNING</span>
        <span>Build the skill. Build the thing.</span>
        <Link href="/pycoder">
          Open PyCoder lab <ArrowRight size={14} />
        </Link>
      </footer>
    </main>
  );
}
