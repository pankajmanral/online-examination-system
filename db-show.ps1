# Shows all database contents — run during your presentation:
#   powershell -ExecutionPolicy Bypass -File db-show.ps1
# Filter one database:
#   powershell -File db-show.ps1 -Database exam_results

param([string]$Database = '')

$dbs = if ($Database) { @($Database) } else { @('exam_auth', 'exam_students', 'exam_questions', 'exam_exams', 'exam_results') }

foreach ($name in $dbs) {
  Write-Host ""
  Write-Host ("=" * 60) -ForegroundColor Cyan
  Write-Host " DATABASE: $name" -ForegroundColor Cyan
  Write-Host ("=" * 60) -ForegroundColor Cyan

  $eval = "const d = db.getSiblingDB('$name'); d.getCollectionNames().forEach(n => { printjson({collection: n, count: d.getCollection(n).countDocuments(), documents: d.getCollection(n).find().limit(10).toArray()}); });"
  $out = docker exec online-examination-system-mongo-1 mongosh --quiet --eval $eval 2>&1

  # mongosh prints extended JSON; pretty-print key fields per known collection
  switch ($name) {
    'exam_auth' {
      docker exec online-examination-system-mongo-1 mongosh --quiet --eval "db.getSiblingDB('exam_auth').users.find({}, {name:1,email:1,role:1,passwordHash:1}).forEach(printjson)"
    }
    'exam_students' {
      docker exec online-examination-system-mongo-1 mongosh --quiet --eval "db.getSiblingDB('exam_students').students.find().forEach(printjson)"
    }
    'exam_questions' {
      docker exec online-examination-system-mongo-1 mongosh --quiet --eval "db.getSiblingDB('exam_questions').questions.find({}, {text:1,options:1,correctIndex:1,subject:1,marks:1}).forEach(printjson)"
    }
    'exam_exams' {
      Write-Host "-- exams --" -ForegroundColor Yellow
      docker exec online-examination-system-mongo-1 mongosh --quiet --eval "db.getSiblingDB('exam_exams').exams.find({}, {title:1,subject:1,durationMinutes:1,questionIds:1}).forEach(printjson)"
      Write-Host "-- attempts --" -ForegroundColor Yellow
      docker exec online-examination-system-mongo-1 mongosh --quiet --eval "db.getSiblingDB('exam_exams').attempts.find({}, {examId:1,studentName:1,score:1,totalMarks:1,status:1,answers:1,submittedAt:1}).limit(10).forEach(printjson)"
    }
    'exam_results' {
      docker exec online-examination-system-mongo-1 mongosh --quiet --eval "db.getSiblingDB('exam_results').results.find().sort({submittedAt:-1}).forEach(printjson)"
    }
  }
}
