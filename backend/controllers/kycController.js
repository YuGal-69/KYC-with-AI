// backend/controllers/kycController.js
import KYCRecord from "../models/KYCRecord.js";
import runOCR from "../services/ocrService.js";
import riskEngine from "../services/riskEngine.js";
import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";

export const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // 1) Upload buffer to Cloudinary using upload_stream
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "kyc-documents", // just a folder in your cloud
          resource_type: "auto",
        },
        (error, result) => {
          if (error) {
            console.error("❌ Cloudinary upload error:", error);
            return reject(error);
          }
          resolve(result);
        }
      );

      // Pipe the in-memory buffer into Cloudinary
      streamifier.createReadStream(req.file.buffer).pipe(stream);
    });

    const documentUrl = uploadResult.secure_url; // this is what we use for OCR & DB

    const stages = [
      {
        name: "UPLOAD_RECEIVED",
        status: "completed",
        timestamp: new Date(),
      },
      {
        name: "STORED_IN_CLOUD",
        status: "completed",
        timestamp: new Date(),
      },
    ];

    // 2) OCR on Cloudinary URL
    const extractedData = await runOCR(documentUrl);
    stages.push({
      name: "OCR_EXTRACTION",
      status: "completed",
      timestamp: new Date(),
    });

    // 3) Validation
    const validationIssues = [];
    if (!extractedData.idNumber) validationIssues.push("ID Number missing");
    if (!extractedData.address)
      validationIssues.push("Address may be incomplete");
    stages.push({
      name: "DATA_VALIDATION",
      status: "completed",
      timestamp: new Date(),
    });

    // 4) Risk engine
    const { riskScore, riskFlags, explainability } = riskEngine(
      extractedData,
      validationIssues
    );
    stages.push({
      name: "RISK_SCORING",
      status: "completed",
      timestamp: new Date(),
    });

    // 5) Decision
    let decision;
    let recommendedAction;

    if (riskScore < 40) {
      decision = "AUTO_APPROVE";
      recommendedAction = "Customer may proceed to onboarding.";
    } else if (riskScore < 70) {
      decision = "REVIEW_REQUIRED";
      recommendedAction =
        "Ask for clearer ID document or double-verify applicant identity.";
    } else {
      decision = "REJECT";
      recommendedAction = "Document suspicious — escalate to compliance.";
    }

    stages.push({
      name: "DECISION_COMPLETE",
      status: "completed",
      timestamp: new Date(),
    });

    // 6) Save record for audit trail
    const record = await KYCRecord.create({
      documentUrl,
      extractedData,
      riskScore,
      riskFlags,
      decision,
      recommendedAction,
      validationIssues,
      explainability,
      stages,
    });

    return res.json(record);
  } catch (err) {
    console.error("❌ /api/kyc/upload error:");
    console.error(err);
    console.error(err.stack);

    return res.status(500).json({
      error: err.message || "Internal server error",
    });
  }
};

export const getHistory = async (req, res) => {
  try {
    const records = await KYCRecord.find().sort({ createdAt: -1 });
    return res.json(records);
  } catch (err) {
    console.error("❌ /api/kyc/history error:", err);
    return res.status(500).json({ error: "Failed to fetch history" });
  }
};
