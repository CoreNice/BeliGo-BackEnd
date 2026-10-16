import mongoose from "mongoose";
import { z } from "zod";
import User from "../models/User.js";
import WalletTransaction from "../models/WalletTransaction.js";
import { AppError } from "../middleware/errorHandler.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const cardSchema = z.object({
    cardNumber: z.string().trim().min(1).max(80),
    cardName: z.string().trim().min(1).max(120),
    expiry: z.string().trim().min(1).max(30),
    cvv: z.string().trim().min(1).max(30)
});

export const getWallet = asyncHandler(async (req, res) => {
    return res.json({
        success: true,
        balance: req.user.walletBalance,
        currency: "IDR"
    });
});

export const getTransactions = asyncHandler(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit || "20", 10)));
    const [transactions, total] = await Promise.all([
        WalletTransaction.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        WalletTransaction.countDocuments({ user: req.user._id })
    ]);

    return res.json({
        success: true,
        transactions,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
});

export const topUpWallet = asyncHandler(async (req, res) => {
    const schema = z.object({
        amount: z.number().int().min(10000).max(5000000),
        cardDetails: cardSchema
    });
    const { amount } = schema.parse(req.body);

    schema.parse(req.body);

    const session = await mongoose.startSession();
    let result;

    try {
        await session.withTransaction(async () => {
            const user = await User.findByIdAndUpdate(
                req.user._id,
                { $inc: { walletBalance: amount } },
                { new: true, session, runValidators: true }
            );

            if (!user) throw new AppError("Account not found.", 404);

            const [transaction] = await WalletTransaction.create(
                [{
                    user: user._id,
                    type: "topup",
                    amount,
                    balanceAfter: user.walletBalance,
                    description: "BeliGo Wallet top-up",
                    reference: `TOP-${new mongoose.Types.ObjectId().toString()}`
                }],
                { session }
            );

            result = {
                balance: user.walletBalance,
                transaction: {
                    id: transaction._id,
                    type: transaction.type,
                    amount: transaction.amount,
                    balanceAfter: transaction.balanceAfter,
                    createdAt: transaction.createdAt
                }
            };
        });
    } finally {
        await session.endSession();
    }

    return res.json({
        success: true,
        message: "Top-up completed successfully",
        ...result
    });
});

// Wallet purchases should normally be paid inside POST /api/orders/checkout,
// where inventory, order creation, balance debit and ledger writes are atomic.
export const payWithWallet = asyncHandler(async (req, res) => {
    const { orderId } = z.object({ orderId: z.string().min(1) }).parse(req.body);
    const { default: Order } = await import("../models/Order.js");

    const order = await Order.findOne({
        _id: orderId,
        buyer: req.user._id,
        paymentMethod: "WALLET",
        paymentStatus: "pending"
    });

    if (!order) {
        throw new AppError("A pending wallet order was not found. Wallet checkout is completed during order creation.", 404);
    }

    const session = await mongoose.startSession();
    let newBalance;

    try {
        await session.withTransaction(async () => {
            const currentOrder = await Order.findOne({
                _id: order._id,
                paymentStatus: "pending"
            }).session(session);

            if (!currentOrder) throw new AppError("This order has already been paid or cancelled.", 409);

            const user = await User.findOneAndUpdate(
                { _id: req.user._id, walletBalance: { $gte: currentOrder.total } },
                { $inc: { walletBalance: -currentOrder.total } },
                { new: true, session }
            );

            if (!user) throw new AppError("Insufficient BeliGo Wallet balance.", 400);

            currentOrder.paymentStatus = "paid";
            currentOrder.paidAt = new Date();
            currentOrder.paymentReference = `WAL-${new mongoose.Types.ObjectId().toString()}`;
            await currentOrder.save({ session });

            await WalletTransaction.create(
                [{
                    user: user._id,
                    type: "purchase",
                    amount: currentOrder.total,
                    balanceAfter: user.walletBalance,
                    description: `Payment for ${currentOrder.orderNumber}`,
                    reference: currentOrder.orderNumber
                }],
                { session }
            );

            newBalance = user.walletBalance;
        });
    } finally {
        await session.endSession();
    }

    return res.json({ success: true, balance: newBalance, message: "Wallet payment completed." });
});