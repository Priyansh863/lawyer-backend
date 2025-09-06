import express from "express";
import UserController from "../controllers/UserController";
import Auth from "../middlewares/auth"; // Add this import
import { authenticateToken } from "../middleware/auth";

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

// Route to get user Cases by Role & ID
userRoute.get("/cases",Auth,UserController.getCases)

// Route to get related users(clients or lawyers) based on the user's role
userRoute.get("/related", Auth, UserController.getRelatedUsers);

// Create a new case
userRoute.post("/CreateCases", Auth, UserController.createCase);

// get all clients and lawyers
userRoute.get("/clients-and-lawyers", Auth, UserController.getClientsAndLawyers);

// Blog routes
userRoute.get("/blogs", UserController.getBlogs);
userRoute.get("/blogs/:id", UserController.getBlogById);
userRoute.post("/blogs", UserController.createBlog);
userRoute.put("/blogs/:id", UserController.updateBlog);
userRoute.delete("/blogs/:id", UserController.deleteBlog);

// NEW: Client notes routes (lawyer only)
userRoute.put("/client/:clientId/notes", authenticateToken, UserController.updateClientNotes);
userRoute.get("/client/:clientId/notes", authenticateToken, UserController.getClientNotes);

userRoute.get("/lawyers", UserController.getLawyers);
userRoute.get("/clients-list", authenticateToken, UserController.getClientsList);


export default userRoute;
