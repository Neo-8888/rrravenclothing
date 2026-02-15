document.addEventListener("DOMContentLoaded", () => {
    const toggles = document.querySelectorAll(".menu-toggle");

    toggles.forEach((toggle) => {
        const targetId = toggle.getAttribute("data-target");
        const nav = targetId ? document.getElementById(targetId) : null;
        if (!nav) return;

        toggle.addEventListener("click", () => {
            const isOpen = nav.classList.toggle("open");
            toggle.classList.toggle("open", isOpen);
            toggle.setAttribute("aria-expanded", String(isOpen));
            document.body.classList.toggle("nav-open", isOpen);
        });

        nav.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", () => {
                nav.classList.remove("open");
                toggle.classList.remove("open");
                toggle.setAttribute("aria-expanded", "false");
                document.body.classList.remove("nav-open");
            });
        });
    });

    const revealTargets = document.querySelectorAll(
        "section, .category-card, .product-box, .contact-card, .philosophy-card, .process-step, .illustration-item"
    );

    revealTargets.forEach((el, index) => {
        el.classList.add("reveal");
        el.style.transitionDelay = `${Math.min(index * 45, 240)}ms`;
    });

    const revealObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("in-view");
                    revealObserver.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.12, rootMargin: "0px 0px -10% 0px" }
    );

    revealTargets.forEach((el) => revealObserver.observe(el));

    const categoryButtons = document.querySelectorAll(".cat-btn");
    categoryButtons.forEach((button) => {
        button.addEventListener("click", () => {
            categoryButtons.forEach((b) => b.classList.remove("active"));
            button.classList.add("active");
        });
    });

    const products = document.querySelectorAll(".product-box[data-category]");
    const searchInput = document.querySelector(".search-input");
    let activeFilter = "all";

    const applyFilters = () => {
        const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

        products.forEach((product) => {
            const category = (product.getAttribute("data-category") || "").toLowerCase();
            const text = product.textContent.toLowerCase();
            const matchesCategory = activeFilter === "all" || category === activeFilter;
            const matchesSearch = !query || text.includes(query);
            product.style.display = matchesCategory && matchesSearch ? "" : "none";
        });
    };

    categoryButtons.forEach((button) => {
        button.addEventListener("click", () => {
            activeFilter = (button.getAttribute("data-filter") || "all").toLowerCase();
            applyFilters();
        });
    });

    if (searchInput) {
        searchInput.addEventListener("input", applyFilters);
    }

    const CART_STORAGE_KEY = "raven_cart_v1";
    const cartDrawer = document.querySelector("[data-cart-drawer]");
    const cartOverlay = document.querySelector("[data-cart-overlay]");
    const cartItemsEl = document.querySelector("[data-cart-items]");
    const cartEmptyEl = document.querySelector("[data-cart-empty]");
    const cartTotalEl = document.querySelector("[data-cart-total]");
    const cartCheckoutBtn = document.querySelector("[data-cart-checkout]");
    const cartTrigger = document.querySelector(".cart-trigger");
    const cartCountEls = document.querySelectorAll("[data-cart-count]");
    const closeCartBtn = document.querySelector("[data-close-cart]");
    const cartToast = document.querySelector("[data-cart-toast]");

    const checkoutPageMarker = document.querySelector("[data-checkout-page]");
    const checkoutItems = document.querySelector("[data-checkout-items]");
    const checkoutTotal = document.querySelector("[data-checkout-total]");
    const paymentForm = document.querySelector("#paymentForm");
    const paymentStatus = document.querySelector("#paymentStatus");
    const payNowButton = document.querySelector("#payNowButton");

    const isCollectionsPage = Boolean(cartDrawer && cartItemsEl);
    const isCheckoutPage = Boolean(checkoutPageMarker && checkoutItems && checkoutTotal);
    const formatPrice = (value) => `R${Math.round(value)}`;

    let cart = [];

    const loadCart = () => {
        try {
            const saved = localStorage.getItem(CART_STORAGE_KEY);
            if (!saved) return [];
            const parsed = JSON.parse(saved);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    };

    const saveCart = () => {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    };

    const getProductPayload = (button) => {
        const card = button.closest(".product-box");
        const name = button.getAttribute("data-product") || card?.querySelector("h4")?.textContent?.trim() || "Item";
        const priceAttr = Number(button.getAttribute("data-price"));
        const fallbackText = card?.querySelector(".price")?.textContent || "";
        const fallbackPrice = Number((fallbackText.match(/[\d.]+/) || ["0"])[0]);
        const price = Number.isFinite(priceAttr) && priceAttr > 0 ? priceAttr : fallbackPrice;
        const image = card?.querySelector("img")?.getAttribute("src") || "";
        return {
            id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            name,
            price,
            image
        };
    };

    const getCartCount = () => cart.reduce((sum, item) => sum + item.quantity, 0);
    const getCartTotal = () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const updateCartBadges = () => {
        const count = getCartCount();
        cartCountEls.forEach((el) => {
            el.textContent = String(count);
        });
    };

    const renderCart = () => {
        if (!isCollectionsPage) return;

        cartItemsEl.innerHTML = "";
        cart.forEach((item) => {
            const row = document.createElement("div");
            row.className = "cart-item";
            row.innerHTML = `
                <div class="cart-item-image">
                    <img src="${item.image}" alt="${item.name}">
                </div>
                <div class="cart-item-body">
                    <p class="cart-item-name">${item.name}</p>
                    <p class="cart-item-price">${formatPrice(item.price)}</p>
                    <div class="cart-item-actions">
                        <button type="button" data-cart-action="decrease" data-id="${item.id}" aria-label="Decrease quantity">-</button>
                        <span>${item.quantity}</span>
                        <button type="button" data-cart-action="increase" data-id="${item.id}" aria-label="Increase quantity">+</button>
                        <button type="button" data-cart-action="remove" data-id="${item.id}">Remove</button>
                    </div>
                </div>
            `;
            cartItemsEl.appendChild(row);
        });

        const isEmpty = cart.length === 0;
        cartEmptyEl.style.display = isEmpty ? "block" : "none";
        cartTotalEl.textContent = formatPrice(getCartTotal());
        cartCheckoutBtn.disabled = isEmpty;
        updateCartBadges();
    };

    const showToast = (message) => {
        if (!cartToast) return;
        cartToast.textContent = message;
        cartToast.classList.add("show");
        window.clearTimeout(showToast._timeoutId);
        showToast._timeoutId = window.setTimeout(() => {
            cartToast.classList.remove("show");
        }, 1800);
    };

    const openCart = () => {
        if (!isCollectionsPage) return;
        cartDrawer.classList.add("open");
        cartDrawer.setAttribute("aria-hidden", "false");
        cartOverlay.hidden = false;
        document.body.classList.add("cart-open");
    };

    const closeCart = () => {
        if (!isCollectionsPage) return;
        cartDrawer.classList.remove("open");
        cartDrawer.setAttribute("aria-hidden", "true");
        cartOverlay.hidden = true;
        document.body.classList.remove("cart-open");
    };

    const addToCart = (product) => {
        const existing = cart.find((item) => item.id === product.id);
        if (existing) {
            existing.quantity += 1;
        } else {
            cart.push({ ...product, quantity: 1 });
        }
        saveCart();
        renderCart();
        showToast(`${product.name} added to cart`);
    };

    const buyButtons = document.querySelectorAll(".buy-btn[data-product]");
    buyButtons.forEach((button) => {
        button.addEventListener("click", () => {
            if (!isCollectionsPage) {
                const product = button.getAttribute("data-product") || "Selected item";
                const target = `Contact.html?item=${encodeURIComponent(product)}`;
                window.location.href = target;
                return;
            }

            const product = getProductPayload(button);
            addToCart(product);
            openCart();
        });
    });

    if (isCollectionsPage) {
        cart = loadCart();
        renderCart();

        cartTrigger?.addEventListener("click", openCart);
        closeCartBtn?.addEventListener("click", closeCart);
        cartOverlay?.addEventListener("click", closeCart);

        cartItemsEl.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-cart-action]");
            if (!button) return;

            const id = button.getAttribute("data-id");
            const action = button.getAttribute("data-cart-action");
            const item = cart.find((entry) => entry.id === id);
            if (!item) return;

            if (action === "increase") {
                item.quantity += 1;
            }
            if (action === "decrease") {
                item.quantity -= 1;
                if (item.quantity <= 0) {
                    cart = cart.filter((entry) => entry.id !== id);
                }
            }
            if (action === "remove") {
                cart = cart.filter((entry) => entry.id !== id);
            }

            saveCart();
            renderCart();
        });

        cartCheckoutBtn?.addEventListener("click", () => {
            if (cart.length === 0) return;
            window.location.href = "checkout.html";
        });
    }

    const setPaymentStatus = (message, type = "") => {
        if (!paymentStatus) return;
        paymentStatus.textContent = message;
        paymentStatus.classList.remove("error", "success");
        if (type) {
            paymentStatus.classList.add(type);
        }
    };

    if (isCheckoutPage) {
        cart = loadCart();
        const params = new URLSearchParams(window.location.search);
        const status = params.get("status");
        const sessionId = params.get("session_id");

        if (status === "cancel") {
            setPaymentStatus("Payment was canceled. You can try again.", "error");
        }

        const renderCheckoutItems = () => {
            if (cart.length === 0) {
                checkoutItems.innerHTML = '<p class="checkout-note">Your cart is empty. Please add products first.</p>';
                checkoutTotal.textContent = formatPrice(0);
                if (payNowButton) payNowButton.disabled = true;
                return;
            }

            checkoutItems.innerHTML = "";
            cart.forEach((item) => {
                const row = document.createElement("div");
                row.className = "summary-item";
                row.innerHTML = `
                    <span class="summary-item-name">${item.quantity}x ${item.name}</span>
                    <span class="summary-item-price">${formatPrice(item.quantity * item.price)}</span>
                `;
                checkoutItems.appendChild(row);
            });
            checkoutTotal.textContent = formatPrice(getCartTotal());
        };

        const confirmPaidSession = async (id) => {
            try {
                const response = await fetch(`/api/checkout-session/${encodeURIComponent(id)}`);
                const payload = await response.json();
                if (!response.ok) {
                    throw new Error(payload.error || "Could not verify payment session.");
                }

                if (payload.paymentStatus === "paid") {
                    localStorage.removeItem(CART_STORAGE_KEY);
                    cart = [];
                    renderCheckoutItems();
                    setPaymentStatus(`Payment successful. Reference: ${payload.id}.`, "success");
                    if (payNowButton) {
                        payNowButton.disabled = true;
                        payNowButton.textContent = "Payment Complete";
                    }
                } else {
                    setPaymentStatus("Payment is not marked as paid yet.", "error");
                }
            } catch (error) {
                setPaymentStatus(error.message || "Could not verify payment.", "error");
            }
        };

        renderCheckoutItems();

        if (status === "success" && sessionId) {
            confirmPaidSession(sessionId);
        }

        paymentForm?.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (cart.length === 0) return;

            const formData = new FormData(paymentForm);
            const fullName = String(formData.get("fullName") || "").trim();
            const email = String(formData.get("email") || "").trim();

            if (!fullName || !email) {
                setPaymentStatus("Please enter name and email.", "error");
                return;
            }

            try {
                if (payNowButton) {
                    payNowButton.disabled = true;
                    payNowButton.textContent = "Redirecting...";
                }
                setPaymentStatus("Creating secure payment session...");

                const response = await fetch("/api/create-checkout-session", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        items: cart,
                        customer: {
                            name: fullName,
                            email
                        }
                    })
                });

                const payload = await response.json();
                if (!response.ok) {
                    throw new Error(payload.error || "Could not start payment.");
                }

                if (!payload.url) {
                    throw new Error("Stripe checkout URL is missing.");
                }

                window.location.href = payload.url;
            } catch (error) {
                setPaymentStatus(error.message || "Could not start payment.", "error");
                if (payNowButton) {
                    payNowButton.disabled = false;
                    payNowButton.textContent = "Continue to Secure Payment";
                }
            }
        });
    }

    const params = new URLSearchParams(window.location.search);
    const selectedItem = params.get("item");
    const messageInput = document.querySelector("#message");

    if (selectedItem && messageInput && !messageInput.value.trim()) {
        messageInput.value = `Hi Raven, I would like to order: ${selectedItem}. Please share available sizes and next steps.`;
    }
});
