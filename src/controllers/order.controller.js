import mongoose from "mongoose";
import { z } from "zod";

import Cart from "../models/Cart.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import WalletTransaction from "../models/WalletTransaction.js";
import Report from "../models/Report.js";

import { AppError } from "../middleware/errorHandler.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const COMMISSION_RATE = 0.1;

const money = (value) =>
    Math.round((value + Number.EPSILON) * 100) / 100;

const cardSchema = z.object({
    cardNumber: z.string().trim().min(1).max(80),
    cardName: z.string().trim().min(1).max(120),
    expiry: z.string().trim().min(1).max(30),
    cvv: z.string().trim().min(1).max(30)
});

const checkoutSchema = z.object({
    paymentMethod: z.enum(["COD", "CARD", "WALLET"]),

    shippingAddress: z.object({
        recipient: z.string().trim().min(2).max(100),
        phone: z.string().trim().min(3).max(30),
        line1: z.string().trim().min(3).max(200),
        line2: z.string().trim().max(200).optional().default(""),
        city: z.string().trim().min(2).max(100),
        province: z.string().trim().min(2).max(100),
        postalCode: z.string().trim().min(2).max(20),
        country: z.string().trim().min(2).max(80).default("Indonesia")
    }),

    cardDetails: cardSchema.optional()
});

function makeOrderNumber() {
    return `BG-${Date.now()}-${new mongoose.Types.ObjectId()
        .toString()
        .slice(-6)
        .toUpperCase()}`;
}

