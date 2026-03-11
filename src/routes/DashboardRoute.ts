import { Router } from "express";
import DashboardController from "../controllers/DashboardController";
import Auth from "../middlewares/auth";

const router = Router();

// GET dashboard summary
router.get("/dashboard-summary", Auth, DashboardController.getSummary);

// GET unified dashboard stats
router.get("/stats", Auth, DashboardController.getStats);

export default router;
