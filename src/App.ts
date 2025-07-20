import express from "express";
import cors from "cors";
import awsServerlessExpress from "aws-serverless-express";
import * as bodyParser from "body-parser";
import config from "./config/envConfig";
import authRoutes from "./routes/AuthRoutes";

import { dbConnection } from "./db/connection";
import userRoute from "./routes/UserRoute";
import questionRoute from "./routes/QuestionRoute";

const app = express();
const envConfig = config();

// app.use(cors({
//   origin: "https://main.dmvg3pklpu0nm.amplifyapp.com",
//   methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization"],
//   credentials: false,
// }));
app.use(cors({
  origin: "*", // Allow all origins for development; restrict in production
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true, // Set to true if you need to allow cookies or HTTP authentication
}));
const port = envConfig.port;
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/user", userRoute);
app.use("/api/v1/question", questionRoute);

import documentRoute from "./routes/DocumentRoute";
app.use("/api/v1/document", documentRoute);

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

dbConnection.then(() => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${port}`);
  });
  
  server = awsServerlessExpress.createServer(app);
}).catch(err => {
  console.error('Failed to start server due to database connection issue:', err);
  process.exit(1);
});

module.exports.handler = (event: unknown, context: unknown) =>
  awsServerlessExpress.proxy(server, event, context);
