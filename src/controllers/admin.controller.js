import mongoose from "mongoose";
import { z } from "zod";
import User from "../models/User.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import Report from "../models/Report.js";
import { AppError } from "../middleware/errorHandler.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getAdminDashboard = asyncHandler(async (_req, res) => {
    const [
        totalUsers,
        totalBuyers,
        totalSellers,
        suspendedUsers,
        totalProducts,
        publishedProducts,
        totalOrders,
        paidStats,
        bestProducts,
        bestSellers,
        openReports
    ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: "buyer" }),
        User.countDocuments({ role: "seller" }),
        User.countDocuments({ status: { $in: ["suspended", "banned"] } }),
        Product.countDocuments(),
        Product.countDocuments({ status: "published" }),
        Order.countDocuments(),
        Order.aggregate([
            { $match: { paymentStatus: "paid", orderStatus: { $ne: "cancelled" } } },
            {
                $group: {
                    _id: null,
                    grossSales: { $sum: "$subtotal" },
                    commission: { $sum: "$commissionAmount" },
                    sellerNet: { $sum: "$sellerNetAmount" }
                }
            }
        ]),
        Order.aggregate([
            { $match: { paymentStatus: "paid", orderStatus: { $ne: "cancelled" } } },
            { $unwind: "$items" },
            {
                $group: {
                    _id: "$items.product",
                    title: { $first: "$items.title" },
                    unitsSold: { $sum: "$items.quantity" },
                    sales: { $sum: "$items.lineTotal" }
                }
            },
            { $sort: { unitsSold: -1 } },
            { $limit: 5 }
        ]),
        Order.aggregate([
            { $match: { paymentStatus: "paid", orderStatus: { $ne: "cancelled" } } },
            {
                $group: {
                    _id: "$seller",
                    orders: { $sum: 1 },
                    sales: { $sum: "$subtotal" },
                    net: { $sum: "$sellerNetAmount" }
                }
            },
            { $sort: { sales: -1 } },
            { $limit: 5 },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "seller"
                }
            },
            { $unwind: { path: "$seller", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    orders: 1,
                    sales: 1,
                    net: 1,
                    name: "$seller.name",
                    email: "$seller.email",
                    storeName: "$seller.store.name"
                }
            }
        ]),
        Report.countDocuments({ status: { $in: ["open", "in_review"] } })
    ]);

    return res.json({
        success: true,
        stats: {
            totalUsers,
            totalBuyers,
            totalSellers,
            suspendedUsers,
            totalProducts,
            publishedProducts,
            totalOrders,
            grossPaidSales: paidStats[0]?.grossSales || 0,
            platformCommission: paidStats[0]?.commission || 0,
            sellerNetSales: paidStats[0]?.sellerNet || 0,
            openReports
        },
        bestProducts,
        bestSellers
    });
});

export const listUsers = asyncHandler(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || "25", 10)));
    const filter = {};

    if (["buyer", "seller", "admin"].includes(String(req.query.role))) {
        filter.role = String(req.query.role);
    }
    if (["active", "suspended", "banned"].includes(String(req.query.status))) {
        filter.status = String(req.query.status);
    }
    if (req.query.q) {
        const regexSafeQuery = String(req.query.q).trim().slice(0, 80);
        filter.$or = [
            { name: { $regex: regexSafeQuery, $options: "i" } },
            { email: { $regex: regexSafeQuery, $options: "i" } }
        ];
    }

    const [users, total] = await Promise.all([
        User.find(filter)
            .select("-passwordHash")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        User.countDocuments(filter)
    ]);

    return res.json({
        success: true,
        users,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
});

export const suspendUser = asyncHandler(async (req, res) => {
    const { duration, reason } = z.object({
        duration: z.enum(["30d", "365d", "permanent"]),
        reason: z.string().trim().min(3).max(500)
    }).parse(req.body);

    if (!mongoose.isValidObjectId(req.params.userId)) {
        throw new AppError("Invalid user ID.", 400);
    }

    const user = await User.findById(req.params.userId);
    if (!user) throw new AppError("User not found.", 404);
    if (String(user._id) === String(req.user._id)) {
        throw new AppError("You cannot suspend your own administrator account.", 400);
    }
    if (user.role === "admin") {
        throw new AppError("Administrator accounts cannot be suspended through this endpoint.", 400);
    }

    if (duration === "permanent") {
        user.status = "banned";
        user.suspensionExpiresAt = null;
    } else {
        const days = duration === "30d" ? 30 : 365;
        user.status = "suspended";
        user.suspensionExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    user.suspensionReason = reason;
    await user.save();

    return res.json({
        success: true,
        message: duration === "permanent"
            ? "Account permanently banned."
            : `Account suspended for ${duration === "30d" ? 30 : 365} days.`,
        user: user.toJSON()
    });
});

export const reinstateUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.userId);
    if (!user) throw new AppError("User not found.", 404);
    if (user.role === "admin") {
        throw new AppError("Administrator accounts cannot be changed through this endpoint.", 400);
    }

    user.status = "active";
    user.suspensionExpiresAt = null;
    user.suspensionReason = "";
    await user.save();

    return res.json({
        success: true,
        message: "Account reinstated.",
        user: user.toJSON()
    });
});

export const listAdminProducts = asyncHandler(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || "25", 10)));
    const filter = {};

    if (["draft", "published", "archived", "removed"].includes(String(req.query.status))) {
        filter.status = String(req.query.status);
    }

    const [products, total] = await Promise.all([
        Product.find(filter)
            .populate("seller", "name email store.name")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        Product.countDocuments(filter)
    ]);

    return res.json({
        success: true,
        products,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
});

export const moderateProduct = asyncHandler(async (req, res) => {
    const { status, reason } = z.object({
        status: z.enum(["published", "removed", "archived"]),
        reason: z.string().trim().max(500).optional().default("")
    }).parse(req.body);

    const product = await Product.findById(req.params.productId);
    if (!product) throw new AppError("Product not found.", 404);

    product.status = status;
    await product.save();

    return res.json({
        success: true,
        message: `Product status changed to ${status}.`,
        reason,
        product
    });
});

export const listReports = asyncHandler(async (req, res) => {
    const filter = {};
    if (["open", "in_review", "resolved", "dismissed"].includes(String(req.query.status))) {
        filter.status = String(req.query.status);
    }

    const reports = await Report.find(filter)
        .populate("reporter", "name email")
        .populate("handledBy", "name email")
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();

    return res.json({ success: true, reports });
});

export const resolveReport = asyncHandler(async (req, res) => {
    const { status, adminNote } = z.object({
        status: z.enum(["in_review", "resolved", "dismissed"]),
        adminNote: z.string().trim().max(2000).optional().default("")
    }).parse(req.body);

    const report = await Report.findById(req.params.reportId);
    if (!report) throw new AppError("Report not found.", 404);

    report.status = status;
    report.adminNote = adminNote;
    report.handledBy = req.user._id;
    report.handledAt = new Date();
    await report.save();

    return res.json({ success: true, report });
});

export const listAdminOrders = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.paymentStatus) filter.paymentStatus = String(req.query.paymentStatus);
    if (req.query.orderStatus) filter.orderStatus = String(req.query.orderStatus);

    const orders = await Order.find(filter)
        .populate("buyer", "name email")
        .populate("seller", "name email store.name")
        .sort({ createdAt: -1 })
        .limit(250)
        .lean();

    return res.json({ success: true, orders });
});