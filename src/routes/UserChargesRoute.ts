import express from "express";
import UserChargesController from "../controllers/UserChargesController";
import { authenticateToken } from "../middleware/auth";

const userChargesRoute = express.Router();

// Update lawyer consultation charges
userChargesRoute.put("/update-charges", authenticateToken, UserChargesController.updateCharges);

// Get lawyer charges by user ID
userChargesRoute.get("/charges/:userId", authenticateToken, UserChargesController.getCharges);

// Get all lawyers with their charges
userChargesRoute.get("/lawyers-with-charges", authenticateToken, UserChargesController.getAllLawyersWithCharges);

export default userChargesRoute;
