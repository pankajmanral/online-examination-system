const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const { auth, requireRole, requireInternal, createLogger, createMetrics, errorMiddleware } = require('exam-shared');

const PORT = process.env.PORT || 3002;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/exam_students';

const logger = createLogger('student-service');
const metrics = createMetrics('student-service');

const studentSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    rollNumber: { type: String, default: () => 'STU-' + Math.floor(10000 + Math.random() * 90000) },
    course: { type: String, default: 'General' }
  },
  { timestamps: true }
);

const Student = mongoose.model('Student', studentSchema);

async function main() {
  await mongoose.connect(MONGO_URI);

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

  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'student-service' }));
  app.get('/metrics', metrics.handler);

  app.post('/internal/students', requireInternal, async (req, res, next) => {
    try {
      const { userId, name, email, course } = req.body || {};
      if (!userId || !name || !email) return res.status(400).json({ message: 'userId, name, email required' });
      const existing = await Student.findOne({ userId });
      if (existing) return res.status(200).json({ student: existing });
      const student = await Student.create({ userId, name, email, course });
      res.status(201).json({ student });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/students/me', auth(), async (req, res, next) => {
    try {
      let student = await Student.findOne({ userId: req.user.sub });
      if (!student) {
        student = await Student.create({ userId: req.user.sub, name: req.user.name, email: req.user.email });
      }
      res.json({ student });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/students', auth(), requireRole('admin'), async (req, res, next) => {
    try {
      const students = await Student.find().sort({ createdAt: -1 });
      res.json({ students });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/students/:id', auth(), async (req, res, next) => {
    try {
      const student = await Student.findById(req.params.id);
      if (!student) return res.status(404).json({ message: 'Student not found' });
      if (req.user.role !== 'admin' && student.userId !== req.user.sub) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      res.json({ student });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/students', auth(), requireRole('admin'), async (req, res, next) => {
    try {
      const { userId, name, email, rollNumber, course } = req.body || {};
      if (!userId || !name || !email) return res.status(400).json({ message: 'userId, name, email required' });
      const student = await Student.create({ userId, name, email, rollNumber, course });
      res.status(201).json({ student });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/students/:id', auth(), async (req, res, next) => {
    try {
      const student = await Student.findById(req.params.id);
      if (!student) return res.status(404).json({ message: 'Student not found' });
      if (req.user.role !== 'admin' && student.userId !== req.user.sub) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const allowed = ['name', 'course', 'rollNumber'];
      allowed.forEach((k) => {
        if (req.body[k] !== undefined) student[k] = req.body[k];
      });
      await student.save();
      res.json({ student });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/students/:id', auth(), requireRole('admin'), async (req, res, next) => {
    try {
      const student = await Student.findByIdAndDelete(req.params.id);
      if (!student) return res.status(404).json({ message: 'Student not found' });
      res.json({ message: 'Student deleted' });
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
