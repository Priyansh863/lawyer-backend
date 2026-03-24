import Question from "../models/question";
import mongoose from "mongoose";
import { User } from "../models/user";
import Bookmark from "../models/Bookmark";

interface GetQuestionsParams {
  status?: string;
  category?: string;
  filter?: 'waiting' | 'my_answers' | 'my_questions' | 'bookmarks' | string;
  userId?: string;
  role?: string;
  page?: number;
  limit?: number;
}

interface CreateQuestionInput {
  question: string;
  clientName?: string;
  isAnonymous: boolean;
  category: string;
  tags?: string;
  images?: string[];
  clientId: string;
}

class QuestionService {
  // Helper to mask identity (fag2*** style)
  private maskName(name: string): string {
    if (!name) return "Anonymous";
    if (name.length <= 4) return name + "***";
    return name.substring(0, 4) + "***";
  }

  async createQuestion(data: CreateQuestionInput) {
    try {
      // Create new question
      const newQuestion = await Question.create({
        question: data.question,
        clientName: data.isAnonymous ? undefined : data.clientName,
        isAnonymous: data.isAnonymous,
        category: data.category,
        tags: data.tags,
        images: data.images || [],
        clientId: new mongoose.Types.ObjectId(data.clientId),
        status: "pending",
      });

      // Send notification for new Q&A question
      try {
        const { NotificationService } = await import('../services/notificationService');
        await NotificationService.notifyQAQuestionPosted(newQuestion, data.clientId);
      } catch (notificationError) {
        console.error('Failed to send Q&A question notification:', notificationError);
      }

      return newQuestion;
    } catch (error) {
      console.error("QuestionService createQuestion error:", error);
      throw error;
    }
  }

