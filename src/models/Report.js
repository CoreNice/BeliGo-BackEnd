import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
    {
        reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        targetType: { type: String, enum: ["product", "user", "order"], required: true },
        targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
        reason: { type: String, required: true, trim: true, maxlength: 120 },
        details: { type: String, trim: true, maxlength: 2000, default: "" },
        status: {
            type: String,
            enum: ["open", "in_review", "resolved", "dismissed"],
            default: "open",
            index: true
        },
        adminNote: { type: String, trim: true, maxlength: 2000, default: "" },
        handledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        handledAt: { type: Date, default: null }
    },
    { timestamps: true }
);

reportSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.Report || mongoose.model("Report", reportSchema);