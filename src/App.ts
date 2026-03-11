import express from "express";
import cors from "cors";
import { createServer } from "http";
import awsServerlessExpress from "aws-serverless-express";
import * as bodyParser from "body-parser";
import config from "./config/envConfig";
import authRoutes from "./routes/AuthRoutes";

import { dbConnection } from "./db/connection";
import userRoute from "./routes/UserRoute";
import questionRoute from "./routes/QuestionRoute";
import activityRoute from "./routes/ActivityRoute";
import dashboardRoute from "./routes/DashboardRoute";
import aiRoute from "./routes/AIRoute";
import chatRoute from "./routes/ChatRoute";
import aiMarketingRoute from "./routes/AIMarketingRoute";
import secureLinkRoute from "./routes/SecureLinkRoute";
import SocketService from "./services/SocketService";
import UserController from "./controllers/UserController";
import { authenticateToken } from "./middleware/auth";

const app = express();
const httpServer = createServer(app);
const envConfig = config();

// Initialize Socket.IO service
let socketService: SocketService;

// app.use(cors({
//   origin: "https://main.dmvg3pklpu0nm.amplifyapp.com",
//   methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization"],
//   credentials: false,
// }));
app.use(cors({
  origin: "*", // Allow all origins for development; restrict in production
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true, // Set to true if you need to allow cookies or HTTP authentication
}));
const port = envConfig.port;
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/user", userRoute);
// Direct route for save-pc-id at /api/v1/save-pc-id
app.post("/api/v1/save-pc-id", authenticateToken, UserController.savePcId);
// Direct route for reset-pc-license at /api/v1/reset-pc-license
app.post("/api/v1/reset-pc-license", authenticateToken, UserController.resetPcLicense);
app.use("/api/v1/question", questionRoute);
app.use("/api/v1/activity", activityRoute);

import documentRoute from "./routes/DocumentRoute";
import meetingRoute from "./routes/MeetingRoute";
import tokenRoute from "./routes/TokenRoute";
import stripeRoute from "./routes/StripeRoute";
import blogRoute from "./routes/BlogRoute";
import postRoute from "./routes/PostRoute";
import paymentRoute from "./routes/PaymentRoute";
import contentMonitoringRoute from "./routes/ContentMonitoringRoute";
import policyRoute from "./routes/PolicyRoute";
import caseRoute from "./routes/CaseRoute";
import userChargesRoute from "./routes/UserChargesRoute";
import notificationRoutes from "./routes/notificationRoutes";
import placesRoute from "./routes/PlacesRoute";
import adminDashboardRoute from "./routes/AdminDashboardRoute";
import bookmarkRoute from "./routes/BookmarkRoute";
import reportRoute from "./routes/ReportRoute";
import aiReporterRoute from "./routes/AIReporterRoute";
import { AIReporterCronService } from "./services/AIReporterCronService";
app.use("/api/v1/document", documentRoute);
app.use("/api/v1/meeting", meetingRoute);
app.use("/api/v1/user", tokenRoute);
app.use("/api/v1/stripe", stripeRoute);
app.use("/api/v1/blog", blogRoute);
app.use("/api/v1/post", postRoute);
app.use("/api/v1/dashboard", dashboardRoute);
app.use("/api/v1/ai", aiRoute);
app.use("/api/v1/chat", chatRoute);
app.use("/api/v1/ai-marketing", aiMarketingRoute);
app.use("/api/v1/payment", paymentRoute);
app.use("/api/v1/content", contentMonitoringRoute);
app.use("/api/v1/policies", policyRoute);
app.use("/api/v1/case", caseRoute);
app.use("/api/v1/stripe", stripeRoute);
app.use("/api/v1/token", tokenRoute);
app.use("/api/v1/secure-link", secureLinkRoute);
app.use("/api/v1/charges", userChargesRoute);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/places", placesRoute);
app.use("/api/v1/admin", adminDashboardRoute);
app.use("/api/v1/bookmark", bookmarkRoute);
app.use("/api/v1/report", reportRoute);
app.use("/api/v1/ai-reporter", aiReporterRoute);

// Handle short URL redirects for posts
app.get('/l/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const frontendUrl = process.env.FRONTEND_URL || process.env.frontendUrl || 'https://lawgg.net';

    // Redirect to frontend with the slug and any query parameters
    const queryString = req.url.split('?')[1];
    const redirectUrl = queryString
      ? `${frontendUrl}/${slug}?${queryString}`
      : `${frontendUrl}/${slug}`;

    res.redirect(302, redirectUrl);
  } catch (error) {
    console.error('Short URL redirect error:', error);
    res.status(404).json({
      success: false,
      message: 'Post not found'
    });
  }
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// Initialize server after DB connection is established
let server: any;

dbConnection.then(async () => {
  // Database index cleanup for Bookmarks (fixes E11000 duplicate key errors)
  try {
    const mongoose = (await import('mongoose')).default;
    const db = mongoose.connection.db;
    if (db) {
      console.log('Cleaning up old Bookmark indexes...');
      await db.collection('bookmarks').dropIndex('userId_1_postId_1').catch(() => { });
      await db.collection('bookmarks').dropIndex('userId_1_questionId_1').catch(() => { });
      console.log('Bookmark indexes cleaned.');
    }
  } catch (e) {
    console.warn('Index cleanup skipped:', e.message);
  }

  // Initialize Socket.IO service
  socketService = new SocketService(httpServer);


  // Initialize AI Reporter cron jobs
  AIReporterCronService.initializeCronJobs();
  AIReporterCronService.initializeArchiveCleanup();

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${port}`);
    console.log(`Socket.IO server initialized`);
    console.log(`AI Reporter cron service initialized`);
  });

  server = awsServerlessExpress.createServer(app);
}).catch(err => {
  console.error('Failed to start server due to database connection issue:', err);
  process.exit(1);
});

// Export socket service for use in other parts of the application
export { socketService };

module.exports.handler = (event: unknown, context: unknown) =>
  awsServerlessExpress.proxy(server, event, context);
