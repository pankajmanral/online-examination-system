function gradeExam(questions, answers) {
  let score = 0;
  let totalMarks = 0;
  const details = questions.map((q) => {
    const marks = q.marks || 1;
    totalMarks += marks;
    const key = q.id || q._id;
    const given =
      answers && (answers[key] !== undefined ? answers[key] : answers[q._id]);
    const isCorrect = given !== undefined && Number(given) === q.correctIndex;
    if (isCorrect) score += marks;
    return {
      questionId: String(key),
      given: given === undefined ? null : Number(given),
      correct: isCorrect,
      marks: isCorrect ? marks : 0
    };
  });
  return { score, totalMarks, details };
}

module.exports = { gradeExam };
