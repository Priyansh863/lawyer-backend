import { Request, Response } from 'express';
import QuestionService from "../services/QuestionService";
import mongoose from "mongoose";
import Question from "../models/question";
import { User } from "../models/user";

class QuestionController {
  static async createQuestion(req: Request, res: Response) {
    try {
      const userId = req["id"]; // From auth middleware
      const questionData = req.body;

      if (questionData.question && questionData.question.length > 5000) {
        return res.status(400).json({
          success: false,
          message: "Question cannot exceed 5000 characters"
        });
      }

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
      const { status, category, filter, page = 1, limit = 10 } = req.query as {
        status?: string;
        category?: string;
        filter?: string;
        page?: string;
        limit?: string;
      };

      const userId = req["id"];
      const role = req["role"];

      console.log(`[Diagnostic] Controller Authorization: ${req.headers.authorization || req.headers.auth}`);
      console.log(`[Diagnostic] Controller userId: ${userId}, role: ${role}`);

      const pageNumber = Number(page);
      const pageLimit = Number(limit);

      const questions = await QuestionService.getQuestions({
        status: status?.toString(),
        category: category?.toString(),
        filter: filter as any,
        userId: userId,
        role: role?.toString(),
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

      const userId = req["id"];
      const question = await QuestionService.getQuestionById(id, userId);

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
      const { answer, images, location } = req.body;
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

      if (answer.length > 5000) {
        return res.status(400).json({
          success: false,
          message: "Answer cannot exceed 5000 characters"
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

      const updatedQuestion = await QuestionService.submitAnswer(id, answer, lawyerId, images, location);

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
      console.error("FULL ERROR STACK - submitAnswer:", error.stack);
      console.error("Error data:", {
        id: req.params.id,
        lawyerId: req["id"],
        body: req.body
      });
      res.status(500).json({
        success: false,
        message: error.message || "Failed to submit answer"
      });
    }
  }

  static async editAnswer(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { answer, images, location } = req.body;
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

      const updatedQuestion = await QuestionService.editAnswer(id, answer, lawyerId, images, location);

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
  static async blockUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req["id"];

      const question = await Question.findById(id);
      if (!question) {
        return res.status(404).json({ success: false, message: "Question not found" });
      }

      const authorId = question.clientId;

      await User.findByIdAndUpdate(userId, {
        $addToSet: { blocked_users: authorId }
      });

      res.status(200).json({ success: true, message: "User blocked successfully" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async toggleBookmark(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req["id"];

      const existingBookmark = await Bookmark.findOne({ userId, questionId: id });

      if (existingBookmark) {
        await Bookmark.findByIdAndDelete(existingBookmark._id);
        return res.status(200).json({ success: true, isBookmarked: false, message: "Bookmark removed" });
      } else {
        await Bookmark.create({ userId, questionId: id });
        return res.status(200).json({ success: true, isBookmarked: true, message: "Bookmark added" });
      }
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async reportQuestion(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = req["id"];

      await Report.create({
        userId,
        questionId: id,
        reason,
        status: 'pending'
      });

      res.status(200).json({ success: true, message: "Report submitted successfully" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async notInterested(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req["id"];

      // Hidden questions could be tracked in a separate collection or a user field
      // For now, we'll just acknowledge the action
      res.status(200).json({
        success: true,
        message: "We'll show you fewer questions like this"
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async generateQRCode(req: Request, res: Response) {
    try {
      const { id } = req.params;
      // In a real app, use a QR lib. For now, return a deep link URL
      const qrUrl = `${process.env.FRONTEND_URL}/questions/${id}`;
      res.status(200).json({
        success: true,
        data: { qrUrl }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

import Bookmark from "../models/Bookmark";
import Report from "../models/Report";
export default QuestionController;
