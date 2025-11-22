# KYC with AI – Intelligent KYC Orchestrator

An end-to-end **AI-powered KYC (Know Your Customer) platform** that makes onboarding effortless for customers and banks.

The system ingests customer ID / address documents, runs **OCR**, performs **risk analysis**, and gives a **clear decision** with explainability – all in a modern, responsive dashboard.

---

## 🔍 What this project does

- 📄 **Document Upload (Image)**  
  Upload ID/address proof (JPG/PNG) from the frontend.

- ☁ **Cloud Storage (Cloudinary)**  
  Files are stored securely in Cloudinary instead of the server disk.

- 🔠 **OCR Extraction (Tesseract.js)**  
  Reads text from the document and extracts:
  - Name  
  - Date of Birth  
  - Address  
  - ID Number  
  - OCR confidence score

- 🧠 **Rule-Based Risk Engine**
  - Flags missing ID number
  - Detects suspicious / noisy addresses
  - Checks names against a sanctions/watchlist JSON
  - Penalizes low OCR confidence
  - Returns:
    - `riskScore` (0–100)  
    - `riskFlags[]`  
    - `explainability.rulesApplied[]`

- 🧭 **KYC Orchestrator (Stages Timeline)**
  Each request passes through stages:
  1. `UPLOAD_RECEIVED`  
  2. `STORED_IN_CLOUD`  
  3. `OCR_EXTRACTION`  
  4. `DATA_VALIDATION`  
  5. `RISK_SCORING`  
  6. `DECISION_COMPLETE`  

- ✅ **Decision Engine**
  Based on `riskScore`:
  - `< 40` → `AUTO_APPROVE`
  - `40–69` → `REVIEW_REQUIRED`
  - `≥ 70` → `REJECT`

- 📜 **Audit Trail**
  Every KYC run is stored in MongoDB with:
  - Extracted data  
  - Risk score & flags  
  - Decision & recommended action  
  - Full explainability object  
  - Stages timeline  
  - Document URL (Cloudinary)  

- 📊 **Responsive Dashboard (React + Tailwind)**
  - Left: upload + decision summary + risk + explainability
  - Right: recent KYC checks table (audit trail)
  - Fully responsive (desktop, tablet, mobile)

---

## 🏗 Tech Stack

**Frontend**
- React (Vite)
- Tailwind CSS
- Axios

**Backend**
- Node.js + Express
- MongoDB + Mongoose
- Tesseract.js (OCR)
- Cloudinary (file storage)
- Multer (file upload – memory storage)
- streamifier (buffer → stream for Cloudinary)

---

## 📂 Project Structure

