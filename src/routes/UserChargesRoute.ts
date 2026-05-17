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

// Check if client has sufficient tokens for consultation
userChargesRoute.post("/check-token-balance", authenticateToken, UserChargesController.checkTokenBalance);

// Deduct tokens when starting consultation
userChargesRoute.post("/deduct-tokens", authenticateToken, UserChargesController.deductTokens);

// Get client's token balance and transaction history
userChargesRoute.get("/client-token-info/:clientId", authenticateToken, UserChargesController.getClientTokenInfo);

// Get token transaction history for a user
userChargesRoute.get("/token-history/:userId", authenticateToken, UserChargesController.getTokenTransactionHistory);

export default userChargesRoute;
