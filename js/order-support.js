/* =========================================================
   ORDER + SUPPORT helpers (no backend needed)
   - quantity stepper, live order summary, WhatsApp message
   - "Order Now" on a product card pre-selects it in the form
   - copy-to-clipboard buttons for account numbers
   ========================================================= */

(function () {
    const form = document.getElementById("orderForm");
    const qty = document.getElementById("quantity");
    const summary = document.getElementById("orderSummary");
    const wa = document.getElementById("orderWhatsapp");
    const WA_NUMBER = "256785117257";

    function selected() { return form ? form.querySelector('input[name="product"]:checked') : null; }

    function refresh() {
        if (!form || !qty) return;
        const p = selected();
        const n = Math.max(1, parseInt(qty.value, 10) || 1);
        if (summary) {
            if (!p) summary.innerHTML = "Choose a product to see your order summary.";
            else {
                const price = parseInt(p.dataset.price, 10);
                summary.innerHTML = price
                    ? `<strong>${n} × ${p.value}</strong>, estimated <strong>UGX ${(price * n).toLocaleString("en-UG")}</strong>. Delivery is confirmed by our team.`
                    : `<strong>${n} × ${p.value}</strong>, our team will confirm the price when they contact you.`;
            }
        }
        if (wa) {
            const name = (form.querySelector('[name="name"]') || {}).value || "";
            const text = p
                ? `Hello Nouricare, I want to order ${n} × ${p.value}.${name ? " My name is " + name + "." : ""}`
                : "Hello Nouricare, I want to place an order!";
            wa.href = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
        }
    }

    if (form) {
        form.addEventListener("change", refresh);
        form.addEventListener("input", refresh);
        form.addEventListener("submit", () => {
            const b = form.querySelector(".od-submit");
            if (b) { b.disabled = true; b.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sending…'; }
        });
        document.addEventListener("products:rendered", refresh);
        refresh();
    }

    document.addEventListener("click", (e) => {
        const step = e.target.closest("[data-qty-step]");
        if (step && qty) {
            const v = (parseInt(qty.value, 10) || 1) + parseInt(step.dataset.qtyStep, 10);
            qty.value = Math.min(9999, Math.max(1, v));
            refresh();
            return;
        }

        const order = e.target.closest("[data-order-product]");
        if (order && form) {
            const name = order.dataset.orderProduct;
            const radio = Array.from(form.querySelectorAll('input[name="product"]')).find((r) => r.value === name);
            if (radio) { radio.checked = true; refresh(); }
            return;
        }

        const copy = e.target.closest("[data-copy]");
        if (copy) {
            const text = copy.dataset.copy;
            const done = () => {
                const i = copy.querySelector("i");
                copy.classList.add("copied");
                if (i) i.className = "fa fa-check";
                setTimeout(() => { copy.classList.remove("copied"); if (i) i.className = "fa fa-copy"; }, 1600);
            };
            if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done);
            else {
                const t = document.createElement("textarea");
                t.value = text; document.body.appendChild(t); t.select();
                try { document.execCommand("copy"); done(); } catch (err) {}
                t.remove();
            }
        }
    });
})();
