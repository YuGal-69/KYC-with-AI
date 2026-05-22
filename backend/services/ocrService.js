// backend/services/ocrService.js
import Tesseract from "tesseract.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { Jimp, ResizeStrategy, JimpMime } from "jimp";

const { createWorker } = Tesseract;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// eng.traineddata is located in the backend folder (one level above services)
const backendDir = path.resolve(__dirname, "..");

// ---------- DOC TYPE DETECTION ----------
function detectDocType(text = "") {
  const lower = text.toLowerCase();

  // Try to find structural patterns first
  // 1) PAN checks (most specific)
  if (
    lower.includes("permanent account") ||
    lower.includes("income tax") ||
    lower.includes("आयकर") ||
    /\b[A-Z]{5}[0-9]{4}[A-Z]\b/i.test(text)
  ) {
    return "PAN";
  }

  // 2) Aadhaar checks
  const hasAadhaarKeywords = 
    lower.includes("aadhaar") || 
    lower.includes("aadhar") || 
    lower.includes("unique identification") ||
    lower.includes("authority of india") ||
    lower.includes("government of india") || 
    lower.includes("govemment of india") ||
    lower.includes("unique identification authority of india") ||
    lower.includes("भारत सरकार");
    
  const hasAadhaarNumber = /\b\d{4}\s\d{4}\s\d{4}\b/.test(text) || /\b\d{12}\b/.test(text);

  if (hasAadhaarKeywords || (hasAadhaarNumber && (lower.includes("male") || lower.includes("female") || lower.includes("dob") || lower.includes("birth")))) {
    return "AADHAAR";
  }

  // 3) Voter ID checks
  if (
    lower.includes("election commission") ||
    lower.includes("elector photo") ||
    lower.includes("epic")
  ) {
    return "VOTER_ID";
  }

  return "GENERIC";
}

// Helper to clean OCR text and remove surrounding punctuation/noise from names/fields
function cleanField(val = "") {
  return val
    .replace(/^[:;.,\-/|\\\s_]+/, "") // remove leading punctuation
    .replace(/[:;.,\-/|\\\s_]+$/, "") // remove trailing punctuation
    .replace(/\s+/g, " ")            // normalize spaces
    .replace(/,(\s*,)+/g, ",")       // merge multiple commas
    .trim();
}

