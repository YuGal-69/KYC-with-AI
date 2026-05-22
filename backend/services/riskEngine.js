// backend/services/riskEngine.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load watchlist once at startup
let watchlist = [];
try {
  const filePath = path.join(__dirname, "..", "data", "watchlist.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  watchlist = JSON.parse(raw).map((n) => n.toLowerCase());
  console.log("✅ Watchlist loaded with", watchlist.length, "entries");
} catch (e) {
  console.warn("⚠ Could not load watchlist.json, continuing without it");
}

/**
 * Rule-based risk engine.
 * extractedData: result from OCR (name, dob, address, idNumber, confidence)
 * validationIssues: array of strings
 */
function riskEngine(extractedData = {}, validationIssues = []) {
  let riskScore = 0;
  const riskFlags = [];

  // 1) Missing ID number
  if (!extractedData.idNumber) {
    riskScore += 50;
    riskFlags.push("Missing ID Number");
  }

  // 2) Address issues
  if (extractedData.address) {
    const addr = extractedData.address;
    const addrLower = addr.toLowerCase();

    if (addrLower.includes("unknown") || addrLower.includes("n/a")) {
      riskScore += 30;
      riskFlags.push("Suspicious / Invalid Address");
    }

    const ratioLetters = (addr.match(/[A-Za-z]/g) || []).length / addr.length;
    if (ratioLetters < 0.4) {
      riskScore += 20;
      riskFlags.push("Address text looks noisy / unreadable");
    }
  }

  // 3) Watchlist / sanctions
  const amlFlags = [];
  if (extractedData.name) {
    const nameLower = extractedData.name.toLowerCase().trim();
    const match = watchlist.find((w) => nameLower.includes(w) || w.includes(nameLower));
    if (match) {
      riskScore += 80;
      riskFlags.push("Name appears in sanctions / watchlist");
      amlFlags.push(`Watchlist hit: matched name "${match}" on global PEP/Sanction registry`);
    }
  }

  // 4) Low OCR confidence
  if (extractedData.confidence !== undefined && extractedData.confidence < 50) {
    riskScore += 20;
    riskFlags.push("Low OCR confidence – data may be incomplete");
  }

  // 5) Validation issues
  if (Array.isArray(validationIssues)) {
    for (const issue of validationIssues) {
      riskScore += 5;
      riskFlags.push(issue);
    }
  }

  // Clamp 0–100
  if (riskScore > 100) riskScore = 100;
  if (riskScore < 0) riskScore = 0;

  return {
    riskScore,
    riskFlags,
    amlFlags,
    explainability: {
      reason:
        "Rule-based risk scoring (ID completeness, address validity, watchlist screening, OCR confidence, validation issues)",
      rulesApplied: [...riskFlags],
    },
  };
}

export default riskEngine;