export const checkout = asyncHandler(async (req, res) => {
    const input = checkoutSchema.parse(req.body);

    if (input.paymentMethod === "CARD" && !input.cardDetails) {
        throw new AppError(
            "Complete the card form to continue.",
            400
        );
    }

    // Card details are intentionally not copied into an order or transaction.
    const session = await mongoose.startSession();

    let createdOrders = [];
    let finalBalance = null;
    let walletBalanceBefore = null;

    try {
        await session.withTransaction(async () => {
            // Reset callback outputs in case the transaction callback is retried.
            createdOrders = [];
            finalBalance = null;
            walletBalanceBefore = null;

            const cart = await Cart.findOne({
                user: req.user._id
            }).session(session);

            if (!cart || cart.items.length === 0) {
                throw new AppError("Your cart is empty.", 400);
            }

            const expanded = [];

            // Recheck each product and quantity inside the transaction.
            for (const cartItem of cart.items) {
                const product = await Product.findOne({
                    _id: cartItem.product,
                    status: "published"
                }).session(session);

                if (!product) {
                    throw new AppError(
                        "A product in your cart is no longer available.",
                        400
                    );
                }

                if (String(product.seller) === String(req.user._id)) {
                    throw new AppError(
                        "You cannot purchase your own product.",
                        400
                    );
                }

                if (cartItem.quantity > product.stock) {
                    throw new AppError(
                        `Insufficient stock for "${product.title}".`,
                        400
                    );
                }

                expanded.push({
                    cartItem,
                    product
                });
            }

            // Split a multi-seller cart into one order per seller.
            const sellerGroups = new Map();

            for (const entry of expanded) {
                const sellerId = String(entry.product.seller);

                if (!sellerGroups.has(sellerId)) {
                    sellerGroups.set(sellerId, []);
                }

                sellerGroups.get(sellerId).push(entry);
            }

            const preparedOrders = [];
            let grandTotal = 0;

            for (const [sellerId, entries] of sellerGroups.entries()) {
                const items = entries.map(({ cartItem, product }) => {
                    const lineTotal = money(
                        product.price * cartItem.quantity
                    );

                    return {
                        product: product._id,
                        title: product.title,
                        mainImage: product.mainImage,
                        unitPrice: product.price,
                        quantity: cartItem.quantity,
                        variant: cartItem.variant || "",
                        lineTotal
                    };
                });

                const subtotal = money(
                    items.reduce((sum, item) => sum + item.lineTotal, 0)
                );

                // Shipping is currently free in this prototype.
                const shippingFee = 0;

                const commissionAmount = money(
                    subtotal * COMMISSION_RATE
                );

                const sellerNetAmount = money(
                    subtotal - commissionAmount
                );

                const total = money(subtotal + shippingFee);

                grandTotal = money(grandTotal + total);

                preparedOrders.push({
                    sellerId,
                    items,
                    subtotal,
                    shippingFee,
                    commissionAmount,
                    sellerNetAmount,
                    total
                });
            }

            // Record the balance before Wallet checkout and debit once for the
            // complete cart. Ledger rows below use a running balance per order.
            if (input.paymentMethod === "WALLET") {
                const buyerBeforeDebit = await User.findById(
                    req.user._id
                ).session(session);

                if (!buyerBeforeDebit) {
                    throw new AppError("Account not found.", 404);
                }

                walletBalanceBefore = buyerBeforeDebit.walletBalance;

                const account = await User.findOneAndUpdate(
                    {
                        _id: req.user._id,
                        walletBalance: { $gte: grandTotal }
                    },
                    {
                        $inc: {
                            walletBalance: -grandTotal
                        }
                    },
                    {
                        new: true,
                        session,
                        runValidators: true
                    }
                );

                if (!account) {
                    throw new AppError(
                        "Insufficient BeliGo Wallet balance.",
                        400
                    );
                }

                finalBalance = account.walletBalance;
            }

            // Conditionally decrement stock to guard against concurrent purchases.
            for (const entry of expanded) {
                const updatedProduct = await Product.findOneAndUpdate(
                    {
                        _id: entry.product._id,
                        status: "published",
                        stock: { $gte: entry.cartItem.quantity }
                    },
                    {
                        $inc: {
                            stock: -entry.cartItem.quantity
                        }
                    },
                    {
                        new: true,
                        session,
                        runValidators: true
                    }
                );

                if (!updatedProduct) {
                    throw new AppError(
                        `Stock changed for "${entry.product.title}". Please retry checkout.`,
                        409
                    );
                }
            }

            const paymentIsPaid = input.paymentMethod !== "COD";

            const paymentReference = paymentIsPaid
                ? `${input.paymentMethod}-${new mongoose.Types.ObjectId()
                    .toString()}`
                : "";

            // Store immutable item, address, and price snapshots for every seller.
            createdOrders = await Order.create(
                preparedOrders.map((group) => ({
                    orderNumber: makeOrderNumber(),
                    buyer: req.user._id,
                    seller: group.sellerId,
                    items: group.items,
                    shippingAddress: input.shippingAddress,
                    subtotal: group.subtotal,
                    shippingFee: group.shippingFee,
                    commissionRate: COMMISSION_RATE,
                    commissionAmount: group.commissionAmount,
                    sellerNetAmount: group.sellerNetAmount,
                    total: group.total,
                    paymentMethod: input.paymentMethod,
                    paymentStatus: paymentIsPaid ? "paid" : "pending",
                    orderStatus: "confirmed",
                    paymentReference,
                    paidAt: paymentIsPaid ? new Date() : null
                })),
                { session }
            );

            // PART 10: credit earnings only for paid Card and Wallet orders.
            // COD earnings are deliberately credited later when the seller
            // marks the shipped order as delivered.
            if (input.paymentMethod !== "COD") {
                for (const order of createdOrders) {
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
                            "Seller account was not found during settlement.",
                            409
                        );
                    }
                }
            }

            // PART 10: record the Wallet balance after each seller-level order.
            // The actual buyer balance above was debited only once for grandTotal.
            if (input.paymentMethod === "WALLET") {
                let runningBalance = walletBalanceBefore;

                for (const order of createdOrders) {
                    runningBalance = money(
                        runningBalance - order.total
                    );

                    await WalletTransaction.create(
                        [
                            {
                                user: req.user._id,
                                type: "purchase",
                                amount: order.total,
                                balanceAfter: runningBalance,
                                description: `Payment for ${order.orderNumber}`,
                                reference: order.orderNumber
                            }
                        ],
                        { session }
                    );
                }
            }

            // Cart is cleared only when order creation and settlement succeed.
            await Cart.updateOne(
                {
                    user: req.user._id
                },
                {
                    $set: {
                        items: []
                    }
                },
                {
                    session
                }
            );
        });
    } finally {
        await session.endSession();
    }

    const message =
        input.paymentMethod === "CARD"
            ? "Card payment approved."
            : input.paymentMethod === "WALLET"
                ? "Order placed and BeliGo Wallet debited."
                : "Order placed. Payment is due when the delivery arrives.";

    return res.status(201).json({
        success: true,
        message,
        orders: createdOrders,
        walletBalance: finalBalance
    });
});

