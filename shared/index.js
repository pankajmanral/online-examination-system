const jwt = require('jsonwebtoken');
const client = require('prom-client');

const JWT_SECRET = process.env.JWT_SECRET || 'exam-dev-secret-change-me';
const INTERNAL_KEY = process.env.INTERNAL_KEY || 'exam-internal-key';

function auth(optional = false) {
  return (req, res, next) => {
    const header = (req.headers && req.headers.authorization) || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      if (optional) return next();
      return res.status(401).json({ message: 'Authentication required' });
    }
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch (err) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: requires role ' + roles.join(' or ') });
    }
    next();
  };
}

function requireInternal(req, res, next) {
  if (req.headers['x-internal-key'] !== INTERNAL_KEY) {
    return res.status(403).json({ message: 'Forbidden: internal endpoint' });
  }
  next();
}

function createLogger(serviceName) {
  const service = serviceName || process.env.SERVICE_NAME || 'app';
  const endpoint = process.env.LOG_ENDPOINT;

  function ship(entry) {
    if (!endpoint) return;
    fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(entry)
    }).catch(() => {});
  }

  function emit(level, msg, meta) {
    const entry = Object.assign({ level, msg, service, time: new Date().toISOString() }, meta || {});
    console.log(JSON.stringify(entry));
    ship(entry);
  }

  return {
    info: (msg, meta) => emit('info', msg, meta),
    warn: (msg, meta) => emit('warn', msg, meta),
    error: (msg, meta) => emit('error', msg, meta)
  };
}

function createMetrics(serviceName) {
  const service = serviceName || 'app';
  const prefix = service.replace(/-/g, '_');
  const registry = new client.Registry();
  registry.setDefaultLabels({ service });
  client.collectDefaultMetrics({ register: registry, prefix: prefix + '_' });

  const httpDuration = new client.Histogram({
    name: prefix + '_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'code'],
    registers: [registry]
  });

  const middleware = (req, res, next) => {
    const end = httpDuration.startTimer();
    res.on('finish', () => {
      end({ method: req.method, route: req.path, code: String(res.statusCode) });
    });
    next();
  };

  const handler = async (req, res) => {
    res.setHeader('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  };

  return { registry, middleware, handler };
}

function errorMiddleware(logger) {
  return (err, req, res, next) => {
    logger.error('unhandled_error', { path: req.path, err: err.message });
    if (res.headersSent) return next(err);
    res.status(500).json({ message: 'Internal server error' });
  };
}

module.exports = {
  auth,
  requireRole,
  requireInternal,
  createLogger,
  createMetrics,
  errorMiddleware,
  JWT_SECRET,
  INTERNAL_KEY
};
