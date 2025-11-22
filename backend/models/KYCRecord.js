// backend/models/KYCRecord.js
import mongoose from "mongoose";

const KYCRecordSchema = new mongoose.Schema(
  {
    documentUrl: String,
    extractedData: Object,
    riskScore: Number,
    riskFlags: [String],
    decision: String,
    recommendedAction: String,
    validationIssues: [String],
    explainability: Object,
    stages: [
      {
        name: String,
        status: String,
        timestamp: Date,
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("KYCRecord", KYCRecordSchema);