export const getMyOrders = asyncHandler(async (req, res) => {
    const orders = await Order.find({
        buyer: req.user._id
    })
        .populate("seller", "name store.name")
        .sort({ createdAt: -1 })
        .lean();

    return res.json({
        success: true,
        orders
    });
});

export const getOrderById = asyncHandler(async (req, res) => {
    const order = await Order.findOne({
        _id: req.params.orderId,
        buyer: req.user._id
    })
        .populate("seller", "name store.name")
        .populate("items.product", "title mainImage");

    if (!order) {
        throw new AppError("Order not found.", 404);
    }

    return res.json({
        success: true,
        order
    });
});

export const cancelMyOrder = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();

    let cancelledOrder;

    try {
        await session.withTransaction(async () => {
            const order = await Order.findOne({
                _id: req.params.orderId,
                buyer: req.user._id
            }).session(session);

            if (!order) {
                throw new AppError("Order not found.", 404);
            }

            if (
                ["shipped", "delivered", "cancelled"].includes(
                    order.orderStatus
                )
            ) {
                throw new AppError(
                    "This order can no longer be cancelled.",
                    400
                );
            }

            // Restore the inventory reserved for this order.
            for (const item of order.items) {
                if (item.product) {
                    await Product.updateOne(
                        {
                            _id: item.product
                        },
                        {
                            $inc: {
                                stock: item.quantity
                            }
                        },
                        {
                            session
                        }
                    );
                }
            }

            const orderWasPaid = order.paymentStatus === "paid";

            // PART 10: reverse the simulated seller earnings for paid orders.
            // This is part of the same transaction as the order cancellation.
            if (orderWasPaid) {
                const debit = await User.updateOne(
                    {
                        _id: order.seller,
                        sellerBalance: {
                            $gte: order.sellerNetAmount
                        }
                    },
                    {
                        $inc: {
                            sellerBalance: -order.sellerNetAmount
                        }
                    },
                    {
                        session
                    }
                );

                if (debit.modifiedCount !== 1) {
                    throw new AppError(
                        "Unable to reverse seller earnings; contact marketplace administration.",
                        409
                    );
                }
            }

            if (
                orderWasPaid &&
                order.paymentMethod === "WALLET"
            ) {
                // Refund the buyer's Wallet balance in the same transaction.
                const buyer = await User.findByIdAndUpdate(
                    req.user._id,
                    {
                        $inc: {
                            walletBalance: order.total
                        }
                    },
                    {
                        new: true,
                        session,
                        runValidators: true
                    }
                );

                if (!buyer) {
                    throw new AppError("Buyer account not found.", 404);
                }

                await WalletTransaction.create(
                    [
                        {
                            user: req.user._id,
                            type: "refund",
                            amount: order.total,
                            balanceAfter: buyer.walletBalance,
                            description: `Refund for cancelled order ${order.orderNumber}`,
                            reference: order.orderNumber
                        }
                    ],
                    { session }
                );

                order.paymentStatus = "refunded";
            } else if (
                orderWasPaid &&
                order.paymentMethod === "CARD"
            ) {
                // Only a demo: card has no external provider. The refund is simulated only.
                order.paymentStatus = "refunded";
            } else {
                // The cancelled COD order was never paid.
                order.paymentStatus = "failed";
            }

            order.orderStatus = "cancelled";

            await order.save({ session });

            cancelledOrder = order;
        });
    } finally {
        await session.endSession();
    }

    return res.json({
        success: true,
        message: "Order cancelled.",
        order: cancelledOrder
    });
});

export const createReport = asyncHandler(async (req, res) => {
    const input = z.object({
        targetType: z.enum(["product", "user", "order"]),
        targetId: z.string().min(1),
        reason: z.string().trim().min(3).max(120),
        details: z.string().trim().max(2000).optional().default("")
    }).parse(req.body);

    if (!mongoose.isValidObjectId(input.targetId)) {
        throw new AppError("Invalid report target ID.", 400);
    }

    const report = await Report.create({
        reporter: req.user._id,
        ...input,
        targetId: new mongoose.Types.ObjectId(input.targetId)
    });

    return res.status(201).json({
        success: true,
        report
    });
});