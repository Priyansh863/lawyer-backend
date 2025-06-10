import express from "express";
import cors from "cors";
import awsServerlessExpress from "aws-serverless-express";
import * as bodyParser from "body-parser";
import config from "./config/envConfig";
import authRoutes from "./routes/AuthRoutes";

import "./db/connection";
import userRoute from "./routes/UserRoute";

const app = express();
const envConfig = config();

app.use(cors({
  origin: "https://main.dmvg3pklpu0nm.amplifyapp.com",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
}));
const port = envConfig.port;
app.use(bodyParser.json({ limit: "5mb" }));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/user", userRoute);


app.listen(port, () => {
  console.log(`Server is running on ${port}`);
});

const server = awsServerlessExpress.createServer(app);

module.exports.handler = (event: unknown, context: unknown) =>
  awsServerlessExpress.proxy(server, event, context);