// Helper to clean extracted names and strip common OCR artifacts (like single misread characters or lowercase noise)
function cleanName(name = "") {
  let cleaned = name
    .replace(/[^A-Za-z\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Split into words, keep only words that contain uppercase letters, and drop lowercase noise (like 'gr', 'or')
  const parts = cleaned.split(" ");
  const filteredParts = parts.filter(part => {
    if (/^[a-z]+$/.test(part)) return false;
    return true;
  });

  cleaned = filteredParts.join(" ");

  const finalParts = cleaned.split(" ");
  if (finalParts.length >= 3 && finalParts[0].length === 1 && /^[A-Z]$/.test(finalParts[0])) {
    cleaned = finalParts.slice(1).join(" ");
  }

  return cleaned.trim();
}

// Helper to parse messy date strings like 221122003 or 22122003
function parseMessyDateString(s) {
  if (!/^\d{8,10}$/.test(s)) return null;
  
  const year = s.slice(-4);
  const yearNum = parseInt(year, 10);
  if (yearNum < 1900 || yearNum > 2030) return null;
  
  const prefix = s.slice(0, -4);
  
  const isValidDate = (d, m) => {
    const day = parseInt(d, 10);
    const month = parseInt(m, 10);
    return day >= 1 && day <= 31 && month >= 1 && month <= 12;
  };
  
  const separatorChars = ["1", "I", "l", "/", "\\", "-", " "];
  const isSeparator = (char) => separatorChars.includes(char);

  if (prefix.length === 4) {
    const d = prefix.slice(0, 2);
    const m = prefix.slice(2, 4);
    if (isValidDate(d, m)) {
      return `${d}/${m}/${year}`;
    }
  }
  
  if (prefix.length === 5) {
    const d_A = prefix.slice(0, 2);
    const sep_A = prefix[2];
    const m_A = prefix.slice(3, 5);
    
    const d_B = prefix.slice(0, 2);
    const m_B = prefix.slice(2, 4);
    const sep_B = prefix[4];
    
    const validA = isValidDate(d_A, m_A) && isSeparator(sep_A);
    const validB = isValidDate(d_B, m_B) && isSeparator(sep_B);
    
    if (validA && !validB) return `${d_A}/${m_A}/${year}`;
    if (validB && !validA) return `${d_B}/${m_B}/${year}`;
    if (validA && validB) return `${d_A}/${m_A}/${year}`;
  }
  
  if (s.length === 10) {
    const d = s.slice(0, 2);
    const sep1 = s[2];
    const m = s.slice(3, 5);
    const sep2 = s[5];
    if (isValidDate(d, m) && isSeparator(sep1) && isSeparator(sep2)) {
      return `${d}/${m}/${year}`;
    }
  }
  
  return null;
}

// Helper to extract DOB robustly (handles slashes/dashes read as "1", "I", "l", "\", or spaces)
function extractDOB(text = "", lines = []) {
  // 1) Standard date match with slashes or dashes
  const dobMatch = text.match(/\b(\d{2})[/\-](\d{2})[/\-](\d{4})\b/);
  if (dobMatch) {
    return `${dobMatch[1]}/${dobMatch[2]}/${dobMatch[3]}`;
  }

  // 2) Messy match: slashes/dashes read as "1", "I", "l", "\", or spaces
  const messyMatch = text.match(/\b(\d{2})[\s1/\\I|l\-]+(\d{2})[\s1/\\I|l\-]+((?:19|20)\d{2})\b/);
  if (messyMatch) {
    return `${messyMatch[1]}/${messyMatch[2]}/${messyMatch[3]}`;
  }

  // 3) Digits-only or single-separator match (e.g. 221122003 or 22122003)
  const digitsMatch = text.match(/\b\d{8,10}\b/);
  if (digitsMatch) {
    const parsed = parseMessyDateString(digitsMatch[0]);
    if (parsed) return parsed;
  }

  // 4) Line-based search fallback
  const dobLine = lines.find((line) => /Date of Birth|DOB|Birth|जन्मतारीख|जन्म/i.test(line));
  if (dobLine) {
    const m = dobLine.match(/(\d{2})[\s1/\\I|l\-]+(\d{2})[\s1/\\I|l\-]+((?:19|20)\d{2})/);
    if (m) {
      return `${m[1]}/${m[2]}/${m[3]}`;
    }
    const lineDigits = dobLine.match(/\d{8,10}/);
    if (lineDigits) {
      const parsed = parseMessyDateString(lineDigits[0]);
      if (parsed) return parsed;
    }
  }

  return "";
}

// Helper to crop bottom-left text area of a PAN card
async function cropPanTextArea(buffer) {
  try {
    const image = await Jimp.read(buffer);
    const w = image.bitmap.width;
    const h = image.bitmap.height;
    
    // Crop bottom-left text area (excluding photo on top-left and QR code on the right)
    // Shifted slightly right to avoid photo border/left card edge, and down to avoid photo bottom
    const x = Math.round(w * 0.03);
    const y = Math.round(h * 0.51);
    const cropW = Math.round(w * 0.67);
    const cropH = h - y;

    const cropped = image.crop({
      x,
      y,
      w: x + cropW > w ? w - x : cropW,
      h: y + cropH > h ? h - y : cropH
    });
    
    // Upscale by 2.5x to improve OCR resolution
    cropped.resize({
      w: Math.round(cropped.bitmap.width * 2.5),
      h: Math.round(cropped.bitmap.height * 2.5),
      mode: ResizeStrategy.BICUBIC
    });
    cropped.greyscale();
    cropped.contrast(0.4);
    
    return await cropped.getBuffer(JimpMime.jpeg);
  } catch (err) {
    console.error("❌ Error cropping PAN text area:", err);
    return null;
  }
}

// ---------- PAN CARD ----------
function extractPanFields(text = "", lines = []) {
  let name = "";
  let dob = "";
  let idNumber = "";
  let address = "";

  // 1) ID Number matching (PAN matches ABCDE1234F pattern)
  const panMatch = text.match(/\b([A-Z]{5}[0-9]{4}[A-Z])\b/i);
  if (panMatch) {
    idNumber = panMatch[1].toUpperCase();
  }

  // 2) Name extraction: Look for "Name" or "नाम" line
  // PAN card usually has:
  // "Name / नाम"
  // "YUGAL HEMANE" (in all caps)
  const nameIndices = [];
  lines.forEach((line, idx) => {
    const hasNameLabel = /(नाम\s*\/\s*Name|Name\s*\/\s*नाम|Name\s*:|नाम\s*\/|\bName\b|\bनाम\b)/i.test(line);
    const isRelation = /Father|Husband|Mother|Relation|Parent|पिता|पति|माता|संरक्षक/i.test(line);
    const isHeader = /Permanent|Account|Number|Card|Income|Tax|Department|Govt|India/i.test(line);
    if (hasNameLabel && !isRelation && !isHeader) {
      nameIndices.push(idx);
    }
  });

  let nameLabelIndex = -1;
  for (const idx of nameIndices) {
    if (idx + 1 < lines.length && /[A-Za-z]/.test(lines[idx + 1])) {
      nameLabelIndex = idx;
      break;
    }
  }
  if (nameLabelIndex === -1 && nameIndices.length > 0) {
    nameLabelIndex = nameIndices[0];
  }

  if (nameLabelIndex !== -1 && nameLabelIndex + 1 < lines.length) {
    name = cleanName(lines[nameLabelIndex + 1]);
  } else {
    // Fallback: look for uppercase lines that resemble a name
    // Typically the name is on line 2 or 3 of the card
    for (let i = 0; i < Math.min(lines.length, 6); i++) {
      const line = lines[i].trim();
      // Skip headers
      if (/INCOME TAX|GOVT|INDIA|DEPARTMENT|CARD|PERMANENT/i.test(line)) continue;
      // Name is uppercase words
      if (/^[A-Z\s]{3,30}$/.test(line)) {
        name = cleanName(line);
        break;
      }
    }
  }

  // 3) DOB: match date pattern robustly
  dob = extractDOB(text, lines);

  address = ""; // PAN physical card does not have full address on front

  return { name, dob, address, idNumber };
}

// ---------- VOTER ID CARD ----------
function extractVoterFields(text = "", lines = []) {
  let name = "";
  let dob = "";
  let idNumber = "";
  let address = "";

  // 1) EPIC Number (typical Voter ID: 3 letters followed by 7 digits, or general alphanum)
  const epicMatch = text.match(/\b([A-Z]{3}[0-9]{7})\b/i) || text.match(/\b([A-Z0-9]{8,15})\b/i);
  if (epicMatch) {
    idNumber = epicMatch[1].toUpperCase();
  }

  // 2) Name
  const nameLines = lines.filter((line) => {
    const hasNameLabel = /Name\s*:/i.test(line) || /नाम\s*:/i.test(line);
    const isRelation = /Father|Husband|Mother|Relation|Parent|पिता|पति|माता|संरक्षक/i.test(line);
    return hasNameLabel && !isRelation;
  });

  // Prefer the line that contains English letters (for bilingual cards)
  const nameLine = nameLines.find((line) => /[A-Za-z]/.test(line)) || nameLines[0];

  if (nameLine) {
    const parts = nameLine.split(/Name\s*:|नाम\s*:/i);
    if (parts[1]) name = cleanName(parts[1]);
  } else {
    // fallback: line index check (must not be a relation line)
    const nameIndices = [];
    lines.forEach((line, idx) => {
      const hasName = /Name|नाम/i.test(line);
      const isRelation = /Father|Husband|Mother|Relation|Parent|पिता|पति|माता|संरक्षक/i.test(line);
      if (hasName && !isRelation) {
        nameIndices.push(idx);
      }
    });

    let bestIndex = -1;
    for (const idx of nameIndices) {
      if (idx + 1 < lines.length) {
        const nextLine = lines[idx + 1];
        if (/[A-Za-z]/.test(nextLine)) {
          bestIndex = idx;
          break;
        }
      }
    }
    if (bestIndex === -1 && nameIndices.length > 0) {
      bestIndex = nameIndices[0];
    }

    if (bestIndex !== -1 && bestIndex + 1 < lines.length) {
      name = cleanName(lines[bestIndex + 1]);
    }
  }

  // 3) DOB
  dob = extractDOB(text, lines);

  // 4) Address
  const addrMatch = text.match(/(?:Address|पता)\s*:(.+)/i);
  if (addrMatch) {
    address = cleanField(addrMatch[1]);
  }

  return { name, dob, address, idNumber };
}

// ---------- AADHAAR CARD ----------
function extractAadhaarFields(text = "", lines = []) {
  let name = "";
  let dob = "";
  let idNumber = "";
  let address = "";

  // 1) Aadhaar number: 12 digits grouped 4-4-4
  const aadhaarMatch = text.match(/\b(\d{4}\s?\d{4}\s?\d{4})\b/) || text.match(/\b(\d{12})\b/);
  if (aadhaarMatch) {
    idNumber = aadhaarMatch[1].replace(/\s+/g, "");
  }

  // 2) DOB
  dob = extractDOB(text, lines);
  if (!dob) {
    const dobMatch = text.match(/Year of Birth\s*:\s*(\d{4})/i);
    if (dobMatch) {
      dob = dobMatch[1];
    } else {
      const dobLine = lines.find((line) => /Year of Birth/i.test(line));
      if (dobLine) {
        const m = dobLine.match(/(\d{4})/);
        if (m) dob = m[1];
      }
    }
  }

  // 3) Name
  // Typically, Aadhaar has the name above the DOB/Gender line, or right after Government of India.
  const dobIndex = lines.findIndex((line) => /(DOB|Date of Birth|जन्म तिथि|जन्म तारीख|Year of Birth)/i.test(line));
  const nameLine = lines.find((line) => /Name\s*:/i.test(line));
  
  if (nameLine) {
    const parts = nameLine.split(/Name\s*:/i);
    name = cleanName(parts[1]);
  } else if (dobIndex !== -1 && dobIndex - 1 >= 0) {
    // Check line right above DOB
    let candidate = lines[dobIndex - 1];
    // If it contains Gender (e.g. MALE / FEMALE), go up one more line
    if (/MALE|FEMALE|पुरुष|महिला/i.test(candidate) && dobIndex - 2 >= 0) {
      candidate = lines[dobIndex - 2];
    }
    name = cleanName(candidate);
  }

  // 4) Address
  // Aadhaar format: "Address: <address text> <pincode>"
  const addrIndex = lines.findIndex((line) => /(Address|पता)\s*:/i.test(line));
  if (addrIndex !== -1) {
    const addrLines = [];
    const firstLine = lines[addrIndex].replace(/^(Address|पता)\s*:\s*/i, "");
    addrLines.push(firstLine);
    
    // Collect subsequent lines until we see another main label or the 6-digit pincode ends
    for (let i = addrIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/Government of India|UNIQUE IDENTIFICATION|Aadhaar|Aadhar|\d{4}\s\d{4}\s\d{4}/i.test(line)) {
        break;
      }
      addrLines.push(line);
      if (/\b\d{6}\b/.test(line)) {
        break; // Stop at pincode line
      }
    }
    address = cleanField(addrLines.join(", "));
  } else {
    // Fallback 1: look for "C/O", "S/O", etc.
    const coIndex = lines.findIndex((line) => /\b(C\/O|S\/O|D\/O|W\/O|Care\s+of|Son\s+of|Daughter\s+of|Wife\s+of)\b/i.test(line));
    if (coIndex !== -1) {
      const addrLines = [];
      for (let i = coIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/Government of India|UNIQUE IDENTIFICATION|Aadhaar|Aadhar|\b\d{4}\s\d{4}\s\d{4}\b/i.test(line)) {
          break;
        }
        addrLines.push(line);
        if (/\b\d{6}\b/.test(line)) {
          break;
        }
      }
      address = cleanField(addrLines.join(", "));
    } else {
      // Fallback 2: find a 6-digit pincode and gather lines above it (up to 5 lines)
      const pincodeIndex = lines.findIndex((line) => /\b\d{6}\b/.test(line));
      if (pincodeIndex !== -1) {
        const addrLines = [];
        let startIdx = Math.max(0, pincodeIndex - 5);
        for (let i = pincodeIndex; i >= startIdx; i--) {
          const line = lines[i].trim();
          if (/To|Name|DOB|Birth|Gender|Male|Female|Government|UNIQUE|Aadhaar|Aadhar/i.test(line)) {
            break;
          }
          addrLines.unshift(line);
        }
        if (addrLines.length > 0) {
          address = cleanField(addrLines.join(", "));
        }
      }
    }
  }

  return { name, dob, address, idNumber };
}

