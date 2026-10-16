import mongoose from "mongoose";

const favoriteSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
            index: true
        },
        products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }]
    },
    { timestamps: true }
);

export default mongoose.models.Favorite ||
    mongoose.model("Favorite", favoriteSchema);