import { z } from "zod";
import Cart from "../models/Cart.js";
import Product from "../models/Product.js";
import { AppError } from "../middleware/errorHandler.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const addSchema = z.object({
    productId: z.string().min(1),
    quantity: z.number().int().min(1).max(99).default(1),
    variant: z.string().trim().max(100).optional().default("")
});

async function populatedCart(userId) {
    const cart = await Cart.findOne({ user: userId }).populate({
        path: "items.product",
        select: "title mainImage price stock status seller brand"
    });

    if (!cart) {
        return { _id: null, items: [], subtotal: 0, itemCount: 0 };
    }

    const items = cart.items
        .filter((item) => item.product && item.product.status === "published")
        .map((item) => ({
            _id: item._id,
            product: item.product,
            quantity: item.quantity,
            variant: item.variant,
            lineTotal: Number((item.product.price * item.quantity).toFixed(2)),
            available: item.product.stock >= item.quantity
        }));

    return {
        _id: cart._id,
        items,
        subtotal: Number(
            items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2)
        ),
        itemCount: items.reduce((sum, item) => sum + item.quantity, 0)
    };
}

export const getCart = asyncHandler(async (req, res) => {
    return res.json({ success: true, cart: await populatedCart(req.user._id) });
});

export const addToCart = asyncHandler(async (req, res) => {
    const input = addSchema.parse(req.body);
    const product = await Product.findById(input.productId);

    if (!product || product.status !== "published") {
        throw new AppError("This product is no longer available.", 404);
    }
    if (String(product.seller) === String(req.user._id)) {
        throw new AppError("You cannot purchase your own product.", 400);
    }
    if (input.quantity > product.stock) {
        throw new AppError("Requested quantity exceeds available stock.", 400);
    }

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) cart = await Cart.create({ user: req.user._id, items: [] });

    const existing = cart.items.find(
        (item) =>
            String(item.product) === String(product._id) &&
            item.variant === input.variant
    );

    if (existing) {
        const nextQuantity = existing.quantity + input.quantity;
        if (nextQuantity > product.stock) {
            throw new AppError("Requested quantity exceeds available stock.", 400);
        }
        existing.quantity = nextQuantity;
    } else {
        cart.items.push({
            product: product._id,
            quantity: input.quantity,
            variant: input.variant
        });
    }

    await cart.save();
    return res.status(201).json({
        success: true,
        message: "Product added to cart.",
        cart: await populatedCart(req.user._id)
    });
});

export const updateCartItem = asyncHandler(async (req, res) => {
    const input = z.object({
        quantity: z.number().int().min(1).max(99)
    }).parse(req.body);

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) throw new AppError("Cart item not found.", 404);

    const item = cart.items.id(req.params.itemId);
    if (!item) throw new AppError("Cart item not found.", 404);

    const product = await Product.findById(item.product);
    if (!product || product.status !== "published") {
        throw new AppError("This product is no longer available.", 404);
    }
    if (input.quantity > product.stock) {
        throw new AppError("Requested quantity exceeds available stock.", 400);
    }

    item.quantity = input.quantity;
    await cart.save();

    return res.json({ success: true, cart: await populatedCart(req.user._id) });
});

export const removeCartItem = asyncHandler(async (req, res) => {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) throw new AppError("Cart item not found.", 404);

    const item = cart.items.id(req.params.itemId);
    if (!item) throw new AppError("Cart item not found.", 404);

    item.deleteOne();
    await cart.save();

    return res.json({ success: true, cart: await populatedCart(req.user._id) });
});

export const clearCart = asyncHandler(async (req, res) => {
    await Cart.updateOne({ user: req.user._id }, { $set: { items: [] } });
    return res.json({
        success: true,
        cart: { _id: null, items: [], subtotal: 0, itemCount: 0 }
    });
});