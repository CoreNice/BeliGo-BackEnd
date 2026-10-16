import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import User from "../models/User.js";
import { AppError } from "../middleware/errorHandler.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const registerSchema = z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(128)
});

const loginSchema = z.object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(128)
});

const tokenFor = (user) =>
    jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d"
    });

const sendAuthResponse = (res, user, status = 200) => {
    const token = tokenFor(user);
    res.cookie("beligo_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/"
    });
    return res.status(status).json({ success: true, token, user: user.toJSON() });
};

export const register = asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const email = input.email.toLowerCase();
    const exists = await User.exists({ email });

    if (exists) {
        throw new AppError("An account with this email already exists.", 409);
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await User.create({
        name: input.name,
        email,
        passwordHash,
        role: "buyer",
        status: "active"
    });

    return sendAuthResponse(res, user, 201);
});

export const login = asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const user = await User.findOne({ email: input.email.toLowerCase() }).select(
        "+passwordHash"
    );

    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
        throw new AppError("Invalid email or password.", 401);
    }

    if (
        user.status === "suspended" &&
        user.suspensionExpiresAt &&
        user.suspensionExpiresAt <= new Date()
    ) {
        user.status = "active";
        user.suspensionExpiresAt = null;
        user.suspensionReason = "";
    }

    if (user.status !== "active") {
        throw new AppError(
            user.status === "banned"
                ? "This account has been permanently banned."
                : "This account is temporarily suspended.",
            403
        );
    }

    user.lastLoginAt = new Date();
    await user.save();

    return sendAuthResponse(res, user);
});

export const getMe = asyncHandler(async (req, res) => {
    return res.json({ success: true, user: req.user.toJSON() });
});

export const logout = asyncHandler(async (_req, res) => {
    res.clearCookie("beligo_token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/"
    });
    return res.json({ success: true, message: "Signed out successfully." });
});

export const becomeSeller = asyncHandler(async (req, res) => {
    if (req.user.role === "admin") {
        throw new AppError("Administrator accounts cannot be converted to seller accounts.", 400);
    }

    const schema = z.object({
        storeName: z.string().trim().min(2).max(80),
        storeDescription: z.string().trim().max(1000).optional().default("")
    });

    const input = schema.parse(req.body);

    req.user.role = "seller";
    req.user.store = {
        name: input.storeName,
        description: input.storeDescription,
        logoUrl: req.user.store?.logoUrl || ""
    };

    await req.user.save();

    return res.json({
        success: true,
        message: "Seller profile created.",
        user: req.user.toJSON()
    });
});