import React, { useEffect, useState } from "react";
import axios from "axios";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/kyc";

const getRiskLabel = (score) => {
  if (score >= 70) return "High Risk – Escalated";
  if (score >= 40) return "Medium Risk – Review Required";
  return "Low Risk – Verified";
};

const getRiskLevel = (score) => {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
};

const formatDecision = (decision, reviewerDecision) => {
  if (reviewerDecision) {
    return reviewerDecision === "APPROVED"
      ? "Manual Approved (Audited)"
      : "Manual Rejected (Audited)";
  }
  switch (decision) {
    case "AUTO_APPROVE":
      return "Auto-Approve (Low Risk)";
    case "REVIEW_REQUIRED":
      return "Needs Compliance Review";
    case "REJECT":
      return "Auto-Rejected";
    default:
      return decision || "Pending";
  }
};

function App() {
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [docTypeFilter, setDocTypeFilter] = useState("ALL");

  // Auditor Review Override States
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  // UI Tabs and Interactive Hovers
  const [activeTab, setActiveTab] = useState("analyzer"); // "analyzer" | "analytics" | "watchlist"
  const [hoveredField, setHoveredField] = useState(null); // 'name' | 'dob' | 'address' | 'idNumber'

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

  // Update preview when file changes
  useEffect(() => {
    if (!file) {
      setFilePreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setFilePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

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
        setError("Upload failed. Check server logs or Cloudinary settings.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReviewOverride = async (decision) => {
    if (!result) return;
    setSubmittingReview(true);
    try {
      const res = await axios.put(`${API_BASE}/review/${result._id}`, {
        reviewerDecision: decision,
        reviewerNotes,
      });
      setResult(res.data);
      setReviewerNotes("");
      fetchHistory();
    } catch (err) {
      console.error("Override failed", err);
      alert("Failed to submit review override.");
    } finally {
      setSubmittingReview(false);
    }
  };

  // Metrics Calculations (dynamic from MongoDB history)
  const totalChecks = history.length;
  const autoApproved = history.filter(h => h.decision === "AUTO_APPROVE" && !h.reviewerDecision).length;
  const manualApproved = history.filter(h => h.reviewerDecision === "APPROVED").length;
  const totalApproved = autoApproved + manualApproved;
  const autoApproveRate = totalChecks ? Math.round((totalApproved / totalChecks) * 100) : 0;
  
  const amlFlagsCount = history.filter(h => h.amlFlags && h.amlFlags.length > 0).length;
  const averageConfidence = totalChecks
    ? (history.reduce((acc, h) => acc + (h.extractedData?.confidence || 0), 0) / totalChecks).toFixed(1)
    : "0.0";
  const pendingReviews = history.filter(h => h.decision === "REVIEW_REQUIRED" && !h.reviewerDecision).length;

  // Filtered History List
  const filteredHistory = history.filter(doc => {
    const name = doc.extractedData?.name || "";
    const idNum = doc.extractedData?.idNumber || "";
    const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          idNum.toLowerCase().includes(searchQuery.toLowerCase());
    
    const docType = doc.extractedData?.docType || "GENERIC";
    const matchesDocType = docTypeFilter === "ALL" || docType === docTypeFilter;

    let matchesStatus = true;
    if (statusFilter !== "ALL") {
      if (statusFilter === "AUTO_APPROVE") matchesStatus = doc.decision === "AUTO_APPROVE" && !doc.reviewerDecision;
      else if (statusFilter === "REVIEW_REQUIRED") matchesStatus = doc.decision === "REVIEW_REQUIRED" && !doc.reviewerDecision;
      else if (statusFilter === "REJECT") matchesStatus = doc.decision === "REJECT" && !doc.reviewerDecision;
      else if (statusFilter === "APPROVED") matchesStatus = doc.reviewerDecision === "APPROVED";
      else if (statusFilter === "REJECTED") matchesStatus = doc.reviewerDecision === "REJECTED";
    }

    return matchesSearch && matchesDocType && matchesStatus;
  });

  const riskLevel = result ? getRiskLevel(result.riskScore) : null;
  const ocrConf = result?.extractedData?.confidence ?? 0;

  const riskColorClass =
    riskLevel === "high"
      ? "text-red-400 font-extrabold"
      : riskLevel === "medium"
      ? "text-amber-400 font-bold"
      : "text-emerald-400 font-bold";

  const riskBadgeClass =
    result?.reviewerDecision === "APPROVED" || (result?.decision === "AUTO_APPROVE" && !result?.reviewerDecision)
      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
      : result?.reviewerDecision === "REJECTED" || result?.decision === "REJECT"
      ? "bg-red-500/10 text-red-400 border border-red-500/30"
      : "bg-amber-500/10 text-amber-400 border border-amber-500/30";

  const getRiskCellClass = (score, revDec, rawDec) => {
    if (revDec === "APPROVED" || (rawDec === "AUTO_APPROVE" && !revDec)) return "text-emerald-400";
    if (revDec === "REJECTED" || (rawDec === "REJECT" && !revDec)) return "text-red-400";
    return "text-amber-400";
  };

  // Mock list of global PEP watchlist names for Auditor Reference
  const officialWatchlist = [
    { name: "Aman Shaikh", country: "India", type: "PEP / Sanctions Match" },
    { name: "David Coleman", country: "USA", type: "Terrorism Watchlist" },
    { name: "Mohammed Suleiman", country: "Egypt", type: "PEP / Politically Exposed" },
    { name: "Vladimir Petrov", country: "Russia", type: "Sanctions List" },
    { name: "John Miller", country: "UK", type: "Financial Fraud Registry" },
    { name: "Nirav Modi", country: "India", type: "Financial Crime Interpol Red Corner" },
    { name: "Vijay Mallya", country: "India", type: "AML Watchlist Flag" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500 selection:text-slate-950">
      
      {/* HEADER SECTION */}
      <header className="no-print border-b border-slate-900 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50 px-4 py-3 sm:px-6">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
              <span className="text-xl font-black text-slate-950 tracking-tighter">AI</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">KYC AI Orchestrator</h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-cyan-950 border border-cyan-800 text-cyan-400 animate-pulse">
                  SECURE COMPLIANCE V2
                </span>
              </div>
              <p className="text-xs text-slate-400">Authorized Personnel Audit Dashboard</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex bg-slate-950/80 p-1 border border-slate-800 rounded-xl">
            <button
              onClick={() => setActiveTab("analyzer")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                activeTab === "analyzer"
                  ? "bg-slate-800 text-cyan-400 shadow-sm border border-slate-700/60"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Document Examiner
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                activeTab === "analytics"
                  ? "bg-slate-800 text-cyan-400 shadow-sm border border-slate-700/60"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Auditing Metrics
            </button>
            <button
              onClick={() => setActiveTab("watchlist")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                activeTab === "watchlist"
                  ? "bg-slate-800 text-cyan-400 shadow-sm border border-slate-700/60"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              AML Reference Desk
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        
        {/* COMPLIANCE METRICS STATS BAR */}
        <section className="no-print grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-soft-glow hover:border-slate-700 transition-all duration-200">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Audits</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-black text-white">{totalChecks}</span>
              <span className="text-xs text-slate-500">runs</span>
            </div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-soft-glow hover:border-slate-700 transition-all duration-200">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Pass Rate</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-black text-emerald-400">{autoApproveRate}%</span>
              <span className="text-[10px] text-slate-500 font-mono">auto/manual</span>
            </div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-soft-glow hover:border-slate-700 transition-all duration-200">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Escalated</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className={`text-3xl font-black ${pendingReviews > 0 ? "text-amber-400" : "text-slate-500"}`}>
                {pendingReviews}
              </span>
              <span className="text-xs text-slate-500">pending</span>
            </div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-soft-glow hover:border-slate-700 transition-all duration-200">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">AML Flags</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className={`text-3xl font-black ${amlFlagsCount > 0 ? "text-red-400" : "text-slate-500"}`}>
                {amlFlagsCount}
              </span>
              <span className="text-xs text-slate-500">hits</span>
            </div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 col-span-2 lg:col-span-1 flex flex-col justify-between shadow-soft-glow hover:border-slate-700 transition-all duration-200">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Avg Confidence</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-black text-cyan-400">{averageConfidence}%</span>
              <span className="text-xs text-slate-500">ocr precision</span>
            </div>
          </div>
        </section>

        {/* TAB 1: DOCUMENT EXAMINER (MAIN COMPLIANCE WORKSPACE) */}
        {activeTab === "analyzer" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* LEFT AREA: SCAN & INSPECTOR (lg:col-span-7) */}
            <div className="no-print lg:col-span-7 flex flex-col gap-6">
              
              {/* Document Dropper / Uploader */}
              <div className="bg-slate-900/65 border border-slate-800/85 rounded-3xl p-5 shadow-lg shadow-black/30">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-wide">Customer Document Examiner</h3>
                    <p className="text-xs text-slate-400">Load identity credential for immediate OCR extraction & safety check</p>
                  </div>
                  <div className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)]" />
                </div>

                <form onSubmit={handleUpload} className="flex flex-col gap-4">
                  <label className="border border-dashed border-slate-700 rounded-2xl bg-slate-950/70 hover:border-cyan-500/50 hover:bg-slate-900/30 transition-all duration-200 cursor-pointer p-6 flex flex-col items-center justify-center text-center gap-3">
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files[0])}
                    />
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-cyan-500/10 text-cyan-400 text-2xl shadow-inner border border-cyan-500/10">
                      📂
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-semibold tracking-wide text-slate-200">
                        {file ? file.name : "Drag & drop file or click to browse"}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        PNG, JPG, WebP image formats supported (Max 10MB)
                      </div>
                    </div>
                  </label>

                  <button
                    type="submit"
                    className="
                      w-full relative overflow-hidden inline-flex items-center justify-center rounded-xl
                      bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-600 hover:to-indigo-700
                      text-slate-950 text-xs sm:text-sm font-extrabold uppercase tracking-widest
                      py-3.5 shadow-md shadow-cyan-500/10 transition-all duration-300 transform active:scale-[0.98]
                      disabled:opacity-40 disabled:cursor-not-allowed
                    "
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2 tracking-wide font-bold text-slate-900">
                        <svg className="animate-spin h-4.5 w-4.5 text-slate-900" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        CRUNCHING TEXT SIGNATURES...
                      </span>
                    ) : (
                      "RUN COMPLIANCE EXAMINER"
                    )}
                  </button>
                </form>

                {error && (
                  <div className="mt-3 flex items-start gap-2.5 p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-xs text-red-300">
                    <span className="text-sm leading-none">⚠</span>
                    <p className="font-medium">{error}</p>
                  </div>
                )}
              </div>

              {/* Dynamic Document Visual Preview / Overlay Highlights */}
              {result && (
                <div className="bg-slate-900/65 border border-slate-800/85 rounded-3xl p-5 shadow-lg shadow-black/30">
                  <h3 className="text-sm font-bold text-white tracking-wide mb-3">Live Document Map</h3>
                  <div className="relative border border-slate-800 rounded-2xl overflow-hidden bg-slate-950 flex justify-center items-center min-h-[300px]">
                    
                    {filePreview ? (
                      <img
                        src={filePreview}
                        alt="Document scan"
                        className="max-h-[360px] object-contain transition-all duration-200"
                      />
                    ) : (
                      <div className="p-4 text-center text-xs text-slate-500 font-mono">No live image preview available</div>
                    )}

                    {/* Interactive Neon Highlights Overlay over mock locations */}
                    <div className="absolute inset-0 pointer-events-none">
                      <div
                        className={`absolute top-[8%] left-[20%] w-[55%] h-[7%] border-2 transition-all duration-200 rounded ${
                          hoveredField === "name"
                            ? "border-cyan-400 bg-cyan-400/10 shadow-[0_0_10px_rgba(34,211,238,0.5)]"
                            : "border-transparent"
                        }`}
                      />
                      <div
                        className={`absolute top-[18%] left-[20%] w-[45%] h-[6%] border-2 transition-all duration-200 rounded ${
                          hoveredField === "dob"
                            ? "border-amber-400 bg-amber-400/10 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                            : "border-transparent"
                        }`}
                      />
                      <div
                        className={`absolute top-[25%] left-[20%] w-[60%] h-[15%] border-2 transition-all duration-200 rounded ${
                          hoveredField === "address"
                            ? "border-indigo-400 bg-indigo-400/10 shadow-[0_0_10px_rgba(129,140,248,0.5)]"
                            : "border-transparent"
                        }`}
                      />
                      <div
                        className={`absolute bottom-[10%] left-[25%] w-[50%] h-[8%] border-2 transition-all duration-200 rounded ${
                          hoveredField === "idNumber"
                            ? "border-emerald-400 bg-emerald-400/10 shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                            : "border-transparent"
                        }`}
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono mt-2 text-center">
                    💡 Hover over individual items in the extracted details list to map them to the document.
                  </p>
                </div>
              )}
            </div>

            {/* RIGHT AREA: RESULTS AND CONTROLS (lg:col-span-5) */}
            <div className="lg:col-span-12 xl:col-span-5 flex flex-col gap-6">
              
              {result ? (
                <>
                  {/* Case Dossier Report Card (Designed to look clean when printed) */}
                  <div className="bg-slate-900/65 border border-slate-800/85 rounded-3xl p-5 shadow-lg shadow-black/30 print-dossier">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
                      <div>
                        <span className="text-[9px] font-mono text-cyan-400 tracking-widest uppercase">AUDIT DOSSIER</span>
                        <h2 className="text-base font-black text-white">KYC CASE FILE</h2>
                      </div>
                      <button
                        onClick={() => window.print()}
                        className="no-print text-xs font-bold px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 hover:text-white transition-all flex items-center gap-1.5"
                      >
                        🖨 Print Case
                      </button>
                    </div>

                    {/* Metadata */}
                    <div className="grid grid-cols-2 gap-3 text-xs mb-4 p-3 bg-slate-950/60 rounded-2xl border border-slate-850">
                      <div>
                        <span className="text-slate-500">Record ID:</span>
                        <span className="block font-mono text-[11px] text-slate-300 truncate">{result._id}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Analyzed At:</span>
                        <span className="block text-[11px] text-slate-300 font-mono">
                          {new Date(result.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">OCR Confidence:</span>
                        <span className="block text-[11px] font-bold text-cyan-400">{ocrConf.toFixed(1)}%</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Doc Category:</span>
                        <span className="block text-[11px] font-bold text-white tracking-wider font-mono">
                          {result.extractedData?.docType || "GENERIC"}
                        </span>
                      </div>
                    </div>

                    {/* Extracted Fields */}
                    <div className="space-y-3.5 mb-5">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Extracted Field Inspector</h4>
                      
                      <div
                        onMouseEnter={() => setHoveredField("name")}
                        onMouseLeave={() => setHoveredField(null)}
                        className={`p-3 rounded-2xl transition-all border ${
                          hoveredField === "name"
                            ? "bg-cyan-500/5 border-cyan-400/40 shadow-inner"
                            : "bg-slate-950/40 border-slate-850 hover:border-slate-800"
                        }`}
                      >
                        <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono mb-0.5">
                          <span>APPLICANT NAME</span>
                          {hoveredField === "name" && <span className="text-cyan-400">Targeting top block</span>}
                        </div>
                        <p className="text-sm font-bold text-white">{result.extractedData?.name || "—"}</p>
                      </div>

                      <div
                        onMouseEnter={() => setHoveredField("dob")}
                        onMouseLeave={() => setHoveredField(null)}
                        className={`p-3 rounded-2xl transition-all border ${
                          hoveredField === "dob"
                            ? "bg-amber-500/5 border-amber-400/40 shadow-inner"
                            : "bg-slate-950/40 border-slate-850 hover:border-slate-800"
                        }`}
                      >
                        <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono mb-0.5">
                          <span>DATE OF BIRTH / AGE</span>
                          {hoveredField === "dob" && <span className="text-amber-400">Targeting middle block</span>}
                        </div>
                        <p className="text-sm font-bold text-white">{result.extractedData?.dob || "—"}</p>
                      </div>

                      <div
                        onMouseEnter={() => setHoveredField("idNumber")}
                        onMouseLeave={() => setHoveredField(null)}
                        className={`p-3 rounded-2xl transition-all border ${
                          hoveredField === "idNumber"
                            ? "bg-emerald-500/5 border-emerald-400/40 shadow-inner"
                            : "bg-slate-950/40 border-slate-850 hover:border-slate-800"
                        }`}
                      >
                        <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono mb-0.5">
                          <span>DOCUMENT SERIAL / EPIC ID</span>
                          {hoveredField === "idNumber" && <span className="text-emerald-400">Targeting bottom block</span>}
                        </div>
                        <p className="text-sm font-mono font-bold text-white">{result.extractedData?.idNumber || "—"}</p>
                      </div>

                      <div
                        onMouseEnter={() => setHoveredField("address")}
                        onMouseLeave={() => setHoveredField(null)}
                        className={`p-3 rounded-2xl transition-all border ${
                          hoveredField === "address"
                            ? "bg-indigo-500/5 border-indigo-400/40 shadow-inner"
                            : "bg-slate-950/40 border-slate-850 hover:border-slate-800"
                        }`}
                      >
                        <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono mb-0.5">
                          <span>ADDRESS PROOF</span>
                          {hoveredField === "address" && <span className="text-indigo-400">Targeting address block</span>}
                        </div>
                        <p className="text-xs leading-relaxed text-slate-200">{result.extractedData?.address || "—"}</p>
                      </div>
                    </div>

                    {/* Risk & Rules Check list */}
                    <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-850/80 mb-4">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Risk & Security Check</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${riskBadgeClass}`}>
                          {getRiskLabel(result.riskScore)}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 mb-4">
                        {/* Custom Risk Score Meter */}
                        <div className="w-16 h-16 rounded-full border-4 border-slate-800 flex flex-col justify-center items-center relative overflow-hidden">
                          <span className={`text-base font-black ${riskColorClass}`}>{result.riskScore}</span>
                          <span className="text-[7px] text-slate-500 uppercase tracking-tighter">risk score</span>
                        </div>

                        <div className="flex-1 space-y-1">
                          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                riskLevel === "high"
                                  ? "bg-red-500"
                                  : riskLevel === "medium"
                                  ? "bg-amber-400"
                                  : "bg-emerald-400"
                              }`}
                              style={{ width: `${result.riskScore}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400 leading-normal block">
                            {result.recommendedAction}
                          </span>
                        </div>
                      </div>

                      {/* Warnings / Checklist */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">Watchlist / PEP Screening:</span>
                          {result.amlFlags && result.amlFlags.length > 0 ? (
                            <span className="text-red-400 font-bold flex items-center gap-1">❌ Flagged Match</span>
                          ) : (
                            <span className="text-emerald-400 font-bold flex items-center gap-1">✔ Clear (No Match)</span>
                          )}
                        </div>

                        {result.amlFlags && result.amlFlags.length > 0 && (
                          <div className="p-2.5 rounded-xl border border-red-500/20 bg-red-500/5 text-[10px] font-mono text-red-300 space-y-1">
                            {result.amlFlags.map((flag, idx) => (
                              <p key={idx}>• {flag}</p>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[11px] border-t border-slate-900 pt-1.5">
                          <span className="text-slate-400">Structure / ID Extracted:</span>
                          {result.extractedData?.idNumber ? (
                            <span className="text-emerald-400 font-bold">✔ Verified</span>
                          ) : (
                            <span className="text-amber-400 font-bold">⚠ ID Unresolved</span>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-[11px] border-t border-slate-900 pt-1.5">
                          <span className="text-slate-400">Address Completeness:</span>
                          {result.extractedData?.address ? (
                            <span className="text-emerald-400 font-bold">✔ Verified</span>
                          ) : (
                            <span className="text-amber-400 font-bold">⚠ Incomplete</span>
                          )}
                        </div>

                        {result.riskFlags && result.riskFlags.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-slate-800">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                              Fired System Rules
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {result.riskFlags.map((flag, idx) => (
                                <span
                                  key={idx}
                                  className="text-[9.5px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-850 text-slate-400"
                                >
                                  {flag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Auditor Stage Trace */}
                    <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-850/80 mb-4 no-print">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Orchestration Stepper</h4>
                      <div className="space-y-3.5 relative pl-3">
                        <div className="absolute left-[3px] top-1.5 bottom-1.5 w-0.5 bg-slate-800" />
                        {result.stages.map((stage, idx) => (
                          <div key={idx} className="relative flex items-start gap-3">
                            <div className="absolute left-[-13.5px] top-1.5 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.8)] border border-slate-950" />
                            <div className="text-[11px] leading-tight">
                              <span className="block font-bold text-slate-200">{stage.name}</span>
                              <span className="text-slate-500 font-mono text-[9px]">
                                {new Date(stage.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* MANUAL COMPLIANCE OVERRULE BOARD */}
                    <div className="no-print p-4 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 mt-4">
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <span className="text-base">🛡</span>
                        <h4 className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider">Compliance Officer Desk</h4>
                      </div>

                      {result.reviewerDecision ? (
                        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-slate-400">Auditor Status:</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                result.reviewerDecision === "APPROVED"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                  : "bg-red-500/10 text-red-400 border border-red-500/30"
                              }`}
                            >
                              {result.reviewerDecision}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 mt-1 italic">
                            Notes: "{result.reviewerNotes || "No auditor notes left."}"
                          </p>
                          <span className="block text-[9px] text-slate-500 font-mono mt-2 text-right">
                            Reviewed on: {new Date(result.reviewedAt).toLocaleString()}
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">
                              Case Audit Remarks / Notes
                            </label>
                            <textarea
                              value={reviewerNotes}
                              onChange={(e) => setReviewerNotes(e.target.value)}
                              placeholder="Describe the reason for approving/rejecting (e.g. Card matches database verification matches)"
                              className="w-full text-xs bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-655 focus:outline-none focus:border-indigo-500 h-16 resize-none"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => handleReviewOverride("APPROVED")}
                              disabled={submittingReview}
                              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold text-xs py-2 px-3 rounded-lg transition-colors cursor-pointer"
                            >
                              Override Pass
                            </button>
                            <button
                              onClick={() => handleReviewOverride("REJECTED")}
                              disabled={submittingReview}
                              className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-slate-950 font-bold text-xs py-2 px-3 rounded-lg transition-colors cursor-pointer"
                            >
                              Override Fail
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-8 text-center shadow-soft-glow flex flex-col items-center justify-center min-h-[300px]">
                  <span className="text-4xl text-slate-600 mb-2">🔍</span>
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Awaiting Case Input</h3>
                  <p className="text-xs text-slate-500 max-w-xs mt-1.5 leading-normal">
                    Select a previous check from the audit trail or run a new document analysis to inspect detailed compliance logs.
                  </p>
                </div>
              )}
            </div>

            {/* AUDIT TRAIL LOGS (col-span-12) */}
            <div className="no-print lg:col-span-12 mt-4">
              <div className="bg-slate-900/65 border border-slate-800/85 rounded-3xl p-5 shadow-lg shadow-black/30">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-white tracking-wide">Historical Compliance Audit Trail</h3>
                    <p className="text-xs text-slate-400">Registry of previous validations, risk decisions, and auditor overrides</p>
                  </div>

                  {/* Filter / Search Bar */}
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      placeholder="Search name or ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-slate-950/80 border border-slate-850 text-xs px-3.5 py-1.5 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 min-w-[160px]"
                    />

                    <select
                      value={docTypeFilter}
                      onChange={(e) => setDocTypeFilter(e.target.value)}
                      className="bg-slate-950/80 border border-slate-850 text-xs px-2.5 py-1.5 rounded-lg text-slate-300 focus:outline-none"
                    >
                      <option value="ALL">All Docs</option>
                      <option value="AADHAAR">Aadhaar</option>
                      <option value="PAN">PAN</option>
                      <option value="VOTER_ID">Voter ID</option>
                      <option value="GENERIC">Generic</option>
                    </select>

                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="bg-slate-950/80 border border-slate-850 text-xs px-2.5 py-1.5 rounded-lg text-slate-300 focus:outline-none"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="AUTO_APPROVE">Auto-Approve</option>
                      <option value="REVIEW_REQUIRED">Needs Review</option>
                      <option value="REJECT">Auto-Rejected</option>
                      <option value="APPROVED">Manual Passed</option>
                      <option value="REJECTED">Manual Failed</option>
                    </select>
                  </div>
                </div>

                {filteredHistory.length === 0 ? (
                  <div className="py-8 text-center text-xs font-mono text-slate-500 border border-slate-850/60 rounded-2xl bg-slate-950/30">
                    No matching compliance checks found.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-850/60 rounded-2xl bg-slate-950/20">
                    <table className="w-full min-w-[700px] text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-950/80 text-[10px] tracking-wider text-slate-500 uppercase font-bold text-left">
                          <th className="px-4 py-3 border-b border-slate-900">Applicant Name</th>
                          <th className="px-4 py-3 border-b border-slate-900">Document Type</th>
                          <th className="px-4 py-3 border-b border-slate-900">ID Number</th>
                          <th className="px-4 py-3 border-b border-slate-900 text-center">Score</th>
                          <th className="px-4 py-3 border-b border-slate-900">Compliance Decision</th>
                          <th className="px-4 py-3 border-b border-slate-900">Timestamp</th>
                          <th className="px-4 py-3 border-b border-slate-900 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900/60 font-mono text-[11px]">
                        {filteredHistory.map((doc) => {
                          const isAmlFlagged = doc.amlFlags && doc.amlFlags.length > 0;
                          return (
                            <tr
                              key={doc._id}
                              onClick={() => {
                                setResult(doc);
                                window.scrollTo({ top: 400, behavior: "smooth" });
                              }}
                              className={`hover:bg-slate-900/50 transition-colors cursor-pointer ${
                                result?._id === doc._id ? "bg-slate-900/35 border-l-2 border-cyan-400" : ""
                              }`}
                            >
                              <td className="px-4 py-3 text-slate-200 font-bold font-sans">
                                <div className="flex items-center gap-2">
                                  {doc.extractedData?.name || "—"}
                                  {isAmlFlagged && (
                                    <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-tighter">
                                      AML Hit
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-400">{doc.extractedData?.docType || "GENERIC"}</td>
                              <td className="px-4 py-3 text-slate-300 font-mono">{doc.extractedData?.idNumber || "—"}</td>
                              <td className="px-4 py-3 text-center text-slate-300">{doc.riskScore}</td>
                              <td className={`px-4 py-3 font-semibold ${getRiskCellClass(doc.riskScore, doc.reviewerDecision, doc.decision)}`}>
                                {formatDecision(doc.decision, doc.reviewerDecision)}
                              </td>
                              <td className="px-4 py-3 text-slate-500">
                                {doc.createdAt ? new Date(doc.createdAt).toLocaleString() : "—"}
                              </td>
                              <td className="px-4 py-3 text-center no-print">
                                <span className="text-cyan-400 hover:underline text-[10px] font-bold">Inspect Case</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: AUDITING METRICS (ANALYTICS CHART & INSIGHTS) */}
        {activeTab === "analytics" && (
          <div className="no-print space-y-6">
            
            {/* Upper grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Compliance Breakdown */}
              <div className="bg-slate-900/65 border border-slate-800/85 rounded-3xl p-5 shadow-lg shadow-black/30">
                <h3 className="text-sm font-bold text-white mb-4">Verification Breakdown</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Automatic Approval Rate</span>
                      <span className="text-emerald-400 font-bold">{((autoApproved / (totalChecks || 1)) * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-400 h-full rounded-full" style={{ width: `${(autoApproved / (totalChecks || 1)) * 100}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Manual Approvals (Passed Auditor Review)</span>
                      <span className="text-indigo-400 font-bold">{((manualApproved / (totalChecks || 1)) * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-indigo-400 h-full rounded-full" style={{ width: `${(manualApproved / (totalChecks || 1)) * 100}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Unresolved / Pending Review</span>
                      <span className="text-amber-400 font-bold">{((pendingReviews / (totalChecks || 1)) * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-amber-400 h-full rounded-full" style={{ width: `${(pendingReviews / (totalChecks || 1)) * 100}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Rejected Accounts</span>
                      <span className="text-red-400 font-bold">
                        {(((history.filter(h => h.decision === "REJECT" || h.reviewerDecision === "REJECTED").length) / (totalChecks || 1)) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-red-500 h-full rounded-full"
                        style={{
                          width: `${
                            (history.filter(h => h.decision === "REJECT" || h.reviewerDecision === "REJECTED").length / (totalChecks || 1)) * 100
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Document Usage Analysis */}
              <div className="bg-slate-900/65 border border-slate-800/85 rounded-3xl p-5 shadow-lg shadow-black/30">
                <h3 className="text-sm font-bold text-white mb-4">Credential Types Used</h3>
                <div className="space-y-4">
                  {["AADHAAR", "PAN", "VOTER_ID", "GENERIC"].map((type) => {
                    const count = history.filter(h => (h.extractedData?.docType || "GENERIC") === type).length;
                    const percent = totalChecks ? Math.round((count / totalChecks) * 100) : 0;
                    return (
                      <div key={type} className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                          <span className="text-xs text-slate-300 font-mono font-bold tracking-wide">{type}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-500">{count} cases</span>
                          <span className="text-xs text-cyan-400 font-extrabold w-8 text-right">{percent}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* System Security Audit log summary */}
              <div className="bg-slate-900/65 border border-slate-800/85 rounded-3xl p-5 shadow-lg shadow-black/30">
                <h3 className="text-sm font-bold text-white mb-4">Compliance Audit Summary</h3>
                <div className="text-xs space-y-3.5 text-slate-300 leading-relaxed">
                  <p>
                    All KYC checks are verified locally through a private **Tesseract OCR pipeline** utilizing sandbox execution. 
                    No candidate biometric or raw image data is sent to external, public neural endpoints.
                  </p>
                  <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-850 font-mono text-[10px] space-y-1 text-slate-400">
                    <p>• Database Sync Status: ACTIVE</p>
                    <p>• Cloudinary File Vault: CONNECTED</p>
                    <p>• Sanctions Registry Version: MAY-2026-F1</p>
                  </div>
                </div>
              </div>
            </div>

            {/* List of recent manual override audits */}
            <div className="bg-slate-900/65 border border-slate-800/85 rounded-3xl p-5 shadow-lg shadow-black/30">
              <h3 className="text-sm font-bold text-white mb-3">Auditor Action Logs</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-xs text-left">
                  <thead>
                    <tr className="bg-slate-950/60 text-[10.5px] uppercase tracking-wider text-slate-500 font-bold">
                      <th className="px-4 py-2.5 rounded-l-lg">Applicant ID</th>
                      <th className="px-4 py-2.5">Name</th>
                      <th className="px-4 py-2.5">Auditor Decision</th>
                      <th className="px-4 py-2.5">Auditor Notes</th>
                      <th className="px-4 py-2.5 rounded-r-lg">Audit Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900 font-mono text-[11px]">
                    {history
                      .filter(h => h.reviewerDecision)
                      .map((h) => (
                        <tr key={h._id} className="hover:bg-slate-900/30">
                          <td className="px-4 py-3 text-slate-400 truncate max-w-[120px]">{h._id}</td>
                          <td className="px-4 py-3 text-slate-200 font-bold font-sans">{h.extractedData?.name || "—"}</td>
                          <td
                            className={`px-4 py-3 font-semibold ${
                              h.reviewerDecision === "APPROVED" ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            {h.reviewerDecision}
                          </td>
                          <td className="px-4 py-3 text-slate-300 font-sans italic max-w-[280px] truncate">
                            "{h.reviewerNotes || "—"}"
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {h.reviewedAt ? new Date(h.reviewedAt).toLocaleString() : "—"}
                          </td>
                        </tr>
                      ))}
                    {history.filter(h => h.reviewerDecision).length === 0 && (
                      <tr>
                        <td colSpan="5" className="text-center py-6 text-slate-500">
                          No manual review overrides logged yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: AML WATCHLIST REFERENCE */}
        {activeTab === "watchlist" && (
          <div className="no-print bg-slate-900/65 border border-slate-800/85 rounded-3xl p-6 shadow-lg shadow-black/30 space-y-6">
            <div>
              <h3 className="text-base font-extrabold text-white">Global Sanctions Watchlist Center</h3>
              <p className="text-xs text-slate-400 mt-1">
                The KYC risk engine performs substring matching against this database to identify Politically Exposed Persons (PEPs) and flagged accounts.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              
              {/* Watchlist Names List */}
              <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/40">
                <div className="bg-slate-950 px-4 py-3 border-b border-slate-900 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Global Watchlist Registry Entries (Mock)
                </div>
                <div className="divide-y divide-slate-900/80">
                  {officialWatchlist.map((pep, idx) => (
                    <div key={idx} className="p-4 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-extrabold text-white text-sm">{pep.name}</p>
                        <p className="text-slate-500 text-[10px] font-mono mt-0.5">{pep.country}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-mono font-bold tracking-tight">
                        {pep.type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Informational Guidance */}
              <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-850 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🛡</span>
                  <h4 className="text-xs font-black uppercase text-cyan-400 tracking-wider">Compliance Officer Guidance</h4>
                </div>
                <div className="text-xs text-slate-300 space-y-3 leading-relaxed">
                  <p>
                    <strong>AML Matching Policy:</strong> The matching is case-insensitive and triggers if the applicant's extracted name contains or is contained within any watchlist entry.
                  </p>
                  <p>
                    <strong>Escalation Workflow:</strong> A watchlist hit triggers an immediate **80-point risk penalty**, moving the candidate status automatically to **Auto-Rejected** or **Needs Compliance Review**.
                  </p>
                  <p>
                    <strong>Manual Action Required:</strong> To bypass a false match (e.g. name similarity), a compliance officer must use the **Override Pass** tool inside the Document Examiner with clear notes detailing the manual verification.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="no-print mt-12 border-t border-slate-900 bg-slate-950 text-slate-600 text-center py-6 text-[10px] tracking-wide font-mono">
        <p>© 2026 SECURE KYC SYSTEMS • DELIVERED TO GOVERNMENT COMPLIANCE DEPARTMENTS • ALL RIGHTS RESERVED</p>
      </footer>

      {/* PRINT-ONLY DOSSIER LAYOUT (Hidden on screen, styled beautifully for paper/PDF generation) */}
      <div className="hidden print-only bg-white text-black p-8 font-sans max-w-4xl mx-auto">
        <div className="border-b-4 border-black pb-4 mb-6">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-2xl font-black tracking-tight">KYC COMPLIANCE REPORT</h1>
              <p className="text-sm font-mono uppercase text-gray-600">CONFIDENTIAL • AUDIT CASE RECORD</p>
            </div>
            <div className="text-right text-xs font-mono text-gray-700">
              <p>REPORT GENERATED: {new Date().toLocaleString()}</p>
              <p>CASE ID: {result?._id}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div>
            <h3 className="font-bold border-b border-gray-400 pb-1 mb-2">APPLICANT DETAILS</h3>
            <div className="space-y-1 font-mono text-xs">
              <p><strong>NAME:</strong> {result?.extractedData?.name || "—"}</p>
              <p><strong>DOB:</strong> {result?.extractedData?.dob || "—"}</p>
              <p><strong>DOCUMENT TYPE:</strong> {result?.extractedData?.docType || "GENERIC"}</p>
              <p><strong>ID NUMBER:</strong> {result?.extractedData?.idNumber || "—"}</p>
              <p><strong>ADDRESS:</strong> {result?.extractedData?.address || "—"}</p>
            </div>
          </div>
          <div>
            <h3 className="font-bold border-b border-gray-400 pb-1 mb-2">VERIFICATION SUMMARY</h3>
            <div className="space-y-1 font-mono text-xs">
              <p><strong>SYSTEM RISK SCORE:</strong> {result?.riskScore}/100</p>
              <p><strong>OCR CONFIDENCE:</strong> {result?.extractedData?.confidence?.toFixed(1)}%</p>
              <p><strong>SYSTEM DECISION:</strong> {result?.decision}</p>
              <p><strong>FINAL DECISION:</strong> {formatDecision(result?.decision, result?.reviewerDecision)}</p>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="font-bold border-b border-gray-400 pb-1 mb-2 text-sm">WATCHLIST & RISK FLAGS</h3>
          <div className="space-y-1.5 font-mono text-xs">
            <p><strong>AML Watchlist Screening:</strong> {result?.amlFlags && result?.amlFlags.length > 0 ? "⚠️ MATCH DETECTED" : "✅ CLEAR"}</p>
            {result?.amlFlags && result?.amlFlags.map((flag, idx) => (
              <p key={idx} className="text-red-700 ml-4">• {flag}</p>
            ))}
            <p><strong>System Risk Flags:</strong></p>
            {result?.riskFlags && result?.riskFlags.map((flag, idx) => (
              <p key={idx} className="ml-4">• {flag}</p>
            ))}
          </div>
        </div>

        {result?.reviewerDecision && (
          <div className="border border-black p-4 bg-gray-50 rounded-lg">
            <h3 className="font-black text-sm mb-1.5">🛡️ COMPLIANCE OFFICER OVERRULE LOG</h3>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <p><strong>Reviewer Action:</strong> {result.reviewerDecision}</p>
              <p><strong>Reviewed At:</strong> {new Date(result.reviewedAt).toLocaleString()}</p>
              <p className="col-span-2"><strong>Notes:</strong> {result.reviewerNotes || "—"}</p>
            </div>
          </div>
        )}

        <div className="mt-12 pt-6 border-t border-gray-400 flex justify-between items-center text-[10px] font-mono text-gray-500">
          <p>AUTHORIZED FOR USE BY GOVERNMENT COMPLIANCE DEPARTMENTS ONLY</p>
          <p>REPORT PAGE 1 / 1</p>
        </div>
      </div>
    </div>
  );
}

export default App;
