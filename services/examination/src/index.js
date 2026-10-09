const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const { auth, requireRole, createLogger, createMetrics, errorMiddleware, INTERNAL_KEY } = require('exam-shared');
const { gradeExam } = require('./grade');

const PORT = process.env.PORT || 3004;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/exam_exams';
const QUESTION_SERVICE_URL = process.env.QUESTION_SERVICE_URL || 'http://localhost:3003';
const RESULT_SERVICE_URL = process.env.RESULT_SERVICE_URL || 'http://localhost:3005';

const logger = createLogger('examination-service');
const metrics = createMetrics('examination-service');

const examSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    subject: { type: String, default: 'General' },
    durationMinutes: { type: Number, default: 30 },
    questionIds: { type: [mongoose.Schema.Types.ObjectId], required: true, validate: (v) => v.length > 0 },
    scheduledAt: { type: Date, default: Date.now },
    createdBy: { type: String, default: 'admin' }
  },
  { timestamps: true }
);

const attemptSchema = new mongoose.Schema(
  {
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    userId: { type: String, required: true, index: true },
    studentName: { type: String, default: '' },
    answers: { type: Object, default: {} },
    score: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },
    status: { type: String, enum: ['in_progress', 'submitted', 'expired'], default: 'in_progress' },
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date }
  },
  { timestamps: true }
);

const Exam = mongoose.model('Exam', examSchema);
const Attempt = mongoose.model('Attempt', attemptSchema);

async function fetchQuestions(ids) {
  const res = await fetch(QUESTION_SERVICE_URL + '/internal/questions/batch-get', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-key': INTERNAL_KEY },
    body: JSON.stringify({ ids })
  });
  if (!res.ok) throw new Error('question service error: ' + res.status);
  const data = await res.json();
  const byId = new Map(data.questions.map((q) => [q.id || q._id, q]));
  return ids.map((id) => byId.get(String(id))).filter(Boolean);
}

async function publishResult(attempt, exam) {
  const percentage = attempt.totalMarks > 0 ? Math.round((attempt.score / attempt.totalMarks) * 100) : 0;
  try {
    await fetch(RESULT_SERVICE_URL + '/internal/results', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-key': INTERNAL_KEY },
      body: JSON.stringify({
        userId: attempt.userId,
        studentName: attempt.studentName,
        examId: exam._id.toString(),
        examTitle: exam.title,
        score: attempt.score,
        totalMarks: attempt.totalMarks,
        percentage,
        submittedAt: attempt.submittedAt
      })
    });
  } catch (err) {
    logger.error('result publish failed', { err: err.message });
  }
  return percentage;
}

