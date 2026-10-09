const { test } = require('node:test');
const assert = require('node:assert');
const { gradeExam } = require('./grade');

test('grades correct answers with marks', () => {
  const questions = [
    { _id: 'a', correctIndex: 0, marks: 2 },
    { _id: 'b', correctIndex: 1, marks: 1 }
  ];
  const result = gradeExam(questions, { a: 0, b: 0 });
  assert.equal(result.score, 2);
  assert.equal(result.totalMarks, 3);
  assert.equal(result.details[0].correct, true);
  assert.equal(result.details[1].correct, false);
});

test('handles missing answers', () => {
  const questions = [{ _id: 'x', correctIndex: 2, marks: 1 }];
  const result = gradeExam(questions, {});
  assert.equal(result.score, 0);
  assert.equal(result.details[0].given, null);
});

test('grades questions keyed by id (question-bank format)', () => {
  const questions = [
    { id: 'q1', correctIndex: 0, marks: 1 },
    { id: 'q2', correctIndex: 2, marks: 2 },
    { id: 'q3', correctIndex: 1, marks: 1 }
  ];
  const result = gradeExam(questions, { q1: 0, q2: 2, q3: 0 });
  assert.equal(result.score, 3);
  assert.equal(result.totalMarks, 4);
  assert.equal(result.details[0].correct, true);
  assert.equal(result.details[1].correct, true);
  assert.equal(result.details[2].correct, false);
});

test('accepts string answer values from form inputs', () => {
  const questions = [{ id: 'q1', correctIndex: 1, marks: 1 }];
  const result = gradeExam(questions, { q1: '1' });
  assert.equal(result.score, 1);
  assert.equal(result.details[0].given, 1);
});

test('mixed id/_id questions grade correctly', () => {
  const questions = [
    { id: 'withId', correctIndex: 0, marks: 1 },
    { _id: 'withObjectId', correctIndex: 1, marks: 1 }
  ];
  const result = gradeExam(questions, { withId: 0, withObjectId: 1 });
  assert.equal(result.score, 2);
});
