import { Router } from "express";
import {
    getWallet,
    getTransactions,
    topUpWallet,
    payWithWallet
} from "../controllers/wallet.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.get("/", getWallet);
router.get("/transactions", getTransactions);
router.post("/topup", topUpWallet);
router.post("/pay", payWithWallet);

export default router;