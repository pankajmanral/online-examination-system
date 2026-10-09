const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const { auth, createLogger, createMetrics, errorMiddleware, JWT_SECRET, INTERNAL_KEY } = require('exam-shared');

const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/exam_auth';
const STUDENT_SERVICE_URL = process.env.STUDENT_SERVICE_URL || 'http://localhost:3002';

const logger = createLogger('auth-service');
const metrics = createMetrics('auth-service');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['student', 'admin'], default: 'student' }
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);

function publicUser(user) {
  return { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
}

function issueToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

async function syncStudentProfile(user) {
  try {
    const res = await fetch(STUDENT_SERVICE_URL + '/internal/students', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-key': INTERNAL_KEY },
      body: JSON.stringify({ userId: user._id.toString(), name: user.name, email: user.email })
    });
    if (!res.ok) logger.warn('student profile sync failed', { status: res.status });
  } catch (err) {
    logger.warn('student service unreachable', { err: err.message });
  }
}

async function seed() {
  const count = await User.countDocuments();
  if (count > 0) return;
  await User.create([
    { name: 'Admin User', email: 'admin@example.com', passwordHash: bcrypt.hashSync('Admin@123', 10), role: 'admin' },
    { name: 'Demo Student', email: 'student@example.com', passwordHash: bcrypt.hashSync('Student@123', 10), role: 'student' }
  ]);
  logger.info('seeded default users', { admin: 'admin@example.com', student: 'student@example.com' });
}

async function main() {
  await mongoose.connect(MONGO_URI);
  await seed();

  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(metrics.middleware);
  app.use((req, res, next) => {
    res.on('finish', () => {
      logger.info('http_request', { method: req.method, path: req.path, status: res.statusCode });
    });
    next();
  });

  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'auth-service' }));
  app.get('/metrics', metrics.handler);

  app.post('/api/auth/register', async (req, res, next) => {
    try {
      const { name, email, password } = req.body || {};
      if (!name || !email || !password) {
        return res.status(400).json({ message: 'name, email and password are required' });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: 'password must be at least 6 characters' });
      }
      const exists = await User.findOne({ email: email.toLowerCase() });
      if (exists) return res.status(409).json({ message: 'Email already registered' });
      const user = await User.create({ name, email, passwordHash: bcrypt.hashSync(password, 10), role: 'student' });
      await syncStudentProfile(user);
      logger.info('user_registered', { email: user.email });
      res.status(201).json({ token: issueToken(user), user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) return res.status(400).json({ message: 'email and password are required' });
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      logger.info('user_login', { email: user.email, role: user.role });
      res.json({ token: issueToken(user), user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/auth/me', auth(), async (req, res, next) => {
    try {
      const user = await User.findById(req.user.sub);
      if (!user) return res.status(404).json({ message: 'User not found' });
      res.json({ user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  });

  app.use(errorMiddleware(logger));
  app.listen(PORT, () => logger.info('listening', { port: PORT }));
}

main().catch((err) => {
  logger.error('startup_failed', { err: err.message });
  process.exit(1);
});
