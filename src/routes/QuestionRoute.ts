import express from "express";
import QuestionController from "../controllers/QuestionController";
import Auth from "../middlewares/auth";

const questionRoute = express.Router();

// Create a new question - requires authentication (client only)
questionRoute.post("/", Auth, QuestionController.createQuestion);

// Get questions - no authentication required for viewing, but could be added if needed
questionRoute.get("/", QuestionController.getQuestions);

// Get a single question by ID
questionRoute.get("/:id", QuestionController.getQuestionById);

// Submit an answer to a question (lawyers only)
questionRoute.post("/answer/:id", Auth, QuestionController.submitAnswer);

// Edit an answer (lawyers only)
questionRoute.put("/answer/:id", Auth, QuestionController.editAnswer);

// Delete a question (only the client who created it or the lawyer who answered it)
questionRoute.delete("/:id", Auth, QuestionController.deleteQuestion);

export default questionRoute;
