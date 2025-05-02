@echo off
echo Starting Resume Generator Application...

echo Starting Node.js server on port 3000...
start cmd /k "node server.js"

echo Starting React frontend...
cd resume_frontend
start cmd /k "npm run dev"

echo Application started! 
echo Backend: http://localhost:3000
echo Frontend: http://localhost:5173 