function stripQuestions(questions) {
  return questions.map(({ correctIndex, ...rest }) => rest);
}

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

  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'examination-service' }));
  app.get('/metrics', metrics.handler);

  app.post('/api/exams', auth(), requireRole('admin'), async (req, res, next) => {
    try {
      const { title, subject, durationMinutes, questionIds, scheduledAt } = req.body || {};
      if (!title || !Array.isArray(questionIds) || questionIds.length === 0) {
        return res.status(400).json({ message: 'title and questionIds are required' });
      }
      const questions = await fetchQuestions(questionIds);
      if (questions.length !== questionIds.length) {
        return res.status(400).json({ message: 'One or more question ids are invalid' });
      }
      const exam = await Exam.create({
        title,
        subject,
        durationMinutes,
        questionIds,
        scheduledAt,
        createdBy: req.user.sub
      });
      logger.info('exam_created', { examId: exam._id.toString(), title });
      res.status(201).json({ exam: { id: exam._id.toString(), ...exam.toObject() } });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/exams', auth(), async (req, res, next) => {
    try {
      const exams = await Exam.find().sort({ scheduledAt: -1 }).lean();
      const attempts = await Attempt.find({ userId: req.user.sub }).lean();
      const attemptByExam = new Map(attempts.map((a) => [a.examId.toString(), a]));
      const payload = exams.map((e) => {
        const attempt = attemptByExam.get(e._id.toString());
        return {
          id: e._id,
          title: e.title,
          subject: e.subject,
          durationMinutes: e.durationMinutes,
          questionCount: e.questionIds.length,
          scheduledAt: e.scheduledAt,
          status: attempt ? attempt.status : 'not_attempted',
          score: attempt && attempt.status === 'submitted' ? attempt.score : null,
          totalMarks: attempt && attempt.status === 'submitted' ? attempt.totalMarks : null
        };
      });
      res.json({ exams: payload });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/exams/:id', auth(), async (req, res, next) => {
    try {
      const exam = await Exam.findById(req.params.id).lean();
      if (!exam) return res.status(404).json({ message: 'Exam not found' });
      const attempt = await Attempt.findOne({ examId: exam._id, userId: req.user.sub }).lean();
      if (req.user.role === 'admin') {
        return res.json({ exam: { ...exam, id: exam._id } });
      }
      const questions = await fetchQuestions(exam.questionIds.map(String));
      const expired =
        attempt && Date.now() > new Date(attempt.startedAt).getTime() + exam.durationMinutes * 60000;
      res.json({
        exam: {
          id: exam._id,
          title: exam.title,
          subject: exam.subject,
          durationMinutes: exam.durationMinutes,
          scheduledAt: exam.scheduledAt,
          questions: stripQuestions(questions),
          attempt: attempt ? { status: expired && attempt.status === 'in_progress' ? 'expired' : attempt.status, startedAt: attempt.startedAt } : null
        }
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/exams/:id/start', auth(), requireRole('student'), async (req, res, next) => {
    try {
      const exam = await Exam.findById(req.params.id).lean();
      if (!exam) return res.status(404).json({ message: 'Exam not found' });
      let attempt = await Attempt.findOne({ examId: exam._id, userId: req.user.sub });
      if (attempt && attempt.status === 'submitted') {
        return res.status(409).json({ message: 'Exam already submitted' });
      }
      if (!attempt) {
        attempt = await Attempt.create({ examId: exam._id, userId: req.user.sub, studentName: req.user.name });
      } else if (Date.now() > new Date(attempt.startedAt).getTime() + exam.durationMinutes * 60000) {
        attempt.status = 'expired';
        await attempt.save();
        return res.status(410).json({ message: 'Exam time is over' });
      }
      const questions = await fetchQuestions(exam.questionIds.map(String));
      logger.info('exam_started', { examId: exam._id.toString(), userId: req.user.sub });
      res.json({
        attempt: { id: attempt._id, startedAt: attempt.startedAt },
        exam: {
          id: exam._id,
          title: exam.title,
          durationMinutes: exam.durationMinutes,
          questions: stripQuestions(questions)
        }
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/exams/:id/submit', auth(), requireRole('student'), async (req, res, next) => {
    try {
      const exam = await Exam.findById(req.params.id).lean();
      if (!exam) return res.status(404).json({ message: 'Exam not found' });
      const attempt = await Attempt.findOne({ examId: exam._id, userId: req.user.sub });
      if (!attempt) return res.status(400).json({ message: 'Start the exam before submitting' });
      if (attempt.status === 'submitted') return res.status(409).json({ message: 'Already submitted' });

      const deadline = new Date(attempt.startedAt).getTime() + exam.durationMinutes * 60000;
      const answers = (req.body && req.body.answers) || {};
      if (Date.now() > deadline) {
        attempt.status = 'expired';
        attempt.answers = answers;
        await attempt.save();
        return res.status(410).json({ message: 'Exam time is over, submission rejected' });
      }

      const questions = await fetchQuestions(exam.questionIds.map(String));
      const { score, totalMarks } = gradeExam(questions, answers);
      attempt.answers = answers;
      attempt.score = score;
      attempt.totalMarks = totalMarks;
      attempt.status = 'submitted';
      attempt.submittedAt = new Date();
      await attempt.save();
      const percentage = await publishResult(attempt, exam);
      logger.info('exam_submitted', { examId: exam._id.toString(), userId: req.user.sub, score, totalMarks });
      res.json({ result: { score, totalMarks, percentage } });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/exams/:id/attempts', auth(), requireRole('admin'), async (req, res, next) => {
    try {
      const attempts = await Attempt.find({ examId: req.params.id, status: 'submitted' }).sort({ submittedAt: -1 }).lean();
      res.json({ attempts });
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
