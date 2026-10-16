import mongoose from "mongoose";

const storeSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            trim: true,
            maxlength: 80,
            default: ""
        },
        description: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: ""
        },
        logoUrl: {
            type: String,
            trim: true,
            default: ""
        }
    },
    { _id: false }
);

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 80
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true
        },

        passwordHash: {
            type: String,
            required: true,
            select: false
        },

        role: {
            type: String,
            enum: ["buyer", "seller", "admin"],
            default: "buyer",
            index: true
        },

        status: {
            type: String,
            enum: ["active", "suspended", "banned"],
            default: "active",
            index: true
        },

        suspensionExpiresAt: {
            type: Date,
            default: null
        },

        suspensionReason: {
            type: String,
            trim: true,
            maxlength: 500,
            default: ""
        },

        // Buyer's BeliGo Wallet balance.
        walletBalance: {
            type: Number,
            min: 0,
            default: 0
        },

        // Seller's simulated earnings after platform commission.
        // This is not a bank balance and cannot be withdrawn in this prototype.
        sellerBalance: {
            type: Number,
            min: 0,
            default: 0
        },

        store: {
            type: storeSchema,
            default: () => ({})
        },

        lastLoginAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

userSchema.set("toJSON", {
    transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
    }
});

export default mongoose.models.User || mongoose.model("User", userSchema);