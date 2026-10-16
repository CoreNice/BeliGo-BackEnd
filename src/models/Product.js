import mongoose from "mongoose";

const variantSchema = new mongoose.Schema(
    {
        name: { type: String, trim: true, maxlength: 60, required: true },
        options: [{ type: String, trim: true, maxlength: 60 }]
    },
    { _id: false }
);

const productSchema = new mongoose.Schema(
    {
        seller: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        title: { type: String, required: true, trim: true, maxlength: 140 },
        description: { type: String, required: true, trim: true, maxlength: 5000 },
        category: { type: String, required: true, trim: true, maxlength: 60, index: true },
        brand: { type: String, trim: true, maxlength: 80, default: "" },
        mainImage: { type: String, required: true, trim: true },
        gallery: {
            type: [{ type: String, trim: true }],
            validate: {
                validator: (arr) => arr.length >= 1 && arr.length <= 10,
                message: "Gallery must contain between 1 and 10 image URLs."
            }
        },
        price: { type: Number, required: true, min: 0.01 },
        compareAtPrice: { type: Number, min: 0, default: null },
        stock: { type: Number, required: true, min: 0, default: 0 },
        variants: { type: [variantSchema], default: [] },
        status: {
            type: String,
            enum: ["draft", "published", "archived", "removed"],
            default: "published",
            index: true
        },
        ratingAverage: { type: Number, min: 0, max: 5, default: 0 },
        ratingCount: { type: Number, min: 0, default: 0 },
        views: { type: Number, min: 0, default: 0 }
    },
    { timestamps: true }
);

productSchema.index({ title: "text", description: "text", brand: "text" });
productSchema.index({ status: 1, category: 1, createdAt: -1 });

export default mongoose.models.Product || mongoose.model("Product", productSchema);