import { z } from "zod";
import Favorite from "../models/Favorite.js";
import Product from "../models/Product.js";
import { AppError } from "../middleware/errorHandler.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getFavorites = asyncHandler(async (req, res) => {
    const favorite = await Favorite.findOne({ user: req.user._id }).populate({
        path: "products",
        match: { status: "published" },
        select: "title mainImage price compareAtPrice stock seller category ratingAverage ratingCount"
    });

    return res.json({
        success: true,
        products: (favorite?.products || []).filter(Boolean)
    });
});

export const addFavorite = asyncHandler(async (req, res) => {
    const { productId } = z.object({ productId: z.string().min(1) }).parse(req.body);
    const product = await Product.findById(productId);

    if (!product || product.status !== "published") {
        throw new AppError("This product is no longer available.", 404);
    }

    await Favorite.findOneAndUpdate(
        { user: req.user._id },
        { $addToSet: { products: product._id } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json({ success: true, message: "Added to favorites." });
});

export const removeFavorite = asyncHandler(async (req, res) => {
    const { productId } = req.params;
    await Favorite.updateOne(
        { user: req.user._id },
        { $pull: { products: productId } }
    );

    return res.json({ success: true, message: "Removed from favorites." });
});

export const toggleFavorite = asyncHandler(async (req, res) => {
    const { productId } = z.object({ productId: z.string().min(1) }).parse(req.body);
    const product = await Product.findById(productId);

    if (!product || product.status !== "published") {
        throw new AppError("This product is no longer available.", 404);
    }

    let favorite = await Favorite.findOne({ user: req.user._id });
    if (!favorite) favorite = await Favorite.create({ user: req.user._id, products: [] });

    const exists = favorite.products.some((id) => String(id) === String(product._id));
    if (exists) favorite.products.pull(product._id);
    else favorite.products.addToSet(product._id);
    await favorite.save();

    return res.json({ success: true, favorited: !exists });
});