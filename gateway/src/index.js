const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { auth, requireRole, createLogger, createMetrics, errorMiddleware } = require('exam-shared');

const PORT = process.env.PORT || 8080;
const AUTH_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const STUDENT_URL = process.env.STUDENT_SERVICE_URL || 'http://localhost:3002';
const QUESTION_URL = process.env.QUESTION_SERVICE_URL || 'http://localhost:3003';
const EXAM_URL = process.env.EXAMINATION_SERVICE_URL || 'http://localhost:3004';
const RESULT_URL = process.env.RESULT_SERVICE_URL || 'http://localhost:3005';

const logger = createLogger('api-gateway');
const metrics = createMetrics('api-gateway');
const app = express();

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(metrics.middleware);
app.use(rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));

app.use((req, res, next) => {
  res.on('finish', () => {
    logger.info('gateway_request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      role: req.user ? req.user.role : 'anonymous'
    });
  });
  next();
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'api-gateway' }));
app.get('/metrics', metrics.handler);

// ---------- Role-based guards (mounted per route prefix) ----------
app.use(
  '/api/auth',
  (req, res, next) => {
    if ((req.path === '/login' || req.path === '/register') && req.method === 'POST') return next();
    return auth()(req, res, next);
  }
);

app.use(
  '/api/students',
  auth(),
  (req, res, next) => {
    if (req.path === '/me') return next();
    if (req.method === 'GET' && !req.path.slice(1).includes('/')) return next(); // list is admin-guarded in service
    return requireRole('admin')(req, res, next);
  }
);

app.use('/api/questions', auth(), requireRole('admin'));

app.use(
  '/api/exams',
  auth(),
  (req, res, next) => {
    if (req.method === 'POST' && (req.path === '/' || req.path === '')) return requireRole('admin')(req, res, next);
    if (req.method === 'POST' && /^\/[^/]+\/(start|submit)$/.test(req.path)) {
      return requireRole('student')(req, res, next);
    }
    if (req.method === 'GET' && /\/attempts$/.test(req.path)) return requireRole('admin')(req, res, next);
    return next();
  }
);

app.use(
  '/api/results',
  auth(),
  (req, res, next) => {
    if (req.path === '/my') return next();
    return requireRole('admin')(req, res, next);
  }
);

// ---------- Proxies (pathFilter keeps full path; no body parsing at gateway) ----------
app.use(createProxyMiddleware({ target: AUTH_URL, changeOrigin: true, pathFilter: '/api/auth' }));
app.use(createProxyMiddleware({ target: STUDENT_URL, changeOrigin: true, pathFilter: '/api/students' }));
app.use(createProxyMiddleware({ target: QUESTION_URL, changeOrigin: true, pathFilter: '/api/questions' }));
app.use(createProxyMiddleware({ target: EXAM_URL, changeOrigin: true, pathFilter: '/api/exams' }));
app.use(createProxyMiddleware({ target: RESULT_URL, changeOrigin: true, pathFilter: '/api/results' }));

// ---------- Frontend ----------
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'frontend', 'index.html'));
});

app.use(errorMiddleware(logger));
app.listen(PORT, () => logger.info('gateway listening', { port: PORT }));
