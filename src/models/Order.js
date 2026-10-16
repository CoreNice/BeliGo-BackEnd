import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
    {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
        title: { type: String, required: true, trim: true, maxlength: 140 },
        mainImage: { type: String, default: "" },
        unitPrice: { type: Number, required: true, min: 0 },
        quantity: { type: Number, required: true, min: 1 },
        variant: { type: String, default: "" },
        lineTotal: { type: Number, required: true, min: 0 }
    },
    { _id: false }
);

const addressSchema = new mongoose.Schema(
    {
        recipient: { type: String, required: true, trim: true, maxlength: 100 },
        phone: { type: String, required: true, trim: true, maxlength: 30 },
        line1: { type: String, required: true, trim: true, maxlength: 200 },
        line2: { type: String, trim: true, maxlength: 200, default: "" },
        city: { type: String, required: true, trim: true, maxlength: 100 },
        province: { type: String, required: true, trim: true, maxlength: 100 },
        postalCode: { type: String, required: true, trim: true, maxlength: 20 },
        country: { type: String, default: "Indonesia", trim: true, maxlength: 80 }
    },
    { _id: false }
);

const orderSchema = new mongoose.Schema(
    {
        orderNumber: { type: String, required: true, unique: true, index: true },
        buyer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        items: { type: [orderItemSchema], required: true },
        shippingAddress: { type: addressSchema, required: true },
        subtotal: { type: Number, required: true, min: 0 },
        shippingFee: { type: Number, required: true, min: 0, default: 0 },
        commissionRate: { type: Number, required: true, default: 0.1 },
        commissionAmount: { type: Number, required: true, min: 0 },
        sellerNetAmount: { type: Number, required: true, min: 0 },
        total: { type: Number, required: true, min: 0 },
        paymentMethod: {
            type: String,
            enum: ["COD", "CARD", "WALLET"],
            required: true
        },
        paymentStatus: {
            type: String,
            enum: ["pending", "paid", "failed", "refunded"],
            default: "pending",
            index: true
        },
        orderStatus: {
            type: String,
            enum: ["confirmed", "processing", "shipped", "delivered", "cancelled"],
            default: "confirmed",
            index: true
        },
        paymentReference: { type: String, default: "" },
        paidAt: { type: Date, default: null },
        deliveredAt: { type: Date, default: null }
    },
    { timestamps: true }
);

orderSchema.index({ buyer: 1, createdAt: -1 });
orderSchema.index({ seller: 1, createdAt: -1 });

export default mongoose.models.Order || mongoose.model("Order", orderSchema);