// ---------- GENERIC FALLBACK ----------
function extractGenericFields(text = "", lines = []) {
  let name = "";
  let dob = "";
  let idNumber = "";
  let address = "";

  // 1) Find name: first line with high letters ratio
  const nameCandidate = lines.find((line) => {
    const words = line.split(/\s+/);
    const letterRatio =
      (line.match(/[A-Za-z]/g) || []).length / Math.max(line.length, 1);
    // Ignore header noise lines
    if (/file|http|localhost|select|lens|screen|pdf/i.test(line)) return false;
    return words.length >= 2 && letterRatio > 0.6;
  });
  name = cleanName(nameCandidate || lines[0] || "");

  // 2) DOB
  const dobMatch =
    text.match(/\b(\d{2}[/\-]\d{2}[/\-]\d{4})\b/) ||
    text.match(/\b(\d{4}[/\-]\d{2}[/\-]\d{2})\b/);
  dob = dobMatch ? dobMatch[1] : "";

  // 3) ID Number: Match PAN or fallback to first 6-15 alphanum string (avoiding file paths)
  const panMatch = text.match(/\b([A-Z]{5}[0-9]{4}[A-Z])\b/i);
  if (panMatch) {
    idNumber = panMatch[1].toUpperCase();
  } else {
    // Look for ID candidates that are not URL/path parts
    const idCandidates = text.match(/\b[A-Z0-9]{6,15}\b/g) || [];
    const validCandidate = idCandidates.find(cand => {
      // should not match common path terms or words
      return !/localhost|select|lense|scratch|resistant/i.test(cand);
    });
    idNumber = validCandidate || "";
  }

  // 4) Address fallback
  if (lines.length > 3) {
    // Only capture lines that look like a street address / city / state
    const filteredLines = lines.filter(line => !/file|http|localhost|select/i.test(line));
    if (filteredLines.length > 2) {
      address = cleanField(filteredLines.slice(1, 4).join(", "));
    }
  }

  return { name, dob, address, idNumber };
}

function isValidImageBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return true;
  }
  
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return true;
  }
  
  // WebP/RIFF: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    if (buffer.length >= 12) {
      const type = buffer.toString("utf-8", 8, 12);
      if (type === "WEBP") return true;
    }
  }
  
  return false;
}

// ---------- MAIN OCR FUNCTION ----------
async function runOCR(imageInput) {
  if (Buffer.isBuffer(imageInput) && !isValidImageBuffer(imageInput)) {
    console.error("❌ OCR error: Invalid image signature. File is not a valid JPEG, PNG, or WebP.");
    return {
      name: "",
      dob: "",
      address: "",
      idNumber: "",
      rawText: "",
      confidence: 0,
      docType: "INVALID_FORMAT",
    };
  }

  let worker;
  try {
    const hasHinModel = fs.existsSync(path.join(backendDir, "hin.traineddata"));
    const lang = hasHinModel ? "eng+hin" : "eng";

    worker = await createWorker(lang, 1, {
      langPath: backendDir,
      cachePath: backendDir,
      logger: (m) => {
        if (m.status === "recognizing text") {
          console.log("🔍 OCR progress:", Math.round(m.progress * 100), "%");
        }
      },
    });

    console.log(`🔍 Running OCR on input source (using model: ${lang})...`);

    // Better settings for single block structure
    await worker.setParameters({
      tessedit_pageseg_mode: 6,
      user_defined_dpi: "300",
    });

    const { data } = await worker.recognize(imageInput);
    const fullText = data.text || "";
    const confidence = data.confidence || 0;

    const lines = fullText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const docType = detectDocType(fullText);
    let parsed;

    if (docType === "PAN") {
      parsed = extractPanFields(fullText, lines);

      // Targeted crop fallback if Name or DOB is missing
      if (!parsed.name || !parsed.dob) {
        console.log("🔍 PAN fields missing from main OCR. Running targeted bottom-left crop OCR...");
        const cropBuffer = await cropPanTextArea(imageInput);
        if (cropBuffer) {
          try {
            const { data: cropData } = await worker.recognize(cropBuffer);
            const cropText = cropData.text || "";
            const cropLines = cropText
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean);

            const cropParsed = extractPanFields(cropText, cropLines);

            if (cropParsed.name && !parsed.name) {
              console.log("🔍 Recovered Name from crop OCR:", cropParsed.name);
              parsed.name = cropParsed.name;
            }
            if (cropParsed.dob && !parsed.dob) {
              console.log("🔍 Recovered DOB from crop OCR:", cropParsed.dob);
              parsed.dob = cropParsed.dob;
            }
          } catch (cropErr) {
            console.error("❌ Crop OCR failed:", cropErr);
          }
        }
      }
    } else if (docType === "VOTER_ID") {
      parsed = extractVoterFields(fullText, lines);
    } else if (docType === "AADHAAR") {
      parsed = extractAadhaarFields(fullText, lines);
    } else {
      parsed = extractGenericFields(fullText, lines);
    }

    return {
      ...parsed,
      rawText: fullText,
      confidence,
      docType,
    };
  } catch (err) {
    console.error("❌ OCR error:", err);
    return {
      name: "",
      dob: "",
      address: "",
      idNumber: "",
      rawText: "",
      confidence: 0,
      docType: "ERROR",
    };
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}

export default runOCR;
