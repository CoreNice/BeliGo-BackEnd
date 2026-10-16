import mongoose from "mongoose";

export default async function connectDB() {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        throw new Error("MONGODB_URI is not configured.");
    }

    mongoose.set("strictQuery", true);

    await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 15000,
        maxPoolSize: 10
    });

    console.log(`MongoDB connected: ${mongoose.connection.name}`);
}