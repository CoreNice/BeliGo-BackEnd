import mongoose from "mongoose";
import { z } from "zod";

import Product from "../models/Product.js";
import Order from "../models/Order.js";
import User from "../models/User.js";

import { AppError } from "../middleware/errorHandler.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getSellerDashboard = asyncHandler(async (req, res) => {
    const sellerId = req.user._id;

    const [
        productCount,
        publishedProducts,
        stockResult,
        orderCount,
        paidResult,
        recentOrders
    ] = await Promise.all([
        Product.countDocuments({
            seller: sellerId
        }),

        Product.countDocuments({
            seller: sellerId,
            status: "published"
        }),

        Product.aggregate([
            {
                $match: {
                    seller: sellerId
                }
            },
            {
                $group: {
                    _id: null,
                    totalUnits: {
                        $sum: "$stock"
                    }
                }
            }
        ]),

        Order.countDocuments({
            seller: sellerId
        }),

        Order.aggregate([
            {
                $match: {
                    seller: sellerId,
                    paymentStatus: "paid",
                    orderStatus: { $ne: "cancelled" }
                }
            },
            {
                $group: {
                    _id: null,
                    sales: {
                        $sum: "$subtotal"
                    },
                    commission: {
                        $sum: "$commissionAmount"
                    },
                    net: {
                        $sum: "$sellerNetAmount"
                    }
                }
            }
        ]),

        Order.find({
            seller: sellerId
        })
            .populate("buyer", "name email")
            .sort({ createdAt: -1 })
            .limit(8)
            .lean()
    ]);

    return res.json({
        success: true,

        stats: {
            productCount,
            publishedProducts,
            inventoryUnits: stockResult[0]?.totalUnits || 0,
            orderCount,

            paidSales: paidResult[0]?.sales || 0,
            platformCommission: paidResult[0]?.commission || 0,
            sellerNetSales: paidResult[0]?.net || 0,

            // PART 10: expose current simulated earnings balance.
            availableEarnings: req.user.sellerBalance || 0
        },

        recentOrders
    });
});

export const getSellerOrders = asyncHandler(async (req, res) => {
    const filter = {
        seller: req.user._id
    };

    if (req.query.status) {
        filter.orderStatus = String(req.query.status);
    }

    if (req.query.paymentStatus) {
        filter.paymentStatus = String(req.query.paymentStatus);
    }

    const orders = await Order.find(filter)
        .populate("buyer", "name email")
        .sort({ createdAt: -1 })
        .lean();

    return res.json({
        success: true,
        orders
    });
});

export const updateSellerOrderStatus = asyncHandler(async (req, res) => {
    const { orderStatus } = z.object({
        orderStatus: z.enum([
            "processing",
            "shipped",
            "delivered"
        ])
    }).parse(req.body);

    const session = await mongoose.startSession();

    let updatedOrder;

    try {
        await session.withTransaction(async () => {
            const order = await Order.findOne({
                _id: req.params.orderId,
                seller: req.user._id
            }).session(session);

            if (!order) {
                throw new AppError("Order not found.", 404);
            }

            if (order.orderStatus === "cancelled") {
                throw new AppError(
                    "Cancelled orders cannot be updated.",
                    400
                );
            }

            const allowedTransitions = {
                confirmed: ["processing"],
                processing: ["shipped"],
                shipped: ["delivered"],
                delivered: []
            };

            if (
                !allowedTransitions[order.orderStatus]?.includes(
                    orderStatus
                )
            ) {
                throw new AppError(
                    `Cannot change an order from ${order.orderStatus} to ${orderStatus}.`,
                    400
                );
            }

            // Collect COD payment only when an unpaid order is delivered.
            const collectCod =
                orderStatus === "delivered" &&
                order.paymentMethod === "COD" &&
                order.paymentStatus === "pending";

            order.orderStatus = orderStatus;

            if (orderStatus === "delivered") {
                order.deliveredAt = new Date();
            }

            if (collectCod) {
                order.paymentStatus = "paid";
                order.paidAt = new Date();
                order.paymentReference =
                    `COD-COLLECTED-${order.orderNumber}`;
            }

            await order.save({ session });

            // PART 10: settle seller earnings in the same transaction.
            if (collectCod) {
                const credit = await User.updateOne(
                    {
                        _id: order.seller
                    },
                    {
                        $inc: {
                            sellerBalance: order.sellerNetAmount
                        }
                    },
                    {
                        session
                    }
                );

                if (credit.matchedCount !== 1) {
                    throw new AppError(
                        "Seller account was not found during COD settlement.",
                        409
                    );
                }
            }

            updatedOrder = order;
        });
    } finally {
        await session.endSession();
    }

    return res.json({
        success: true,
        message: `Order marked as ${orderStatus}.`,
        order: updatedOrder
    });
});

export const updateStoreProfile = asyncHandler(async (req, res) => {
    const input = z.object({
        storeName: z.string().trim().min(2).max(80),

        storeDescription: z.string()
            .trim()
            .max(1000)
            .optional()
            .default(""),

        logoUrl: z.string()
            .trim()
            .url()
            .max(2048)
            .or(z.literal(""))
            .optional()
            .default("")
    }).parse(req.body);

    req.user.store = {
        name: input.storeName,
        description: input.storeDescription,
        logoUrl: input.logoUrl
    };

    await req.user.save();

    return res.json({
        success: true,
        message: "Store profile updated.",
        user: req.user.toJSON()
    });
});