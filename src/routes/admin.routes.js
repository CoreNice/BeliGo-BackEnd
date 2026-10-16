import { Router } from "express";
import {
    getAdminDashboard,
    listUsers,
    suspendUser,
    reinstateUser,
    listAdminProducts,
    moderateProduct,
    listReports,
    resolveReport,
    listAdminOrders
} from "../controllers/admin.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth, requireRole("admin"));
router.get("/dashboard", getAdminDashboard);
router.get("/users", listUsers);
router.patch("/users/:userId/suspension", suspendUser);
router.patch("/users/:userId/unban", reinstateUser);
router.get("/products", listAdminProducts);
router.patch("/products/:productId/moderation", moderateProduct);
router.get("/reports", listReports);
router.patch("/reports/:reportId", resolveReport);
router.get("/orders", listAdminOrders);

export default router;