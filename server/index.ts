import express from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";

const app = express();
const httpServer = createServer(app);

app.use(express.json());
app.use(express.static("public"));

registerRoutes(httpServer, app).then(() => {
  httpServer.listen(3000, () => {
    console.log("Server is listening on port 3000");
  });
});