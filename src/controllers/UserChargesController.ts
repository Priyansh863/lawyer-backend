import { Request, Response } from "express";
import { User } from "../models/user";

export default class UserChargesController {
  /**
   * Update lawyer consultation charges
   * @param req.body.userId - User ID
   * @param req.body.charges - Hourly consultation rate
   */
  static async updateCharges(req: Request, res: Response) {
    try {
      const { userId, charges } = req.body;

      // Validate required fields
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID is required"
        });
      }

      if (charges === undefined || charges === null) {
        return res.status(400).json({
          success: false,
          message: "Charges amount is required"
        });
      }

      // Validate charges amount
      if (charges < 0) {
        return res.status(400).json({
          success: false,
          message: "Charges cannot be negative"
        });
      }

      // Find user
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      // Only lawyers can set charges
      if (user.account_type !== 'lawyer') {
        return res.status(403).json({
          success: false,
          message: "Only lawyers can set consultation charges"
        });
      }

      // Update charges
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { charges: charges },
        { new: true, runValidators: true }
      ).select('-password -otp -otp_expires');

      return res.status(200).json({
        success: true,
        message: "Consultation charges updated successfully",
        user: updatedUser
      });

    } catch (error: any) {
      console.error("Error updating charges:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to update consultation charges"
      });
    }
  }

  /**
   * Get lawyer charges by user ID
   * @param req.params.userId - User ID
   */
  static async getCharges(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID is required"
        });
      }

      const user = await User.findById(userId)
        .select('first_name last_name account_type charges pratice_area experience');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      return res.status(200).json({
        success: true,
        user: {
          _id: user._id,
          first_name: user.first_name,
          last_name: user.last_name,
          account_type: user.account_type,
          charges: user.charges || 0,
          pratice_area: user.pratice_area,
          experience: user.experience
        }
      });

    } catch (error: any) {
      console.error("Error getting charges:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to get user charges"
      });
    }
  }

  /**
   * Get all lawyers with their charges
   * Used for displaying lawyer rates in chat/video consultation
   */
  static async getAllLawyersWithCharges(req: Request, res: Response) {
    try {
      const lawyers = await User.find(
        { account_type: 'lawyer' },
        'first_name last_name email profile_image pratice_area experience charges'
      ).sort({ first_name: 1 });

      return res.status(200).json({
        success: true,
        lawyers: lawyers.map(lawyer => ({
          _id: lawyer._id,
          first_name: lawyer.first_name,
          last_name: lawyer.last_name,
          email: lawyer.email,
          profile_image: lawyer.profile_image,
          pratice_area: lawyer.pratice_area,
          experience: lawyer.experience,
          charges: lawyer.charges || 0
        }))
      });

    } catch (error: any) {
      console.error("Error getting lawyers with charges:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to get lawyers"
      });
    }
  }
}
