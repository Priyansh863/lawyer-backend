import express from "express";
import UserController from "../controllers/UserController";

const userRoute = express.Router();

// Route to update user details
userRoute.put("/update/:id", UserController.updateUser);

// Route for generating presigned URLs
userRoute.post(
    "/get-presigned-url",
    UserController.getPresignedUrl
  );

// Route to get user list with account type, offset, and limit
userRoute.get("/list", UserController.getUserList);

// Route to get user info by ID
userRoute.get("/info/:id", UserController.getUserInfo);

export default userRoute;