import { Router } from "express";
import {
    checkout,
    getMyOrders,
    getOrderById,
    cancelMyOrder,
    createReport
} from "../controllers/order.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.post("/checkout", checkout);
router.get("/my", getMyOrders);
router.post("/reports", createReport);
router.get("/:orderId", getOrderById);
router.post("/:orderId/cancel", cancelMyOrder);

export default router;