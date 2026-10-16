import { Router } from "express";
import {
    listProducts,
    getProduct,
    getMyProducts,
    createProduct,
    updateProduct,
    archiveProduct
} from "../controllers/product.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", listProducts);
router.get("/mine", requireAuth, requireRole("seller"), getMyProducts);
router.post("/", requireAuth, requireRole("seller"), createProduct);
router.get("/:productId", getProduct);
router.patch("/:productId", requireAuth, requireRole("seller"), updateProduct);
router.delete("/:productId", requireAuth, requireRole("seller"), archiveProduct);

export default router;