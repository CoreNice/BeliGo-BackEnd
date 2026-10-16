import { Router } from "express";
import {
    getProductReviews,
    createReview,
    deleteMyReview
} from "../controllers/review.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/product/:productId", getProductReviews);
router.post("/", requireAuth, createReview);
router.delete("/:reviewId", requireAuth, deleteMyReview);

export default router;