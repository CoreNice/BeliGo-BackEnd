export class AppError extends Error {
    constructor(message, statusCode = 400, details = undefined) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
        this.details = details;
    }
}

export function notFound(req, res, next) {
    next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

export function errorHandler(err, req, res, next) {
    if (res.headersSent) {
        return next(err);
    }

    let statusCode = err.statusCode || 500;
    let message = err.message || "Internal server error.";
    let details = err.details;

    if (err.name === "ValidationError") {
        statusCode = 400;
        message = "Validation failed.";
        details = Object.values(err.errors).map((item) => item.message);
    } else if (err.code === 11000) {
        statusCode = 409;
        message = "A record with this value already exists.";
    } else if (err.name === "CastError") {
        statusCode = 400;
        message = "Invalid identifier or data format.";
    } else if (err.name === "ZodError") {
        statusCode = 400;
        details = err.issues?.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message
        }));
        message = "Validation failed.";
    } else if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
        statusCode = 401;
        message = "Your session is invalid or has expired. Please sign in again.";
    }

    if (process.env.NODE_ENV !== "production") {
        console.error(err);
    }

    return res.status(statusCode).json({
        success: false,
        message,
        ...(details ? { details } : {}),
        ...(process.env.NODE_ENV !== "production" ? { stack: err.stack } : {})
    });
}