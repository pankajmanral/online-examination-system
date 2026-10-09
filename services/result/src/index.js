const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const { auth, requireRole, requireInternal, createLogger, createMetrics, errorMiddleware } = require('exam-shared');

const PORT = process.env.PORT || 3005;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/exam_results';

const logger = createLogger('result-service');
const metrics = createMetrics('result-service');

const resultSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    studentName: { type: String, default: '' },
    examId: { type: String, required: true, index: true },
    examTitle: { type: String, required: true },
    score: { type: Number, required: true },
    totalMarks: { type: Number, required: true },
    percentage: { type: Number, required: true },
    submittedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

const Result = mongoose.model('Result', resultSchema);

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

  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'result-service' }));
  app.get('/metrics', metrics.handler);

  app.post('/internal/results', requireInternal, async (req, res, next) => {
    try {
      const { userId, studentName, examId, examTitle, score, totalMarks, percentage, submittedAt } = req.body || {};
      if (!userId || !examId || score === undefined || totalMarks === undefined) {
        return res.status(400).json({ message: 'userId, examId, score, totalMarks required' });
      }
      const result = await Result.create({
        userId,
        studentName,
        examId,
        examTitle,
        score,
        totalMarks,
        percentage,
        submittedAt
      });
      logger.info('result_recorded', { examId, userId, score, totalMarks });
      res.status(201).json({ result });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/results/my', auth(), async (req, res, next) => {
    try {
      const results = await Result.find({ userId: req.user.sub }).sort({ submittedAt: -1 }).lean();
      res.json({ results });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/results', auth(), requireRole('admin'), async (req, res, next) => {
    try {
      const filter = {};
      if (req.query.examId) filter.examId = req.query.examId;
      const results = await Result.find(filter).sort({ submittedAt: -1 }).lean();
      res.json({ results });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/results/exam/:examId', auth(), requireRole('admin'), async (req, res, next) => {
    try {
      const results = await Result.find({ examId: req.params.examId }).sort({ submittedAt: -1 }).lean();
      res.json({ results });
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