```bash
KYC-with-AI/
├─ backend/
│  ├─ server.js
│  ├─ routes/
│  │  └─ kycRoutes.js
│  ├─ controllers/
│  │  └─ kycController.js
│  ├─ middleware/
│  │  └─ upload.js
│  ├─ services/
│  │  ├─ ocrService.js
│  │  └─ riskEngine.js
│  ├─ models/
│  │  └─ KYCRecord.js
│  ├─ config/
│  │  └─ cloudinary.js
│  └─ data/
│     └─ watchlist.json
│
└─ frontend/
   ├─ src/
   │  ├─ App.jsx
   │  ├─ main.jsx
   │  └─ index.css
   ├─ index.html
   └─ tailwind.config.cjs


⚙️ Backend Setup
1. Move into backend folder
cd backend

2. Install dependencies
npm install


(Express, Mongoose, Tesseract, Cloudinary, Multer, etc.)

3. Create .env in backend/
PORT=4000
MONGO_URI=mongodb://localhost:27017/kyc_ai

# Cloudinary (from your Cloudinary dashboard)
CLOUDINARY_CLOUD_NAME=your_real_cloud_name_here
CLOUDINARY_API_KEY=your_real_api_key_here
CLOUDINARY_API_SECRET=your_real_api_secret_here


🔒 Important: Never commit .env to Git. It should be in .gitignore.

4. Run backend in dev mode
npm run dev


Backend will start on:

http://localhost:4000

🎨 Frontend Setup
1. Move into frontend folder
cd frontend

2. Install dependencies
npm install


Includes React, Vite, Tailwind, Axios, etc.

3. Tailwind entry (already wired)

src/index.css:

@tailwind base;
@tailwind components;
@tailwind utilities;


src/main.jsx imports ./index.css.

4. Run frontend
npm run dev


Vite will start something like:

http://localhost:5173

🔗 API Endpoints

Base URL: http://localhost:4000/api/kyc

POST /upload

Description: Upload a customer KYC document and run full orchestration.

Body (multipart/form-data):

Field	Type	Description
document	File	Image (JPG/PNG) of ID/etc

Response (example):

{
  "_id": "65f1...",
  "documentUrl": "https://res.cloudinary.com/.../image/upload/...",
  "extractedData": {
    "name": "Aman Sharma",
    "dob": "1992-10-05",
    "address": "12 MG Road, Pune",
    "idNumber": "X1234567",
    "rawText": "Sample OCR result text",
    "confidence": 78.4
  },
  "riskScore": 50,
  "riskFlags": ["Missing ID Number"],
  "decision": "REVIEW_REQUIRED",
  "recommendedAction": "Ask for clearer ID document or double-verify applicant identity.",
  "validationIssues": ["ID Number missing"],
  "explainability": {
    "reason": "Rule-based risk scoring (ID completeness, address validity, watchlist screening, OCR confidence, validation issues)",
    "rulesApplied": ["Missing ID Number"]
  },
  "stages": [
    { "name": "UPLOAD_RECEIVED", "status": "completed", "timestamp": "..." },
    { "name": "STORED_IN_CLOUD", "status": "completed", "timestamp": "..." },
    { "name": "OCR_EXTRACTION", "status": "completed", "timestamp": "..." },
    { "name": "DATA_VALIDATION", "status": "completed", "timestamp": "..." },
    { "name": "RISK_SCORING", "status": "completed", "timestamp": "..." },
    { "name": "DECISION_COMPLETE", "status": "completed", "timestamp": "..." }
  ],
  "createdAt": "...",
  "updatedAt": "..."
}

GET /history

Description: Fetch recent KYC checks (audit log).

Response: Array of KYCRecord documents.

💡 How the KYC Orchestrator Works

For each upload, the backend:

Receives the file (Multer memory storage)

Uploads buffer to Cloudinary (secure URL)

Runs OCR on the Cloudinary URL with Tesseract.js

Parses text → name, dob, address, idNumber, confidence

Validates fields → builds validationIssues[]

Runs riskEngine(extractedData, validationIssues)

Decides:

Auto-approve / Manual review / Reject

Saves everything in MongoDB for audit

Returns full JSON to the React dashboard

The frontend then shows:

Decision summary

Risk score + label

OCR confidence + nudge

Validation issues

Extracted data

Explainability JSON

Orchestration stages timeline

Recent KYC checks table

🔒 Security Notes

Sensitive configuration (.env) is not committed (ignored via .gitignore).

Documents are stored in Cloudinary, not on local disk.

Risk logic is transparent and explainable via rulesApplied.

🚀 Future Improvements

AI-based document forgery/fraud detection

Face match between selfie and ID photo

Multi-tenant support for multiple banks

Role-based access (agent vs compliance officer)

More advanced NLP-based field extraction

🧑‍💻 Development Scripts

From backend/:

npm run dev   # start backend with nodemon


From frontend/:

npm run dev   # start Vite dev server
npm run build # production build


If you clone this repo:

git clone https://github.com/YOUR_USERNAME/KYC-with-AI.git
cd KYC-with-AI/backend
npm install
# create backend/.env
npm run dev

cd ../frontend
npm install
npm run dev


You’ll have a full AI KYC demo running locally. 🧠📄✅

::contentReference[oaicite:0]{index=0}