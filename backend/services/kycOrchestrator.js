import { extractDataFromDocument } from "./ocrService.js";
import { calculateRisk } from "./riskEngine.js";
import { validateKYC } from "./validationService.js";

export const runKycOrchestrator = async (filePath) => {
  const stages = [];

  // 1) UPLOADED
  stages.push({
    name: "UPLOADED",
    status: "completed",
    timestamp: new Date()
  });

  // 2) EXTRACTING
  stages.push({
    name: "EXTRACTING",
    status: "in_progress",
    timestamp: new Date()
  });
  const extracted = await extractDataFromDocument(filePath);
  stages[1].status = "completed";

  // 3) VALIDATING
  stages.push({
    name: "VALIDATING",
    status: "in_progress",
    timestamp: new Date()
  });
  const { issues } = validateKYC(extracted);
  stages[2].status = "completed";

  // 4) RISK_SCORING
  stages.push({
    name: "RISK_SCORING",
    status: "in_progress",
    timestamp: new Date()
  });
  const risk = calculateRisk(extracted);
  stages[3].status = "completed";

  // 5) DECISION
  let decision = "AUTO_APPROVE";

  const hasWatchlistFlag = risk.riskFlags.includes(
    "Name appears in sanctions / watchlist"
  );

  if (hasWatchlistFlag || risk.riskScore >= 70) {
    decision = "REVIEW_REQUIRED";
  } else if (issues.length > 0 || risk.riskScore >= 40) {
    decision = "REVIEW_REQUIRED";
  }

  let recommendedAction = "";
  if (decision === "AUTO_APPROVE") {
    recommendedAction =
      "Customer can be auto-approved based on current data and low risk.";
  } else {
    if (issues.includes("ID Number missing")) {
      recommendedAction =
        "Ask the customer to upload a clearer ID document showing the ID number.";
    } else if (hasWatchlistFlag) {
      recommendedAction =
        "Escalate this case to the compliance team for enhanced due diligence.";
    } else {
      recommendedAction = "Route this application for manual review by the KYC team.";
    }
  }

  stages.push({
    name: "DECISION",
    status: "completed",
    timestamp: new Date(),
    decision
  });

  return {
    stages,
    extractedData: extracted,
    validationIssues: issues,
    riskScore: risk.riskScore,
    riskFlags: risk.riskFlags,
    explainability: risk.explainability,
    decision,
    recommendedAction
  };
};