  async getQuestions({
    status,
    category,
    filter,
    userId,
    role,
    page = 1,
    limit = 10
  }: GetQuestionsParams) {
    try {
      let filterQuery: Record<string, any> = {};
      let lawyerName = "";
      const roleNormalized = role?.toString().toLowerCase();

      if (userId) {
        const user = await User.findById(userId);
        if (user) {
          lawyerName = `${user.first_name} ${user.last_name}`;
        }
      }

      // Apply base filters
      // Normalize filter for easier comparison (handle my_answers, my-answers, myAnswers)
      // If filter is missing, try to use status as the filter (for backward compatibility)
      let normalizedFilter = filter?.toString().toLowerCase().replace(/[-_ ]/g, '');
      const normalizedStatus = status?.toString().toLowerCase();

      if (!normalizedFilter && normalizedStatus) {
        if (['waiting', 'myanswers', 'bookmarks', 'my_answers'].includes(normalizedStatus.replace(/[-_ ]/g, ''))) {
          normalizedFilter = normalizedStatus.replace(/[-_ ]/g, '');
        } else if (normalizedStatus === 'pending' && userId) {
          // If a lawyer is logged in and asks for 'pending', show them the smart 'waiting' view
          normalizedFilter = 'waiting';
        }
      }

      if (status && !['myanswers', 'waiting'].includes(normalizedFilter || '')) filterQuery.status = status;
      if (category) filterQuery.category = category;

      const isClient = roleNormalized === "client";
      const isLawyer = roleNormalized === "lawyer";

      // Apply specialized filters for the social-style tabs
      if (normalizedFilter === 'waiting' && userId && isLawyer) {
        // Show questions the lawyer (logged-in user) has NOT answered (by ID or Name)
        // Also ensure we don't strictly filter by 'pending' status so they can see all joinable chats
        filterQuery.answer = {
          $not: {
            $elemMatch: {
              $or: [
                { lawyer_id: new mongoose.Types.ObjectId(userId.toString()) },
                { lawyer_name: { $regex: new RegExp(`^${lawyerName}$`, 'i') } }
              ]
            }
          }
        };
      } else if (normalizedFilter === 'waiting') {
        // Guests/clients: default to pending
        filterQuery.status = 'pending';
      } else if (normalizedFilter === 'myanswers') {
        if (!userId) {
          return { questions: [], pagination: { total: 0, page, limit, pages: 0 } };
        }
        if (isClient) {
          // Client: only show the client's questions that have at least one answer
          filterQuery.clientId = new mongoose.Types.ObjectId(userId.toString());
          // answer is an array; require at least 1 element
          filterQuery["answer.0"] = { $exists: true };
        } else {
          // Lawyer: keep existing behavior (filter answers by lawyer_id/lawyer_name)
          filterQuery.answer = {
            $elemMatch: {
              $or: [
                { lawyer_id: new mongoose.Types.ObjectId(userId.toString()) },
                { lawyer_name: { $regex: new RegExp(`^${lawyerName}$`, 'i') } }
              ]
            }
          };
        }
      } else if (normalizedFilter === 'bookmarks' && userId) {
        const bookmarks = await Bookmark.find({ userId: new mongoose.Types.ObjectId(userId.toString()), questionId: { $exists: true } });
        const questionIds = bookmarks.map(b => b.questionId);
        filterQuery._id = { $in: questionIds };
      } else if (normalizedFilter === 'myquestions') {
        // Client-only filter: only show questions created by the logged-in client
        if (!isClient || !userId) {
          return { questions: [], pagination: { total: 0, page, limit, pages: 0 } };
        }
        filterQuery.clientId = new mongoose.Types.ObjectId(userId.toString());
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Get questions with populated client data
      const rawQuestions = await Question.find(filterQuery)
        .populate('clientId', 'first_name last_name email account_type')
        .populate('answeredBy', 'first_name last_name email account_type')
        .sort({ createdAt: -1 }) // newest first
        .skip(skip)
        .limit(limit);

      // Fetch bookmarks if user is logged in
      let userBookmarks: string[] = [];
      if (userId) {
        const bookmarks = await Bookmark.find({
          userId: new mongoose.Types.ObjectId(userId.toString()),
          questionId: { $exists: true }
        });
        userBookmarks = bookmarks.map(b => b.questionId?.toString() || "");
      }

      // Transform questions to include masked names and bookmark status
      const questions = rawQuestions.map((q: any) => {
        const questionObj = q.toObject();

        // Add bookmark status
        questionObj.isBookmarked = userId ? userBookmarks.includes(questionObj._id.toString()) : false;

        // If it's the lawyer-specific 'my_answers' tab, only show the current lawyer's answers
        if (normalizedFilter === 'myanswers' && isLawyer && userId && questionObj.answer) {
          const currentLawyerId = userId.toString().toLowerCase();
          const currentLawyerName = lawyerName.toLowerCase();

          questionObj.answer = questionObj.answer.filter((ans: any) => {
            const matchesId = ans.lawyer_id?.toString()?.toLowerCase() === currentLawyerId;
            const matchesName = ans.lawyer_name?.toLowerCase() === currentLawyerName;
            return matchesId || matchesName;
          });
        }

        if (questionObj.isAnonymous) {
          questionObj.clientDisplayName = this.maskName(questionObj.clientName || "User");
        } else {
          questionObj.clientDisplayName = questionObj.clientId
            ? `${questionObj.clientId.first_name} ${questionObj.clientId.last_name}`
            : "Unknown";
        }
        return questionObj;
      });

      // Get total count for pagination
      const total = await Question.countDocuments(filterQuery);

      return {
        questions,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error("QuestionService getQuestions error:", error);
      throw error;
    }
  }

  async getQuestionById(questionId: string, userId?: string) {
    try {
      // Find question by ID and populate user details
      const question = await Question.findById(questionId)
        .populate('clientId', 'first_name last_name email account_type')
        .populate('answeredBy', 'first_name last_name email account_type');

      if (question && userId) {
        const questionObj = question.toObject();
        const bookmark = await Bookmark.findOne({
          userId: new mongoose.Types.ObjectId(userId.toString()),
          questionId: new mongoose.Types.ObjectId(questionId)
        });
        (questionObj as any).isBookmarked = !!bookmark;
        return questionObj;
      }

      return question;
    } catch (error) {
      console.error("QuestionService getQuestionById error:", error);
      throw error;
    }
  }

  async submitAnswer(questionId: string, answer: string, lawyerId: string, images: string[] = [], location?: string) {
    try {
      // Find the question and ensure it exists
      const question = await Question.findById(questionId)
        .populate('answeredBy', 'first_name last_name');

      if (!question) {
        return null;
      }

      // Get lawyer details to include lawyer name
      const lawyer = await User.findById(lawyerId);

      if (!lawyer) {
        throw new Error("Lawyer not found");
      }

      const lawyerName = `${lawyer.first_name} ${lawyer.last_name}`;

      // Always add new answer to the array (allow multiple answers from same lawyer)
      if (!question.answer) {
        question.answer = [];
      }

      question.answer.push({
        lawyer_name: lawyerName,
        lawyer_id: new mongoose.Types.ObjectId(lawyerId),
        answer: answer,
        images: images,
        location: location
      });

      question.status = "answered";
      question.answeredBy = new mongoose.Types.ObjectId(lawyerId);
      question.answeredAt = new Date();

      // Save the updated question
      await question.save();

      // Send notification for new Q&A answer
      try {
        const { NotificationService } = await import('../services/notificationService');
        const populatedQuestion = await Question.findById(questionId)
          .populate('clientId', 'first_name last_name email account_type')
          .populate('answeredBy', 'first_name last_name email account_type');

        if (populatedQuestion) {
          await NotificationService.notifyQAAnswerPosted(
            { lawyer_name: lawyerName, answer },
            populatedQuestion,
            lawyerId
          );
        }
      } catch (notificationError) {
        console.error('Failed to send Q&A answer notification:', notificationError);
      }

      // Return the updated question with populated fields
      return await Question.findById(questionId)
        .populate('clientId', 'first_name last_name email account_type')
        .populate('answeredBy', 'first_name last_name email account_type');
    } catch (error) {
      console.error("QuestionService submitAnswer error:", error);
      throw error;
    }
  }

  async editAnswer(questionId: string, answer: string, lawyerId: string, images?: string[], location?: string) {
    try {
      // Find the question and ensure it exists
      const question = await Question.findById(questionId);

      if (!question) {
        return null;
      }

      // Get lawyer details to find their existing answer
      const lawyer = await User.findById(lawyerId);

      if (!lawyer) {
        throw new Error("Lawyer not found");
      }

      const lawyerName = `${lawyer.first_name} ${lawyer.last_name}`;

      // Find the lawyer's most recent answer in the array (last occurrence)
      let existingAnswerIndex = -1;
      if (question.answer && question.answer.length > 0) {
        for (let i = question.answer.length - 1; i >= 0; i--) {
          if (question.answer[i].lawyer_id?.toString() === lawyerId) {
            existingAnswerIndex = i;
            break;
          }
        }
      }

      if (existingAnswerIndex < 0) {
        return null; // Lawyer hasn't answered this question yet
      }

      // Update the lawyer's most recent answer
      question.answer![existingAnswerIndex].answer = answer;
      if (images) question.answer![existingAnswerIndex].images = images;
      if (location) question.answer![existingAnswerIndex].location = location;
      question.updatedAt = new Date(); // This will happen automatically if timestamps are enabled in schema

      // Save the updated question
      await question.save();

      // Return the updated question with populated fields
      return await Question.findById(questionId)
        .populate('clientId', 'first_name last_name email account_type')
        .populate('answeredBy', 'first_name last_name email account_type');
    } catch (error) {
      console.error("QuestionService editAnswer error:", error);
      throw error;
    }
  }

  async deleteQuestion(questionId: string, userId: string, role: string) {
    try {
      // Find the question and ensure it exists
      const question = await Question.findById(questionId);

      if (!question) {
        return { success: false, message: "Question not found" };
      }

      // Check permissions - only the original client or the lawyer who answered can delete
      const isClient = question.clientId && question.clientId.toString() === userId;
      const isAnsweringLawyer = question.answeredBy && question.answeredBy.toString() === userId && role === "lawyer";

      if (!isClient && !isAnsweringLawyer) {
        return { success: false, message: "You don't have permission to delete this question" };
      }

      // Delete the question
      await Question.findByIdAndDelete(questionId);

      return { success: true, message: "Question deleted successfully" };
    } catch (error) {
      console.error("QuestionService deleteQuestion error:", error);
      throw error;
    }
  }

  async editAnswerById(questionId: string, answerId: string, newAnswer: string, lawyerId: string, images?: string[], location?: string) {
    try {
      // Find the question and ensure it exists
      const question = await Question.findById(questionId);

      if (!question) {
        return null;
      }

      // Get lawyer details to verify ownership
      const lawyer = await User.findById(lawyerId);

      if (!lawyer) {
        throw new Error("Lawyer not found");
      }

      const lawyerName = `${lawyer.first_name} ${lawyer.last_name}`;

      // Find the specific answer by ID and verify it belongs to this lawyer
      const answerIndex = question.answer?.findIndex(
        (ans) => ans._id?.toString() === answerId && ans.lawyer_id?.toString() === lawyerId
      );

      if (answerIndex === undefined || answerIndex < 0) {
        return null; // Answer not found or doesn't belong to this lawyer
      }

      // Update the specific answer
      question.answer![answerIndex].answer = newAnswer;
      if (images) question.answer![answerIndex].images = images;
      if (location) question.answer![answerIndex].location = location;
      question.updatedAt = new Date();

      // Save the updated question
      await question.save();

      // Return the updated question with populated fields
      return await Question.findById(questionId)
        .populate('clientId', 'first_name last_name email account_type')
        .populate('answeredBy', 'first_name last_name email account_type');
    } catch (error) {
      console.error("QuestionService editAnswerById error:", error);
      throw error;
    }
  }

  async deleteAnswer(questionId: string, answerId: string, lawyerId: string) {
    try {
      // Find the question and ensure it exists
      const question = await Question.findById(questionId);

      if (!question) {
        return null;
      }

      // Get lawyer details to verify ownership
      const lawyer = await User.findById(lawyerId);

      if (!lawyer) {
        throw new Error("Lawyer not found");
      }

      const lawyerName = `${lawyer.first_name} ${lawyer.last_name}`;

      // Find the specific answer by ID and verify it belongs to this lawyer
      const answerIndex = question.answer?.findIndex(
        (ans) => ans._id?.toString() === answerId && ans.lawyer_id?.toString() === lawyerId
      );

      if (answerIndex === undefined || answerIndex < 0) {
        return null; // Answer not found or doesn't belong to this lawyer
      }

      // Remove the specific answer from the array
      question.answer!.splice(answerIndex, 1);

      // If no answers left, update status to pending
      if (question.answer!.length === 0) {
        question.status = "pending";
        question.answeredBy = undefined;
        question.answeredAt = undefined;
      }

      question.updatedAt = new Date();

      // Save the updated question
      await question.save();

      // Return the updated question with populated fields
      return await Question.findById(questionId)
        .populate('clientId', 'first_name last_name email account_type')
        .populate('answeredBy', 'first_name last_name email account_type');
    } catch (error) {
      console.error("QuestionService deleteAnswer error:", error);
      throw error;
    }
  }

  async getQuestionsByLawyer(lawyerId: string) {
    try {
      // Get lawyer details
      const lawyer = await User.findById(lawyerId);

      if (!lawyer) {
        throw new Error("Lawyer not found");
      }

      const lawyerName = `${lawyer.first_name} ${lawyer.last_name}`;

      // Find questions where this lawyer has provided an answer
      const questions = await Question.find({
        "answer.lawyer_id": new mongoose.Types.ObjectId(lawyerId)
      })
        .populate('clientId', 'first_name last_name email account_type')
        .populate('answeredBy', 'first_name last_name email account_type')
        .sort({ createdAt: -1 });

      return questions;
    } catch (error) {
      console.error("QuestionService getQuestionsByLawyer error:", error);
      throw error;
    }
  }
}

export default new QuestionService();
