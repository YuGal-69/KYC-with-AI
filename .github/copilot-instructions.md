# KYC-with-AI: Copilot Instructions

## Architecture Overview

This is an **AI-powered KYC (Know Your Customer) orchestration platform** with a clear separation of concerns:

- **Backend** (Node.js + Express): Handles OCR, validation, risk scoring, and orchestration via a state-machine pipeline
- **Frontend** (React + Tailwind): Responsive dashboard for document upload and decision visualization
- **Data**: MongoDB for audit trails; Cloudinary for secure document storage; in-memory watchlist (JSON)

### Critical Data Flow

1. **Upload** → File (image) received by backend, stored in Cloudinary (not local disk)
2. **OCR** → Tesseract.js reads the Cloudinary URL, extracts name/DOB/address/idNumber + confidence
3. **Validation** → `validationService.validateKYC()` flags missing/incomplete fields
4. **Risk Scoring** → `riskEngine.calculateRisk()` applies rule-based scoring (missing ID=+50, watchlist=+80, low OCR=+20, etc.)
5. **Decision** → Orchestrator outputs decision (AUTO_APPROVE/<40, REVIEW_REQUIRED/40-69, REJECT/≥70)
6. **Audit** → Entire KYCRecord persisted to MongoDB with full explainability

## Key Files & Responsibilities

### Backend Services

- **`services/ocrService.js`**: Tesseract.js wrapper—runs OCR on Cloudinary URL, extracts structured data + confidence score
- **`services/riskEngine.js`**: Rule-based scoring engine—loads `data/watchlist.json` at startup, applies 5 scoring rules (ID completeness, address validity, watchlist check, OCR confidence, validation issues). **Stateless function** `riskEngine(extractedData, validationIssues)` → returns `{ riskScore, riskFlags, explainability }`
- **`services/validationService.js`**: Sync validation—checks name/DOB/address/idNumber completeness
- **`services/kycOrchestrator.js`**: State-machine pipeline—stages timeline (UPLOAD_RECEIVED → STORED_IN_CLOUD → OCR_EXTRACTION → DATA_VALIDATION → RISK_SCORING → DECISION_COMPLETE)
- **`controllers/kycController.js`**: Express route handlers—orchestrates file upload, Cloudinary streaming, OCR invocation, database save, response formatting
- **`middleware/upload.js`**: Multer memory storage (files NOT written to disk)
- **`models/KYCRecord.js`**: Mongoose schema—audit trail document (documentUrl, extractedData, riskScore, riskFlags, decision, stages, etc.)
- **`config/cloudinary.js`**: Cloudinary SDK initialization (reads env vars)

### Frontend Components

- **`src/App.jsx`**: Single monolithic component—handles file input, API calls (`/upload`, `/history`), result display, history table. Uses `getRiskLabel()` and `getRiskLevel()` helpers to map score → UI state
- **`src/index.css`**: Tailwind directives (@tailwind base/components/utilities)
- **`src/main.jsx`**: Vite entry point
- **`tailwind.config.cjs`**: Tailwind configuration
- **`vite.config.js`**: Vite bundler config

## Development Workflows

### Backend Setup

```bash
cd backend
npm install  # Express, Mongoose, Tesseract, Cloudinary, Multer, Streamifier, Cors, DotEnv
npm run dev  # Starts on http://localhost:4000 with nodemon watch
```

**Required .env**:

```
PORT=4000
MONGO_URI=mongodb://localhost:27017/kyc_ai
CLOUDINARY_CLOUD_NAME=<dashboard_value>
CLOUDINARY_API_KEY=<dashboard_value>
CLOUDINARY_API_SECRET=<dashboard_value>
```

### Frontend Setup

```bash
cd frontend
npm install  # React, Vite, Tailwind, Axios, ESLint
npm run dev  # Starts on http://localhost:5173
npm run build  # Production build to dist/
```

**API Integration**: Frontend calls `http://localhost:4000/api/kyc` (configurable via `VITE_API_BASE_URL`). Routes: `POST /upload`, `GET /history`.

## Project-Specific Patterns

### 1. **Explainability by Default**

