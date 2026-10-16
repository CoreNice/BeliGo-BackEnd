import { Router } from "express";
import {
    getFavorites,
    addFavorite,
    removeFavorite,
    toggleFavorite
} from "../controllers/favorite.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.get("/", getFavorites);
router.post("/", addFavorite);
router.post("/toggle", toggleFavorite);
router.delete("/:productId", removeFavorite);

export default router;