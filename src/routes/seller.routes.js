import { Router } from "express";
import {
    getSellerDashboard,
    getSellerOrders,
    updateSellerOrderStatus,
    updateStoreProfile
} from "../controllers/seller.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth, requireRole("seller"));
router.get("/dashboard", getSellerDashboard);
router.get("/orders", getSellerOrders);
router.patch("/orders/:orderId/status", updateSellerOrderStatus);
router.patch("/store", updateStoreProfile);

export default router;