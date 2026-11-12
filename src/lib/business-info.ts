/** Public business details required for payment-provider website verification. */
export const businessInfo = {
  // Public contact details supplied in the local environment. Keep env
  // overrides for deployments; these values are safe to display publicly.
  legalName: process.env.BUSINESS_LEGAL_NAME?.trim() || "ProPyCoder",
  supportEmail: process.env.BUSINESS_SUPPORT_EMAIL?.trim() || "support@propycoder.com",
  supportPhone: process.env.BUSINESS_SUPPORT_PHONE?.trim() || "+917373367802",
  businessAddress: process.env.BUSINESS_ADDRESS?.trim() || "Bangalore, India",
  // Products/Services Description for Payment Gateway Verification
  // This describes what we sell to payment providers during merchant onboarding
  
productsDescription:
  process.env.BUSINESS_PRODUCTS_DESCRIPTION?.trim() ||
  "What Our Products and Services Include:\n\n" +
  "1. Individual Programming Courses\n\n" +
  "Comprehensive online courses covering specific programming languages, frameworks, and technical subjects. Students can purchase individual courses based on their learning interests and skill levels.\n\n" +
  "2. Programming Course Bundles\n\n" +
  "Curated collections of related programming courses offered together at discounted prices. These bundles provide structured learning paths and opportunities to develop multiple technical skills.\n\n" +
  "3. Live Online Classes\n\n" +
  "Interactive programming and technology training sessions designed to help students understand technical concepts, practice coding, and improve their development skills.\n\n" +
  "4. Digital Learning Materials\n\n" +
  "Online video lessons, coding examples, practical exercises, project resources, quizzes, and other educational materials included with applicable courses.\n\n" +
  "5. Certificates of Completion\n\n" +
  "Certificates of completion are provided for eligible courses after students successfully meet the applicable course completion requirements.\n\n" +
  "Who Can Benefit from Our Courses:\n\n" +
  "If you are looking to build practical programming skills, improve your technical knowledge, or advance your career in the technology industry? Welcome to ProPyCoder, an online learning platform designed to help students, developers, and technology enthusiasts learn programming through structured courses, practical exercises, and real-world projects.\n\n" +
  "ProPyCoder offers a wide range of professional programming courses, digital learning resources, curated course bundles, and live online classes covering various technology domains.\n\n" +
  "Our Learning Experience:\n\n" +
  "ProPyCoder focuses on practical, project-based education that helps learners understand programming concepts and apply their knowledge to real-world development tasks.\n\n" +
  "Students can explore available courses, review detailed descriptions and pricing, purchase individual courses or bundles, and access their learning materials through our online platform.\n\n" +
  "Digital Product Delivery:\n\n" +
  "All ProPyCoder courses, course bundles, and educational materials are digital products and services. No physical products are sold or shipped. Following successful payment confirmation, customers receive access to their purchased courses through their registered ProPyCoder accounts.\n\n" +
  "Our platform allows students to access their purchased learning content online from compatible devices and learn at their own pace.\n\n" +
  "Our Educational Programs Cover:\n\n" +
  "- Python Programming and Backend Development\n" +
  "- Web Development with HTML, CSS, and JavaScript\n" +
  "- Full Stack Web Development\n" +
  "- Database Development and MySQL\n" +
  "- Data Structures and Algorithms\n" +
  "- Software Development and Programming Fundamentals\n" +
  "- Artificial Intelligence and Emerging Technologies\n" +
  "- Other programming languages, frameworks, and development tools.\n\n" +
  "Each course is designed by industry experts to provide a comprehensive, structured learning experience through high-quality video lectures, hands-on coding exercises, real-world project demonstrations, and practical assessments.\n\n" +
  "Start Learning with ProPyCoder:\n\n" +
  "Whether you are a beginner starting your programming journey, a student developing technical skills, or a professional looking to expand your knowledge, ProPyCoder provides online educational resources to support your learning goals.\n\n" +
  "Explore our courses, choose your preferred learning program, and start building practical technology skills with ProPyCoder.",

  // Digital-course policy defaults. Operators can override these in the
  // protected deployment environment after reviewing them for their business.
  refundPolicy: process.env.BUSINESS_REFUND_POLICY?.trim() ||
    "All course sales are final. We do not offer refunds or cancellations once an order is placed, except where a refund is required by applicable law or where a payment was duplicated, collected without a successful order, or course access was not provided due to an issue on our side. Contact support with your order reference so we can investigate and, where appropriate, arrange a correction or refund.",
  accessPolicy: process.env.BUSINESS_ACCESS_POLICY?.trim() ||
    "After Paytm or another payment provider confirms successful payment, course access is provided through the learner account used for the purchase. Sign in and open your learning dashboard to access the course. Access is for the purchasing account and is not transferable. If access is missing after successful payment, contact support with your account email and order reference. Course availability and included materials are as described on the relevant course page; access duration is not guaranteed beyond what that page expressly states.",
};