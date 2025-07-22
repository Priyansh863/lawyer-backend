import { Router } from "express";
import DashboardController from "../controllers/DashboardController";
import Auth from "../middlewares/auth";

const router = Router();

// GET dashboard summary
router.get("/dashboard-summary", Auth,DashboardController.getSummary);

export default router;
