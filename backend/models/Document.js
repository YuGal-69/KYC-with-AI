import mongoose from "mongoose";

const docSchema = new mongoose.Schema({
  filename: String,
  originalName: String,
  extractedData: Object,
  riskScore: Number,
  riskFlags: [String],
  explainability: Object,
  ocrConfidence: Number,            // NEW: how confident OCR was
  decision: String,
  validationIssues: [String],
  recommendedAction: String,
  stages: { type: Array },
  uploadedAt: { type: Date, default: Date.now }
});

export default mongoose.model("Document", docSchema);
