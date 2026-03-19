# Deploy Firebase Security Rules
# This script deploys both Firestore and Storage security rules

# Make sure you're logged in to Firebase CLI:
# firebase login

# Deploy Firestore rules
Write-Host "Deploying Firestore security rules..." -ForegroundColor Yellow
firebase deploy --only firestore:rules

# Deploy Storage rules  
Write-Host "Deploying Firebase Storage security rules..." -ForegroundColor Yellow
firebase deploy --only storage

Write-Host "Security rules deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Summary of deployed rules:" -ForegroundColor Cyan
Write-Host "1. Firestore Rules (firestore.rules):" -ForegroundColor White
Write-Host "   - User profiles: Users can read/write own profile, others can read basic info" -ForegroundColor Gray
Write-Host "   - Students cannot add linkedStudentIds (only parents/teachers can)" -ForegroundColor Gray
Write-Host "   - Legacy practice sessions rules maintained" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Storage Rules (storage.rules):" -ForegroundColor White
Write-Host "   - Students can read/write their own session JSON files" -ForegroundColor Gray
Write-Host "   - Parents/Teachers can read sessions of linked students only" -ForegroundColor Gray
Write-Host "   - Cross-references Firestore user profiles for linking validation" -ForegroundColor Gray