import { User } from "../models/user";
import Helper from "../utils/helper"; // Adjust the path based on your project structure

interface ResponseObject {
    success: boolean;
    message: string;
    data?: any;
}

class UserService {
    private response: ResponseObject;

    /**
     * Update User
     */
    async updateUser(userId: string, updatedData: Partial<Record<string, any>>) {
        try {
            const filteredData = Object.fromEntries(
                Object.entries(updatedData).filter(([_, value]) => value !== undefined && value !== null)
            );

            const user = await User.findByIdAndUpdate(userId, filteredData, {
                new: true,
                runValidators: true,
            });

            if (!user) {
                this.response = {
                    success: false,
                    message: "user_not_found",
                };
            } else {
                this.response = {
                    success: true,
                    message: "update_successful",
                    data: user,
                };
            }
        } catch (error) {
            this.response = {
                success: false,
                message: error.message || "update_failed",
            };
        }

        return this.response;
    }

    /**
     * Get Presigned URL
     */
     async getPresignedUrl(requestData) {
        try {
            const { filePath, fileFormat } = requestData;
            const data = await Helper.gettingPreSignedUrl(filePath, fileFormat);
            return {
                message: "presigned_url_generated",
                success: true,
                data,
            };
        } catch (error) {
            throw new Error(error.message);
        }
    }

    /**
     * Get User List
     */
     async getUserList(accountType, offset, limit) {
        try {
            const query = accountType ? { account_type: accountType } : {};
            const users = await User.find(query).skip(offset).limit(limit);
            return users;
        } catch (error) {
            throw new Error(error.message);
        }
    }

    /**
     * Get User Info
     */
     async getUserInfo(userId) {
        try {
            const user = await User.findById(userId);
            if (!user) {
                throw new Error("User not found");
            }
            return user;
        } catch (error) {
            throw new Error(error.message);
        }
    }
}

export default new UserService();