const { test } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';
const { JWT_SECRET, requireRole, auth } = require('exam-shared');

test('jwt sign and verify roundtrip', () => {
  const token = jwt.sign({ sub: '1', role: 'student' }, JWT_SECRET, { expiresIn: '1h' });
  const payload = jwt.verify(token, JWT_SECRET);
  assert.equal(payload.sub, '1');
  assert.equal(payload.role, 'student');
});

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

test('requireRole rejects wrong role', () => {
  const mw = requireRole('admin');
  const req = { user: { role: 'student' } };
  const res = mockRes();
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('auth rejects missing token', () => {
  const mw = auth();
  const res = mockRes();
  let nextCalled = false;
  mw({}, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});
