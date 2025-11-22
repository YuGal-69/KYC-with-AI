// backend/routes/kycRoutes.js
import express from "express";
import upload from "../middleware/upload.js";
import { uploadDocument, getHistory } from "../controllers/kycController.js";

const router = express.Router();

router.post("/upload", upload.single("document"), uploadDocument);
router.get("/history", getHistory);

export default router;
