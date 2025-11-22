// backend/services/ocrService.js
import Tesseract from "tesseract.js";

const { createWorker } = Tesseract;

function parseFieldsFromText(text = "") {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const name = lines[0] || "";

  const dobPatterns = [
    /(\d{2}[\/\-]\d{2}[\/\-]\d{4})/,
    /(\d{4}[\/\-]\d{2}[\/\-]\d{2})/,
  ];
  let dob = "";
  for (const re of dobPatterns) {
    const m = text.match(re);
    if (m && m[1]) {
      dob = m[1];
      break;
    }
  }

  let idNumber = "";
  const idMatch = text.match(/\b[A-Z0-9]{6,15}\b/);
  if (idMatch) {
    idNumber = idMatch[0];
  }

  let address = "";
  if (lines.length > 2) {
    address = lines.slice(1, 5).join(", ");
  }

  return { name, dob, address, idNumber };
}

async function runOCR(documentUrl) {
  let worker;
  try {
    worker = await createWorker("eng", 1, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          console.log("🔍 OCR progress:", Math.round(m.progress * 100), "%");
        }
      },
    });

    console.log("🔍 Running OCR on:", documentUrl);
    const { data } = await worker.recognize(documentUrl);
    const { text, confidence } = data;

    const parsed = parseFieldsFromText(text || "");

    return {
      ...parsed,
      rawText: text || "",
      confidence: confidence || 0,
    };
  } catch (err) {
    console.error("❌ OCR error:", err);
    // Safe fallback
    return {
      name: "",
      dob: "",
      address: "",
      idNumber: "",
      rawText: "",
      confidence: 0,
    };
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}

export default runOCR;
