import React, { useEffect, useState } from "react";
import axios from "axios";

const API_BASE = "http://localhost:4000/api/kyc";

const getRiskLabel = (score) => {
  if (score >= 70) return "High Risk – Manual Review";
  if (score >= 40) return "Medium Risk – Review Recommended";
  return "Low Risk – Auto-Approval Candidate";
};

const getRiskLevel = (score) => {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
};

const formatDecision = (decision) => {
  switch (decision) {
    case "AUTO_APPROVE":
      return "Auto-Approve (Low Risk)";
    case "REVIEW_REQUIRED":
      return "Manual Review Required";
    case "REJECT":
      return "Rejected";
    default:
      return decision || "Pending";
  }
};

function App() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API_BASE}/history`);
      setHistory(res.data);
    } catch (err) {
      console.error("Failed to load history");
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a document to upload.");
      return;
    }

    setError("");
    setResult(null);
    setLoading(true);

    const formData = new FormData();
    formData.append("document", file);

    try {
      const res = await axios.post(`${API_BASE}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
      fetchHistory();
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError("Upload failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const riskLevel = result ? getRiskLevel(result.riskScore) : null;
  const ocrConf =
    result?.ocrConfidence ??
    (result?.extractedData && result.extractedData.confidence);

  const riskColorClass =
    riskLevel === "high"
      ? "text-red-400"
      : riskLevel === "medium"
      ? "text-yellow-300"
      : "text-emerald-400";

  const riskBadgeClass =
    riskLevel === "high"
      ? "bg-red-500/15 text-red-300 border border-red-500/60"
      : riskLevel === "medium"
      ? "bg-yellow-500/15 text-yellow-200 border border-yellow-500/60"
      : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/60";

  const getRiskCellClass = (score) => {
    const level = getRiskLevel(score || 0);
    if (level === "high") return "text-red-300";
    if (level === "medium") return "text-yellow-200";
    return "text-emerald-300";
  };

  const renderStages = () => {
    if (!result || !result.stages) return null;

    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-soft-glow p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold">Orchestration Stages</h3>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border border-slate-500/60 bg-slate-800/60 text-slate-300">
            End-to-end trace
          </span>
        </div>

        <div className="space-y-3">
          {result.stages.map((stage, idx) => (
            <div key={idx} className="relative flex gap-3 pb-3">
              {idx !== result.stages.length - 1 && (
                <span className="absolute left-[7px] top-3 h-full w-px bg-slate-600" />
              )}
              <div
                className={`w-3.5 h-3.5 rounded-full border-2 mt-1 ${
                  stage.status === "completed"
                    ? "border-sky-400 bg-sky-400/30"
                    : "border-slate-500 bg-slate-900"
                }`}
              />
              <div className="text-xs">
                <div className="font-medium tracking-wide">
                  {stage.name || "Stage"}
                </div>
                <div className="text-slate-400">
                  {stage.status === "completed"
                    ? "Completed"
                    : stage.status || "In progress"}
                </div>
                {stage.timestamp && (
                  <div className="text-[11px] text-slate-500">
                    {new Date(stage.timestamp).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="container mx-auto max-w-12xl px-4 py-5">
        {/* HEADER */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-wide">
              KYC AI Orchestrator
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-xl">
              AI-powered KYC that reads documents, validates data, scores risk,
              and recommends actions — making onboarding effortless and compliant.
            </p>
          </div>
          <div className="flex flex-col sm:items-end gap-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-brand.blue to-brand.purple text-slate-950 shadow-md">
              Theme 5
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] border border-slate-600 bg-slate-900/70 text-slate-300">
              Reimagining KYC with AI
            </span>
          </div>
        </header>

        {/* MAIN: row with two cols */}
        <div className="flex flex-wrap gap-4 justify-between">
          {/* LEFT COLUMN */}
          <div className="flex-1 min-w-[320px] flex flex-col gap-4">
            {/* Upload Card */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-soft-glow p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <h3 className="text-sm font-semibold">
                    Customer Document Upload
                  </h3>
                  <p className="text-xs text-slate-400">
                    Upload ID / address proof (JPG / PNG)
                  </p>
                </div>
              </div>

              <form onSubmit={handleUpload} className="flex flex-col gap-3 mt-2">
                <label className="border border-dashed border-slate-600 rounded-xl bg-slate-950/70 hover:border-sky-400 transition-colors cursor-pointer px-4 py-3 flex items-center gap-3">
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files[0])}
                  />
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-sky-400/15 text-lg">
                    📄
                  </div>
                  <div>
                    <div className="text-sm">
                      {file ? file.name : "Click to browse or drag & drop"}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Supported: JPG / PNG (PDF coming soon)
                    </div>
                  </div>
                </label>

                <button
                  type="submit"
                  className="
                    inline-flex items-center justify-center rounded-full 
                    bg-gradient-to-r from-indigo-500 to-purple-500 
                    hover:from-indigo-600 hover:to-purple-600
                    text-white text-xs font-semibold
                    px-4 py-2 shadow-md transition-all duration-200
                    disabled:opacity-50 disabled:cursor-not-allowed
                  "
                  disabled={loading}
                >
                  {loading ? "Analyzing..." : "Upload & Run KYC AI"}
                </button>

              </form>

              {error && (
                <p className="text-xs text-red-400 mt-2">{error}</p>
              )}
              {loading && (
                <p className="text-xs text-slate-400 mt-1">
                  ⏳ Processing document...
                </p>
              )}
            </div>

            {/* Decision + Details */}
            {result && (
              <>
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-soft-glow p-4">
                  {/* Decision header */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold">Decision Summary</h3>
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium ${riskBadgeClass}`}
                    >
                      {formatDecision(result.decision)}
                    </span>
                  </div>

                  {/* Metrics row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                    <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2.5">
                      <div className="text-[11px] text-slate-400">
                        Risk Score
                      </div>
                      <div
                        className={`mt-1 text-lg font-semibold ${riskColorClass}`}
                      >
                        {result.riskScore}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {getRiskLabel(result.riskScore)}
                      </div>
                    </div>

                    <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2.5">
                      <div className="text-[11px] text-slate-400">
                        OCR Confidence
                      </div>
                      <div className="mt-1 text-lg font-semibold">
                        {ocrConf !== undefined
                          ? `${ocrConf.toFixed(1)}%`
                          : "N/A"}
                      </div>
                      {ocrConf !== undefined && ocrConf < 60 && (
                        <div className="text-[11px] text-yellow-300 mt-1">
                          Low confidence — ask for clearer image
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Recommended action */}
                  {result.recommendedAction && (
                    <div className="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs">
                      <div className="uppercase tracking-wide text-[10px] text-emerald-300 mb-1">
                        Recommended Action
                      </div>
                      <p>{result.recommendedAction}</p>
                    </div>
                  )}

                  {/* Validation issues */}
                  {result.validationIssues &&
                    result.validationIssues.length > 0 && (
                      <div className="mt-3">
                        <div className="text-[11px] text-slate-400 mb-1">
                          Validation Issues
                        </div>
                        <ul className="list-disc list-inside text-xs text-slate-200 space-y-0.5">
                          {result.validationIssues.map((issue, idx) => (
                            <li key={idx}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {/* Extracted details */}
                  <div className="mt-4">
                    <div className="text-[11px] text-slate-400 mb-2">
                      Extracted Applicant Details
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-[11px] text-slate-400">Name</div>
                        <div className="mt-0.5">
                          {result.extractedData?.name || "-"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-400">
                          Date of Birth
                        </div>
                        <div className="mt-0.5">
                          {result.extractedData?.dob || "-"}
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <div className="text-[11px] text-slate-400">
                          Address
                        </div>
                        <div className="mt-0.5">
                          {result.extractedData?.address || "-"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-400">
                          ID Number
                        </div>
                        <div className="mt-0.5">
                          {result.extractedData?.idNumber || "-"}
                        </div>
                      </div>
                    </div>

                    {!result.extractedData?.idNumber && (
                      <p className="mt-2 text-[11px] text-yellow-300">
                        ⚠ ID number could not be detected. Ask customer to
                        upload a clearer image where the ID number is fully
                        visible.
                      </p>
                    )}
                  </div>
                </div>

                {/* Explainability */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-soft-glow p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold">
                      Explainability & Rules Applied
                    </h3>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border border-slate-600 bg-slate-900/80 text-slate-300">
                      For auditors & compliance
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[1fr,1.2fr] gap-3 mt-2">
                    <div>
                      <div className="text-[11px] text-slate-400 mb-1">
                        Risk Flags
                      </div>
                      {result.riskFlags && result.riskFlags.length > 0 ? (
                        <ul className="list-disc list-inside text-xs text-slate-200 space-y-0.5">
                          {result.riskFlags.map((flag, idx) => (
                            <li key={idx}>{flag}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-slate-300">
                          No risk flags. Customer appears low risk.
                        </p>
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-[11px] max-h-48 overflow-auto">
                      <pre className="whitespace-pre-wrap break-words">
                        {JSON.stringify(result.explainability, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>

                {/* Stages timeline */}
                {renderStages()}
              </>
            )}
          </div>

          {/* RIGHT COLUMN – HISTORY */}
          <div className="flex-1 lg:flex-none lg:w-80 xl:w-96 min-w-[280px] flex flex-col gap-4">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-soft-glow p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold">Recent KYC Checks</h3>
                <span className="text-[11px] text-slate-400">
                  Audit trail
                </span>
              </div>

              {history.length === 0 ? (
                <p className="text-xs text-slate-400 mt-2">
                  No records yet. Upload a document to begin.
                </p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-950/80">
                        <th className="text-left px-2 py-1.5 border-b border-slate-800 text-slate-400 font-medium">
                          Name
                        </th>
                        <th className="text-left px-2 py-1.5 border-b border-slate-800 text-slate-400 font-medium">
                          Risk
                        </th>
                        <th className="text-left px-2 py-1.5 border-b border-slate-800 text-slate-400 font-medium">
                          Decision
                        </th>
                        <th className="text-left px-2 py-1.5 border-b border-slate-800 text-slate-400 font-medium">
                          Flags
                        </th>
                        <th className="text-left px-2 py-1.5 border-b border-slate-800 text-slate-400 font-medium">
                          Time
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((doc) => (
                        <tr
                          key={doc._id}
                          className="hover:bg-slate-900/80 transition-colors"
                        >
                          <td className="px-2 py-1.5 border-b border-slate-900">
                            {doc.extractedData?.name || "-"}
                          </td>
                          <td
                            className={`px-2 py-1.5 border-b border-slate-900 ${getRiskCellClass(
                              doc.riskScore
                            )}`}
                          >
                            {doc.riskScore ?? "-"}
                          </td>
                          <td className="px-2 py-1.5 border-b border-slate-900">
                            {formatDecision(doc.decision)}
                          </td>
                          <td className="px-2 py-1.5 border-b border-slate-900">
                            {doc.riskFlags && doc.riskFlags.length > 0
                              ? doc.riskFlags.join(", ")
                              : "None"}
                          </td>
                          <td className="px-2 py-1.5 border-b border-slate-900 text-slate-400">
                            {doc.uploadedAt
                              ? new Date(doc.uploadedAt).toLocaleString()
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
