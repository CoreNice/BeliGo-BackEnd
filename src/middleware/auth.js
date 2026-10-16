import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { AppError } from "./errorHandler.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const requireAuth = asyncHandler(async (req, res, next) => {
    const header = req.headers.authorization;
    const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
    const token = bearer || req.cookies?.beligo_token;

    if (!token) {
        throw new AppError("Please sign in to continue.", 401);
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);

    if (!user) {
        throw new AppError("Account not found.", 401);
    }

    if (
        user.status === "suspended" &&
        user.suspensionExpiresAt &&
        user.suspensionExpiresAt <= new Date()
    ) {
        user.status = "active";
        user.suspensionExpiresAt = null;
        user.suspensionReason = "";
        await user.save();
    }

    if (user.status !== "active") {
        const message =
            user.status === "banned"
                ? "This account has been permanently banned."
                : "This account is temporarily suspended.";
        throw new AppError(message, 403);
    }

    req.user = user;
    next();
});

export const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) {
        return next(new AppError("Please sign in to continue.", 401));
    }

    if (!roles.includes(req.user.role)) {
        return next(new AppError("You do not have permission to access this resource.", 403));
    }

    next();
};

// Alias for code using the common name "protect".
export const protect = requireAuth;
export const authorize = (...roles) => [requireAuth, requireRole(...roles)];