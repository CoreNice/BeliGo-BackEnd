import "dotenv/config";
import http from "node:http";
import app from "./app.js";
import connectDB from "./config/db.js";
import mongoose from "mongoose";

const PORT = Number(process.env.PORT || 4000);

async function start() {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        throw new Error("JWT_SECRET must be set and contain at least 32 characters.");
    }

    await connectDB();

    const server = http.createServer(app);
    server.listen(PORT, () => {
        console.log(`BeliGo API running at http://localhost:${PORT}`);
    });

    const shutdown = (signal) => {
        console.log(`${signal} received. Closing BeliGo API...`);
        server.close(async () => {
            await mongoose.disconnect();
            process.exit(0);
        });

        setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((error) => {
    console.error("Unable to start BeliGo API:", error.message);
    process.exit(1);
});