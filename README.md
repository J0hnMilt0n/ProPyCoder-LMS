# ProPyCoder LMS - Learning Management System

A complete, production-ready Learning Management System for software training institutes. Built with Next.js 14, TypeScript, Tailwind CSS, Prisma, and NextAuth.

## Features

✅ **User Management**
- Student registration and login
- Instructor dashboard
- Admin panel for system management
- Role-based access control (STUDENT, INSTRUCTOR, ADMIN)

✅ **Course Management**
- Create and publish courses
- Organize courses into modules/lessons
- Multiple difficulty levels (BEGINNER, INTERMEDIATE, ADVANCED)
- Course categorization

✅ **Learning Features**
- Enroll in courses
- Track course progress
- Module completion tracking
- Quiz system with scoring
- Certificate generation

✅ **Admin Features**
- User management
- Course management
- Analytics and reporting
- System settings

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, TypeScript
- **Database**: SQLite (dev), PostgreSQL (prod)
- **ORM**: Prisma
- **Authentication**: NextAuth.js with JWT
- **Validation**: Zod
- **UI Components**: Lucide React Icons
- **Notifications**: React Hot Toast

## Prerequisites

- Node.js 18+ and npm
- Git
- Docker (optional, for containerized deployment)

## Installation & Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd propycoder-lms
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
Create a `.env.local` file in the root directory:

```bash
# Database
DATABASE_URL="file:./prisma/dev.db"

# NextAuth
NEXTAUTH_SECRET="your-secret-key-generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"

# API
API_URL="http://localhost:3000"

# Email (optional)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASSWORD="your-password"
SMTP_FROM="noreply@lms.com"
```

Generate a secret key:
```bash
openssl rand -base64 32
```

### 4. Setup Database
```bash
npx prisma db push
npx prisma db seed  # (optional) Seed demo data
```

### 5. Run Development Server
```bash
npm run dev
```

The application will be available at: http://localhost:3000

## Demo Credentials

For testing purposes, create accounts via the registration page. The system is ready to accept new users immediately.

### Default Admin Setup
To create an admin account:
1. Register a new account via the signup page
2. Manually update the role in the database, or
3. Use the included seed script to populate demo data

## Project Structure

```
src/
├── app/
│   ├── api/              # API routes
│   │   ├── auth/         # Authentication endpoints
│   │   ├── courses/      # Course management
│   │   ├── enrollments/  # Enrollment management
│   │   └── progress/     # Progress tracking
│   ├── auth/             # Auth pages (login, register)
│   ├── courses/          # Course pages
│   ├── dashboard/        # Student dashboard
│   ├── admin/            # Admin dashboard
│   ├── instructor/       # Instructor dashboard
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Home page
├── components/
│   ├── navbar.tsx        # Navigation component
│   ├── providers.tsx     # NextAuth & Toast providers
│   └── ...
├── lib/
│   └── prisma.ts         # Prisma client
└── styles/
    └── globals.css       # Global styles

prisma/
├── schema.prisma         # Database schema
└── dev.db               # SQLite database (dev)
```

## API Routes

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/[...nextauth]` - NextAuth endpoints

### Courses
- `GET /api/courses` - Get all published courses
- `POST /api/courses` - Create new course (instructor only)
- `GET /api/courses/[id]` - Get course details

### Enrollments
- `GET /api/enrollments` - Get user enrollments
- `POST /api/enrollments` - Enroll in a course

### Progress
- `GET /api/progress` - Get course progress
- `POST /api/progress` - Update module progress

## Database Schema

The application uses the following main models:

- **User**: Student, Instructor, and Admin accounts
- **Course**: Course information and metadata
- **Module**: Course modules/lessons
- **Enrollment**: Student course enrollments
- **Progress**: Module completion tracking
- **Quiz**: Course quizzes
- **Certificate**: Earned certificates
- **Notification**: User notifications

See `prisma/schema.prisma` for full schema details.

## Development Commands

```bash
# Run dev server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Format code
npm run format

# Lint code
npm run lint

# Database operations
npx prisma studio              # Open Prisma Studio
npx prisma db push             # Sync schema with database
npx prisma db seed             # Seed database with demo data
```

## Docker Deployment

### Using Docker Compose

```bash
# Build and run
docker-compose up --build

# Access the app
# http://localhost:3000
```

### Using Docker

Build the image:
```bash
docker build -t propycoder-lms .
```

Run the container:
```bash
docker run -p 3000:3000 \
  -e DATABASE_URL="file:./prisma/dev.db" \
  -e NEXTAUTH_SECRET="your-secret-key" \
  -e NEXTAUTH_URL="http://localhost:3000" \
  propycoder-lms
```

## Production Deployment

### Vercel Deployment

1. Push your repository to GitHub
2. Connect to Vercel at https://vercel.com
3. Set environment variables in Vercel dashboard
4. Deploy!

### Self-Hosted (Linux/Ubuntu)

1. Install Node.js 18+
2. Clone repository
3. Install dependencies: `npm install --production`
4. Build: `npm run build`
5. Set environment variables
6. Run: `npm start`

For process management, use PM2:
```bash
npm install -g pm2
pm2 start npm --name "propycoder-lms" -- start
```

### Database Migration to PostgreSQL

Update `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Update `.env.local`:
```
DATABASE_URL="postgresql://user:password@localhost:5432/propycoder_lms"
```

Run migration:
```bash
npx prisma db push
```

## Security Considerations

- Change `NEXTAUTH_SECRET` in production
- Use HTTPS in production
- Set `NEXTAUTH_URL` to your production domain
- Enable CORS for API endpoints
- Validate all user inputs
- Use environment variables for sensitive data
- Regularly update dependencies

## Performance Optimization

- Enable image optimization in Next.js
- Implement database indexing
- Use caching strategies
- Optimize API responses with pagination
- Minify and compress assets

## Troubleshooting

### Database Connection Issues
```bash
# Delete and recreate database
rm prisma/dev.db
npx prisma db push
```

### Authentication Not Working
- Verify `NEXTAUTH_SECRET` is set
- Check `NEXTAUTH_URL` matches your domain
- Clear browser cookies and cache

### Prisma Client Errors
```bash
npx prisma generate
npx prisma db push
npm run build
```

## Contributing

Contributions are welcome! Please follow the existing code style and create a pull request.

## License

This project is licensed under the MIT License.

## Support

For issues, questions, or feature requests, please open an issue in the repository.

## Roadmap

- [ ] Video course content support
- [ ] Advanced analytics dashboard
- [ ] Email notifications
- [ ] Payment integration
- [ ] Social features (discussion forums)
- [ ] Mobile app
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Advanced search and filtering
- [ ] Batch user import
- [ ] Certification validation

---

**ProPyCoder LMS** - Empowering Software Education | Built for Success 🚀
