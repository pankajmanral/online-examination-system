const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const { auth, requireRole, requireInternal, createLogger, createMetrics, errorMiddleware } = require('exam-shared');

const PORT = process.env.PORT || 3003;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/exam_questions';

const logger = createLogger('question-bank-service');
const metrics = createMetrics('question-bank-service');

const questionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    options: { type: [String], required: true, validate: (v) => v.length >= 2 },
    correctIndex: { type: Number, required: true, min: 0 },
    subject: { type: String, default: 'General' },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    marks: { type: Number, default: 1 }
  },
  { timestamps: true }
);

const Question = mongoose.model('Question', questionSchema);

function adminView(q) {
  return {
    id: q._id.toString(),
    text: q.text,
    options: q.options,
    correctIndex: q.correctIndex,
    subject: q.subject,
    difficulty: q.difficulty,
    marks: q.marks
  };
}

function studentView(q) {
  const { correctIndex, ...rest } = adminView(q);
  return rest;
}

async function seed() {
  const count = await Question.countDocuments();
  if (count > 0) return;
  await Question.create([
    { text: 'What does CPU stand for?', options: ['Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Control Panel Upload'], correctIndex: 0, subject: 'Computer Science', difficulty: 'easy', marks: 1 },
    { text: 'Which protocol is used to secure web traffic?', options: ['HTTP', 'FTP', 'HTTPS', 'SMTP'], correctIndex: 2, subject: 'Computer Science', difficulty: 'easy', marks: 1 },
    { text: 'Which of these is a NoSQL database?', options: ['MySQL', 'PostgreSQL', 'MongoDB', 'Oracle'], correctIndex: 2, subject: 'Computer Science', difficulty: 'medium', marks: 2 },
    { text: 'What is the default port for SSH?', options: ['21', '22', '80', '443'], correctIndex: 1, subject: 'Networking', difficulty: 'easy', marks: 1 },
    { text: 'Which company develops the Kubernetes platform (originally)?', options: ['Google', 'Amazon', 'Microsoft', 'Red Hat'], correctIndex: 0, subject: 'DevOps', difficulty: 'medium', marks: 2 }
  ]);
  logger.info('seeded sample questions', { count: 5 });
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

  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'question-bank-service' }));
  app.get('/metrics', metrics.handler);

  app.post('/internal/questions/batch-get', requireInternal, async (req, res, next) => {
    try {
      const { ids } = req.body || {};
      if (!Array.isArray(ids)) return res.status(400).json({ message: 'ids array required' });
      const questions = await Question.find({ _id: { $in: ids } });
      res.json({ questions: questions.map(adminView) });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/questions', auth(), requireRole('admin'), async (req, res, next) => {
    try {
      const filter = {};
      if (req.query.subject) filter.subject = req.query.subject;
      const questions = await Question.find(filter).sort({ createdAt: -1 });
      res.json({ questions: questions.map(adminView) });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/questions/:id', auth(), requireRole('admin'), async (req, res, next) => {
    try {
      const question = await Question.findById(req.params.id);
      if (!question) return res.status(404).json({ message: 'Question not found' });
      res.json({ question: adminView(question) });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/questions', auth(), requireRole('admin'), async (req, res, next) => {
    try {
      const { text, options, correctIndex, subject, difficulty, marks } = req.body || {};
      if (!text || !Array.isArray(options) || options.length < 2) {
        return res.status(400).json({ message: 'text and at least 2 options are required' });
      }
      if (correctIndex === undefined || correctIndex < 0 || correctIndex >= options.length) {
        return res.status(400).json({ message: 'valid correctIndex is required' });
      }
      const question = await Question.create({ text, options, correctIndex, subject, difficulty, marks });
      logger.info('question_created', { id: question._id.toString() });
      res.status(201).json({ question: adminView(question) });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/questions/:id', auth(), requireRole('admin'), async (req, res, next) => {
    try {
      const question = await Question.findById(req.params.id);
      if (!question) return res.status(404).json({ message: 'Question not found' });
      ['text', 'options', 'correctIndex', 'subject', 'difficulty', 'marks'].forEach((k) => {
        if (req.body[k] !== undefined) question[k] = req.body[k];
      });
      await question.save();
      res.json({ question: adminView(question) });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/questions/:id', auth(), requireRole('admin'), async (req, res, next) => {
    try {
      const question = await Question.findByIdAndDelete(req.params.id);
      if (!question) return res.status(404).json({ message: 'Question not found' });
      res.json({ message: 'Question deleted' });
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
