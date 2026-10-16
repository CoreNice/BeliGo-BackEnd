import { z } from "zod";
import Review from "../models/Review.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import { AppError } from "../middleware/errorHandler.js";
import { asyncHandler } from "../utils/asyncHandler.js";

async function refreshProductRating(productId) {
    const result = await Review.aggregate([
        { $match: { product: productId } },
        {
            $group: {
                _id: "$product",
                average: { $avg: "$rating" },
                count: { $sum: 1 }
            }
        }
    ]);

    await Product.updateOne(
        { _id: productId },
        {
            $set: {
                ratingAverage: result[0] ? Math.round(result[0].average * 10) / 10 : 0,
                ratingCount: result[0]?.count || 0
            }
        }
    );
}

export const getProductReviews = asyncHandler(async (req, res) => {
    const reviews = await Review.find({ product: req.params.productId })
        .populate("user", "name")
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

    return res.json({ success: true, reviews });
});

export const createReview = asyncHandler(async (req, res) => {
    const input = z.object({
        productId: z.string().min(1),
        orderId: z.string().min(1),
        rating: z.number().int().min(1).max(5),
        comment: z.string().trim().max(1500).optional().default("")
    }).parse(req.body);

    const product = await Product.findById(input.productId);
    if (!product) throw new AppError("Product not found.", 404);

    const order = await Order.findOne({
        _id: input.orderId,
        buyer: req.user._id,
        orderStatus: "delivered"
    });

    if (!order) {
        throw new AppError("A delivered order is required to review a product.", 403);
    }

    const hasProduct = order.items.some(
        (item) => String(item.product) === String(product._id)
    );
    if (!hasProduct) {
        throw new AppError("This product is not part of the selected order.", 400);
    }

    const review = await Review.create({
        product: product._id,
        user: req.user._id,
        order: order._id,
        rating: input.rating,
        comment: input.comment
    });

    await refreshProductRating(product._id);

    return res.status(201).json({ success: true, review });
});

export const deleteMyReview = asyncHandler(async (req, res) => {
    const review = await Review.findOneAndDelete({
        _id: req.params.reviewId,
        user: req.user._id
    });

    if (!review) throw new AppError("Review not found.", 404);
    await refreshProductRating(review.product);

    return res.json({ success: true, message: "Review deleted." });
});