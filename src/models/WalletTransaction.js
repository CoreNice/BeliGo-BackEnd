import mongoose from "mongoose";

const walletTransactionSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        type: {
            type: String,
            enum: ["topup", "purchase", "refund", "adjustment"],
            required: true
        },
        amount: { type: Number, required: true, min: 0.01 },
        balanceAfter: { type: Number, required: true, min: 0 },
        description: { type: String, trim: true, maxlength: 200, default: "" },
        reference: { type: String, trim: true, maxlength: 100, default: "" },
        status: { type: String, enum: ["completed", "pending", "failed"], default: "completed" }
    },
    { timestamps: true }
);

walletTransactionSchema.index({ user: 1, createdAt: -1 });

export default mongoose.models.WalletTransaction ||
    mongoose.model("WalletTransaction", walletTransactionSchema);