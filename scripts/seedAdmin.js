import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import User from "../src/models/User.js";

async function seedAdmin() {
    const name = process.env.ADMIN_NAME;
    const email = process.env.ADMIN_EMAIL?.toLowerCase();
    const password = process.env.ADMIN_PASSWORD;

    if (!name || !email || !password || password.length < 12) {
        throw new Error("Set ADMIN_NAME, ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters.");
    }

    await connectDB();

    const existing = await User.findOne({ email });

    if (existing) {
        if (existing.role !== "admin") {
            throw new Error("That email already belongs to a non-admin account. Choose a separate admin email.");
        }

        console.log(`Administrator already exists: ${email}`);
        return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await User.create({
        name,
        email,
        passwordHash,
        role: "admin",
        status: "active"
    });

    console.log(`Administrator created: ${email}`);
}

seedAdmin()
    .catch((error) => {
        console.error("Admin seed failed:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });