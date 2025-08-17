import { Request, Response } from 'express';
import QuestionService from "../services/QuestionService";
import mongoose from "mongoose";

class QuestionController {
  static async createQuestion(req: Request, res: Response) {
    try {
      const userId = req["id"]; // From auth middleware
      const questionData = req.body;
      
      // Add the client ID from authenticated user
      const newQuestion = await QuestionService.createQuestion({
        ...questionData,
        clientId: userId
      });
      
      res.status(201).json({ 
        success: true, 
        message: "Question created successfully", 
        data: newQuestion 
      });
    } catch (error) {
      console.error("Error creating question:", error);
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to create question" 
      });
    }
  }

  static async getQuestions(req: Request, res: Response) {
    try {
      const { status, category, page = 1, limit = 10 } = req.query as {
        status?: string;
        category?: string;
        page?: string;
        limit?: string;
      };

      const pageNumber = Number(page);
      const pageLimit = Number(limit);

      const questions = await QuestionService.getQuestions({
        status: status?.toString(),
        category: category?.toString(),
        page: pageNumber,
        limit: pageLimit
      });

      res.status(200).json({ 
        success: true, 
        data: questions 
      });
    } catch (error) {
      console.error("Error fetching questions:", error);
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to fetch questions" 
      });
    }
  }
  
  static async getQuestionById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid question ID format"
        });
      }
      
      const question = await QuestionService.getQuestionById(id);
      
      if (!question) {
        return res.status(404).json({
          success: false,
          message: "Question not found"
        });
      }
      
      res.status(200).json({
        success: true,
        data: question
      });
      
    } catch (error) {
      console.error("Error fetching question:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch question"
      });
    }
  }
  
  static async submitAnswer(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { answer } = req.body;
      const lawyerId = req["id"]; // From auth middleware
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid question ID format"
        });
      }
      
      if (!answer || typeof answer !== "string" || answer.trim().length < 10) {
        return res.status(400).json({
          success: false,
          message: "Answer must be at least 10 characters long"
        });
      }
      
      // Check if the user is a lawyer - FIXED: use req["role"] instead of req["account_type"]
      const userType = req["role"];
      if (userType !== "lawyer") {
        return res.status(403).json({
          success: false,
          message: "Only lawyers can submit answers"
        });
      }
      
      const updatedQuestion = await QuestionService.submitAnswer(id, answer, lawyerId);
      
      if (!updatedQuestion) {
        return res.status(404).json({
          success: false,
          message: "Question not found"
        });
      }
      
      res.status(200).json({
        success: true,
        message: "Answer submitted successfully",
        data: updatedQuestion
      });
      
    } catch (error) {
      console.error("Error submitting answer:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to submit answer"
      });
    }
  }
  
  static async editAnswer(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { answer } = req.body;
      const lawyerId = req["id"]; // From auth middleware
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid question ID format"
        });
      }
      
      if (!answer || typeof answer !== "string" || answer.trim().length < 10) {
        return res.status(400).json({
          success: false,
          message: "Answer must be at least 10 characters long"
        });
      }
      
      // Check if the user is a lawyer - FIXED: use req["role"] instead of req["account_type"]
      const userType = req["role"];
      if (userType !== "lawyer") {
        return res.status(403).json({
          success: false,
          message: "Only lawyers can edit answers"
        });
      }
      
      const updatedQuestion = await QuestionService.editAnswer(id, answer, lawyerId);
      
      if (!updatedQuestion) {
        return res.status(404).json({
          success: false,
          message: "Question not found or you are not authorized to edit this answer"
        });
      }
      
      res.status(200).json({
        success: true,
        message: "Answer updated successfully",
        data: updatedQuestion
      });
      
    } catch (error) {
      console.error("Error updating answer:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to update answer"
      });
    }
  }

  static async deleteQuestion(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req["id"]; // From auth middleware
      const role = req["role"]; // From auth middleware
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid question ID format"
        });
      }
      
      const result = await QuestionService.deleteQuestion(id, userId, role);
      
      if (!result.success) {
        return res.status(403).json({
          success: false,
          message: result.message
        });
      }
      
      res.status(200).json({
        success: true,
        message: result.message
      });
      
    } catch (error) {
      console.error("Error deleting question:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to delete question"
      });
    }
  }
}

export default QuestionController;