Every KYC response includes `explainability.rulesApplied[]` listing which scoring rules triggered. **Always preserve this structure when modifying risk logic**—compliance teams rely on it.

### 2. **Risk Score Tiers Are Hard Boundaries**

```
< 40  → AUTO_APPROVE
40-69 → REVIEW_REQUIRED
≥ 70  → REJECT (or REVIEW_REQUIRED for watchlist cases)
```

Do **not** soften these thresholds—they drive business decisions.

### 3. **Watchlist as JSON, Loaded Once**

`data/watchlist.json` is loaded at riskEngine startup (fs.readFileSync in module scope). Names are case-lowercased before comparison. **If expanding watchlist functionality**, load from DB instead but maintain the "loaded once" pattern to avoid per-request I/O.

### 4. **Cloudinary, Not Local Disk**

All document uploads use Cloudinary's `upload_stream` + `streamifier.createReadStream()` for in-memory buffer → cloud flow. **Never save files to local disk**; use Cloudinary secure_url for OCR input.

### 5. **Stages Timeline as Audit Record**

Each KYC run builds `stages[]` with name/status/timestamp. Orchestrator increments this as it progresses. **Always record stage transitions** when adding new processing steps.

### 6. **Frontend Decision Formatting**

`formatDecision()` and `getRiskLabel()` helpers map backend strings to user-facing labels. **Maintain consistency**—if you add a new decision type in orchestrator, add corresponding helper logic in App.jsx.

## Integration Points & External Dependencies

- **Cloudinary**: Document storage, called via `cloudinary.uploader.upload_stream()` with folder "kyc-documents"
- **Tesseract.js**: OCR, called via `Tesseract.recognize(imageUrl, 'eng')` (English only, uses `eng.traineddata`)
- **MongoDB/Mongoose**: Audit persistence, KYCRecord model with timestamps
- **Multer**: In-memory file buffering (no disk writes)
- **Axios (Frontend)**: HTTP client for API calls, includes error handling and multipart form-data headers
- **Vite**: Frontend bundler, supports env vars via `import.meta.env.VITE_*`

## Common Modification Patterns

### Adding a New Risk Rule

1. Modify `riskEngine.js` → add scoring logic in the switch/if chain
2. Append to `riskFlags[]` with descriptive message (e.g., "Address in high-risk region")
3. Update `explainability.rulesApplied[]` to document the rule
4. Test with KYCRecord audit trail to ensure rule appears in responses

### Updating Decision Logic

1. Modify orchestrator in `services/kycOrchestrator.js` → `runKycOrchestrator()` decision branch
2. Update `recommendedAction` messaging accordingly
3. Add corresponding case in frontend's `formatDecision()` and style helpers if needed
4. Ensure new decision type maps to valid KYCRecord.decision values

### Enhancing OCR Extraction

1. Modify `services/ocrService.js` → add new field extraction logic
2. Update KYCRecord schema if storing new fields
3. Add validation rule in `validationService.js` if field is mandatory
4. Update risk engine if new field impacts scoring
5. Display in frontend (App.jsx extractedData section)

## Environment & Testing Notes

- **No dedicated test suite** currently (no Jest/Mocha configs visible)—manual testing via Postman/curl or frontend UI recommended
- **CORS is open** (`origin: "*"`) for dev convenience—restrict to `["http://localhost:5173"]` or specific domain in production
- **No auth/authorization**—this is a demo; add JWT/OAuth before production use
- **MongoDB assumed local** on `localhost:27017`—update MONGO_URI for cloud instances
- **Tesseract language**: English only (`eng.traineddata` included); expand `Tesseract.recognize()` languages if needed

## Quick Diagnostic Commands

```bash
# Test backend ping
curl http://localhost:4000/api/ping

# Upload test document
curl -X POST -F "document=@/path/to/image.jpg" http://localhost:4000/api/kyc/upload

# Check history
curl http://localhost:4000/api/kyc/history

# Verify MongoDB
mongosh --eval "db.kycrecords.countDocuments()"

# Check Cloudinary credentials
echo $CLOUDINARY_CLOUD_NAME  # should be non-empty
```
