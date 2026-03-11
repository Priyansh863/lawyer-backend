import express from "express";
import QuestionController from "../controllers/QuestionController";
import Auth from "../middlewares/auth";
import OptionalAuth from "../middlewares/optionalAuth";

const questionRoute = express.Router();

// Create a new question - requires authentication (client only)
questionRoute.post("/", Auth, QuestionController.createQuestion);

// Get questions - OptionalAuth allows personalized filters (waiting/my_answers) for logged-in lawyers
questionRoute.get("/", OptionalAuth, QuestionController.getQuestions);

// Get a single question by ID
questionRoute.get("/:id", OptionalAuth, QuestionController.getQuestionById);

// Submit an answer to a question (lawyers only)
questionRoute.post("/answer/:id", Auth, QuestionController.submitAnswer);

// Edit an answer (lawyers only)
questionRoute.put("/answer/:id", Auth, QuestionController.editAnswer);

// Delete a question (only the client who created it or the lawyer who answered it)
questionRoute.delete("/:id", Auth, QuestionController.deleteQuestion);

// Social actions
questionRoute.post("/:id/bookmark", Auth, QuestionController.toggleBookmark);
questionRoute.post("/:id/report", Auth, QuestionController.reportQuestion);
questionRoute.post("/:id/block", Auth, QuestionController.blockUser);
questionRoute.post("/:id/not-interested", Auth, QuestionController.notInterested);
questionRoute.get("/:id/qr", QuestionController.generateQRCode);

export default questionRoute;
