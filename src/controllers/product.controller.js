import { z } from "zod";
import Product from "../models/Product.js";
import { AppError } from "../middleware/errorHandler.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const imageUrl = z.string().trim().url().max(2048);

const productSchema = z.object({
    title: z.string().trim().min(3).max(140),
    description: z.string().trim().min(10).max(5000),
    category: z.string().trim().min(2).max(60),
    brand: z.string().trim().max(80).optional().default(""),
    mainImage: imageUrl,
    gallery: z.array(imageUrl).min(1).max(10),
    price: z.number().positive().max(1_000_000_000),
    compareAtPrice: z.number().positive().max(1_000_000_000).nullable().optional(),
    stock: z.number().int().min(0).max(1_000_000),
    variants: z.array(
        z.object({
            name: z.string().trim().min(1).max(60),
            options: z.array(z.string().trim().min(1).max(60)).max(50).default([])
        })
    ).max(20).optional().default([]),
    status: z.enum(["draft", "published"]).optional().default("published")
});

function validatePricePair(data) {
    if (data.compareAtPrice != null && data.compareAtPrice <= data.price) {
        throw new AppError("Compare-at price must be higher than the selling price.", 400);
    }
}

export const listProducts = asyncHandler(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page || "1", 10));
    const limit = Math.min(48, Math.max(1, Number.parseInt(req.query.limit || "12", 10)));
    const filter = { status: "published" };

    if (req.query.category) filter.category = String(req.query.category);
    if (req.query.seller) filter.seller = String(req.query.seller);

    const minPrice = req.query.minPrice == null ? null : Number(req.query.minPrice);
    const maxPrice = req.query.maxPrice == null ? null : Number(req.query.maxPrice);

    if (minPrice !== null || maxPrice !== null) {
        filter.price = {};
        if (Number.isFinite(minPrice)) filter.price.$gte = minPrice;
        if (Number.isFinite(maxPrice)) filter.price.$lte = maxPrice;
    }

    const q = String(req.query.q || "").trim();
    if (q) {
        filter.$text = { $search: q };
    }

    const sortOptions = {
        newest: { createdAt: -1 },
        price_low: { price: 1 },
        price_high: { price: -1 },
        popular: { views: -1 },
        rating: { ratingAverage: -1, ratingCount: -1 }
    };
    const sort = sortOptions[String(req.query.sort || "newest")] || sortOptions.newest;

    const [products, total] = await Promise.all([
        Product.find(filter)
            .populate("seller", "name store.name store.logoUrl")
            .sort(sort)
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

export const getProduct = asyncHandler(async (req, res) => {
    const product = await Product.findOneAndUpdate(
        { _id: req.params.productId, status: "published" },
        { $inc: { views: 1 } },
        { new: true }
    ).populate("seller", "name store.name store.logoUrl");

    if (!product) throw new AppError("Product not found.", 404);
    return res.json({ success: true, product });
});

export const getMyProducts = asyncHandler(async (req, res) => {
    const products = await Product.find({ seller: req.user._id })
        .sort({ createdAt: -1 })
        .lean();
    return res.json({ success: true, products });
});

export const createProduct = asyncHandler(async (req, res) => {
    const input = productSchema.parse(req.body);
    validatePricePair(input);

    const product = await Product.create({
        ...input,
        seller: req.user._id,
        status: input.status || "published"
    });

    return res.status(201).json({ success: true, product });
});

export const updateProduct = asyncHandler(async (req, res) => {
    const input = productSchema.partial().parse(req.body);
    const product = await Product.findOne({
        _id: req.params.productId,
        seller: req.user._id
    });

    if (!product) throw new AppError("Product not found or you do not own it.", 404);

    const combined = {
        price: input.price ?? product.price,
        compareAtPrice:
            input.compareAtPrice !== undefined ? input.compareAtPrice : product.compareAtPrice
    };
    validatePricePair(combined);

    Object.assign(product, input);
    await product.save();

    return res.json({ success: true, product });
});

export const archiveProduct = asyncHandler(async (req, res) => {
    const product = await Product.findOne({
        _id: req.params.productId,
        seller: req.user._id
    });

    if (!product) throw new AppError("Product not found or you do not own it.", 404);

    product.status = "archived";
    await product.save();

    return res.json({ success: true, message: "Product archived.", product });
});