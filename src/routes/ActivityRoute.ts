import { Router } from "express";
import ActivityController from "../controllers/ActivityController";
import Auth from "../middlewares/auth";

const router = Router();

// GET all activities
router.get("/get-activities",Auth, (req, res, next) => {
  const { user_id } = req.query;
  req.query = { user_id };
  next();
}, ActivityController.getAll);

// POST create activity
router.post("/create-activity", ActivityController.create);

export default router;
