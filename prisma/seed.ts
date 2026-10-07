import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Create admin user
  const adminPassword = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@propycoder.com" },
    update: {},
    create: {
      email: "admin@propycoder.com",
      password: adminPassword,
      firstName: "Admin",
      lastName: "User",
      role: "ADMIN",
    },
  });

  // Create instructor
  const instructorPassword = await bcrypt.hash("instructor123", 10);
  const instructor = await prisma.user.upsert({
    where: { email: "instructor@propycoder.com" },
    update: {},
    create: {
      email: "instructor@propycoder.com",
      password: instructorPassword,
      firstName: "John",
      lastName: "Doe",
      role: "INSTRUCTOR",
    },
  });

  // Create student
  const studentPassword = await bcrypt.hash("student123", 10);
  const student = await prisma.user.upsert({
    where: { email: "student@propycoder.com" },
    update: {},
    create: {
      email: "student@propycoder.com",
      password: studentPassword,
      firstName: "Jane",
      lastName: "Smith",
      role: "STUDENT",
    },
  });

  // Create sample course
  const course = await prisma.course.upsert({
    where: { id: "sample-course-1" },
    update: {},
    create: {
      id: "sample-course-1",
      title: "Introduction to Web Development",
      description:
        "Learn the fundamentals of web development including HTML, CSS, and JavaScript.",
      category: "Web Development",
      level: "BEGINNER",
      price: 99.99,
      status: "PUBLISHED",
      instructorId: instructor.id,
      duration: 40,
    },
  });

  // Create modules
  const module1 = await prisma.module.create({
    data: {
      title: "HTML Basics",
      description: "Learn the structure of web pages with HTML",
      order: 1,
      courseId: course.id,
    },
  });

  const module2 = await prisma.module.create({
    data: {
      title: "CSS Styling",
      description: "Style your web pages with CSS",
      order: 2,
      courseId: course.id,
    },
  });

  const module3 = await prisma.module.create({
    data: {
      title: "JavaScript Fundamentals",
      description: "Add interactivity to your web pages",
      order: 3,
      courseId: course.id,
    },
  });

  // Create lessons with YouTube video URLs
  // Module 1 Lessons
  await prisma.lesson.create({
    data: {
      title: "What is HTML?",
      description: "Introduction to HTML and its role in web development",
      order: 1,
      moduleId: module1.id,
      videoUrl: "https://www.youtube.com/watch?v=PlxWf493en4",
      videoId: "PlxWf493en4",
      duration: 15,
      isFree: true, // Free preview lesson
    },
  });

  await prisma.lesson.create({
    data: {
      title: "HTML Document Structure",
      description: "Learn about HTML tags, elements, and document structure",
      order: 2,
      moduleId: module1.id,
      videoUrl: "https://www.youtube.com/watch?v=kUMe1FH4CHE",
      videoId: "kUMe1FH4CHE",
      duration: 20,
      isFree: false,
    },
  });

  await prisma.lesson.create({
    data: {
      title: "HTML Forms and Input",
      description: "Creating forms and handling user input in HTML",
      order: 3,
      moduleId: module1.id,
      videoUrl: "https://www.youtube.com/watch?v=fNcJuPIZ2WE",
      videoId: "fNcJuPIZ2WE",
      duration: 25,
      isFree: false,
    },
  });

  // Module 2 Lessons
  await prisma.lesson.create({
    data: {
      title: "CSS Basics - Selectors and Properties",
      description: "Introduction to CSS selectors and common properties",
      order: 1,
      moduleId: module2.id,
      videoUrl: "https://www.youtube.com/watch?v=1Rs2ND1ryYc",
      videoId: "1Rs2ND1ryYc",
      duration: 30,
      isFree: true, // Free preview lesson
    },
  });

  await prisma.lesson.create({
    data: {
      title: "CSS Layout - Flexbox",
      description: "Master CSS Flexbox for modern layouts",
      order: 2,
      moduleId: module2.id,
      videoUrl: "https://www.youtube.com/watch?v=fYq5PXgSsbE",
      videoId: "fYq5PXgSsbE",
      duration: 35,
      isFree: false,
    },
  });

  await prisma.lesson.create({
    data: {
      title: "CSS Layout - Grid",
      description: "Master CSS Grid for complex layouts",
      order: 3,
      moduleId: module2.id,
      videoUrl: "https://www.youtube.com/watch?v=jV8B24rSN5o",
      videoId: "jV8B24rSN5o",
      duration: 30,
      isFree: false,
    },
  });

  // Module 3 Lessons
  await prisma.lesson.create({
    data: {
      title: "JavaScript Variables and Data Types",
      description: "Learn about variables, strings, numbers, and other data types",
      order: 1,
      moduleId: module3.id,
      videoUrl: "https://www.youtube.com/watch?v=WBPrJSw7yQA",
      videoId: "WBPrJSw7yQA",
      duration: 25,
      isFree: false,
    },
  });

  await prisma.lesson.create({
    data: {
      title: "JavaScript Functions",
      description: "Creating and using functions in JavaScript",
      order: 2,
      moduleId: module3.id,
      videoUrl: "https://www.youtube.com/watch?v=xUI5Tsl2JpY",
      videoId: "xUI5Tsl2JpY",
      duration: 30,
      isFree: false,
    },
  });

  await prisma.lesson.create({
    data: {
      title: "DOM Manipulation",
      description: "Interacting with the Document Object Model using JavaScript",
      order: 3,
      moduleId: module3.id,
      videoUrl: "https://www.youtube.com/watch?v=y17RuWkWdn8",
      videoId: "y17RuWkWdn8",
      duration: 35,
      isFree: false,
    },
  });

  // Create enrollment
  await prisma.enrollment.create({
    data: {
      studentId: student.id,
      courseId: course.id,
      status: "ACTIVE",
      progress: 25,
    },
  });

  console.log("Database seeded successfully!");
  console.log("Test accounts:");
  console.log("Admin: admin@propycoder.com / admin123");
  console.log("Instructor: instructor@propycoder.com / instructor123");
  console.log("Student: student@propycoder.com / student123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
