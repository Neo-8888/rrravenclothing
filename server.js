const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const dotenv = require("dotenv");
const Stripe = require("stripe");

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const rootDir = __dirname;
const ordersFile = path.join(rootDir, "data", "orders.json");
const isVercel = Boolean(process.env.VERCEL);
let inMemoryOrders = [];

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const readOrders = async () => {
    if (isVercel) {
        return inMemoryOrders;
    }

    try {
        const raw = await fs.readFile(ordersFile, "utf8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const writeOrders = async (orders) => {
    if (isVercel) {
        inMemoryOrders = Array.isArray(orders) ? orders : [];
        return false;
    }

    try {
        await fs.mkdir(path.dirname(ordersFile), { recursive: true });
        await fs.writeFile(ordersFile, JSON.stringify(orders, null, 2));
        return true;
    } catch (error) {
        console.warn("Could not persist orders to filesystem:", error.message);
        return false;
    }
};

app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
    if (!stripe || !stripeWebhookSecret) {
        return res.status(400).send("Stripe webhook is not configured.");
    }

    let event;
    try {
        const signature = req.headers["stripe-signature"];
        event = stripe.webhooks.constructEvent(req.body, signature, stripeWebhookSecret);
    } catch (error) {
        return res.status(400).send(`Webhook Error: ${error.message}`);
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });

        const order = {
            id: session.id,
            paymentStatus: session.payment_status,
            customerEmail: session.customer_details?.email || session.customer_email || "",
            customerName: session.customer_details?.name || session.metadata?.customerName || "",
            currency: session.currency,
            total: session.amount_total,
            items: lineItems.data.map((item) => ({
                name: item.description,
                quantity: item.quantity,
                amountTotal: item.amount_total
            })),
            createdAt: new Date().toISOString()
        };

        const existing = await readOrders();
        const withoutCurrent = existing.filter((entry) => entry.id !== order.id);
        withoutCurrent.unshift(order);
        const persisted = await writeOrders(withoutCurrent);
        if (!persisted && isVercel) {
            console.warn("Order stored in memory only. Configure a database for persistent order history on Vercel.");
        }

        console.log(`Paid order: ${order.id} (${order.customerEmail || "no-email"})`);
    }

    return res.json({ received: true });
});

app.use(express.json());

app.post("/api/create-checkout-session", async (req, res) => {
    if (!stripe) {
        return res.status(500).json({ error: "Stripe secret key not configured." });
    }

    const { items, customer } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Cart is empty." });
    }

    const cleanItems = items
        .map((item) => ({
            name: String(item.name || "").trim(),
            price: Number(item.price),
            quantity: Number(item.quantity)
        }))
        .filter((item) => item.name && Number.isFinite(item.price) && item.price > 0 && Number.isInteger(item.quantity) && item.quantity > 0);

    if (cleanItems.length === 0) {
        return res.status(400).json({ error: "Invalid cart items." });
    }

    const origin = `${req.protocol}://${req.get("host")}`;

    try {
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            line_items: cleanItems.map((item) => ({
                quantity: item.quantity,
                price_data: {
                    currency: "zar",
                    unit_amount: Math.round(item.price * 100),
                    product_data: {
                        name: item.name
                    }
                }
            })),
            customer_email: customer?.email ? String(customer.email) : undefined,
            billing_address_collection: "required",
            success_url: `${origin}/checkout.html?status=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/checkout.html?status=cancel`,
            metadata: {
                customerName: customer?.name ? String(customer.name) : "",
                customerEmail: customer?.email ? String(customer.email) : ""
            }
        });

        return res.json({ url: session.url });
    } catch (error) {
        return res.status(500).json({ error: error.message || "Could not create checkout session." });
    }
});

app.get("/api/checkout-session/:id", async (req, res) => {
    if (!stripe) {
        return res.status(500).json({ error: "Stripe secret key not configured." });
    }

    try {
        const session = await stripe.checkout.sessions.retrieve(req.params.id);
        return res.json({
            id: session.id,
            paymentStatus: session.payment_status,
            amountTotal: session.amount_total,
            currency: session.currency,
            customerEmail: session.customer_details?.email || session.customer_email || ""
        });
    } catch (error) {
        return res.status(404).json({ error: "Session not found." });
    }
});

app.get("/api/orders", async (_req, res) => {
    if (isVercel) {
        return res.status(503).json({
            orders: inMemoryOrders,
            warning: "Persistent order storage is unavailable on Vercel without a database."
        });
    }

    const orders = await readOrders();
    return res.json({ orders });
});

app.use(express.static(rootDir, { extensions: ["html"] }));

app.get("/", (_req, res) => {
    res.sendFile(path.join(rootDir, "index.html"));
});

// Vercel serverless expects the Express app to be exported.
if (isVercel) {
    module.exports = app;
} else {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}

