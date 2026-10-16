import mongoose from "mongoose";

const cartItemSchema = new mongoose.Schema(
    {
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        quantity: { type: Number, min: 1, max: 99, required: true },
        variant: { type: String, trim: true, maxlength: 100, default: "" }
    },
    { _id: true }
);

const cartSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
            index: true
        },
        items: { type: [cartItemSchema], default: [] }
    },
    { timestamps: true }
);

export default mongoose.models.Cart || mongoose.model("Cart", cartSchema);