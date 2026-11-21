// Admin-only receipt confirmation for cards issued on or after RECEIPT_CONFIRMATION_START.
// One row is the quantity issued to one battalion on one calendar day.
(function () {
    'use strict';

    const GADUD_LABELS = {
        '650': 'מפקדת אגד 650',
        '703': 'גדוד 703',
        '651': 'גדוד 651',
        '791': 'יחידה 791',
        '652': 'גדוד 652',
        '638': 'גדוד 638',
        '653': 'גדוד 653',
        '674': 'גדוד 674'
    };

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function toDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function formatKey(dateKey) {
        if (!dateKey || dateKey.length !== 10) return '';
        const [year, month, day] = dateKey.split('-');
        return `${day}.${month}.${year}`;
    }

    function todayKey() {
        return toDateKey(new Date());
    }

    function batchId(dateKey, gadudNumber) {
        return `${dateKey}_${gadudNumber || 'none'}`;
    }

    function whatsAppUrl(phone) {
        const digits = String(phone || '').replace(/\D/g, '');
        if (!digits) return '';
        const international = digits.startsWith('0')
            ? `972${digits.slice(1)}`
            : (digits.startsWith('972') ? digits : `972${digits}`);
        return `https://wa.me/${international}`;
    }

    function formatStamp(iso) {
        const parsed = new Date(iso);
        if (Number.isNaN(parsed.getTime())) return '';
        const hours = String(parsed.getHours()).padStart(2, '0');
        const minutes = String(parsed.getMinutes()).padStart(2, '0');
        return `${formatKey(toDateKey(parsed))} בשעה ${hours}:${minutes}`;
    }

    class ReceiptConfirmationManager {
        constructor(controller) {
            this.controller = controller;
            this.confirmations = new Map();
            this.mode = 'pending';
            this.open = false;
            this.loaded = false;
            this.loading = false;
            this.loadError = '';
            this._bound = false;
            this.bind();
        }

        startDateKey() {
            const fromConstants = window.APP_CONSTANTS && window.APP_CONSTANTS.RECEIPT_CONFIRMATION_START;
            return fromConstants || '2026-11-21';
        }

        bind() {
            if (this._bound) return;
            this._bound = true;

            const cardsTab = document.getElementById('cardsViewTab');
            const receiptTab = document.getElementById('receiptViewTab');
            if (cardsTab) cardsTab.addEventListener('click', () => this.showCardsView());
            if (receiptTab) receiptTab.addEventListener('click', () => { this.showReceiptView(); });

            const panel = document.getElementById('receiptConfirmPanel');
            if (!panel) return;

            panel.addEventListener('click', (event) => {
                const modeButton = event.target.closest('[data-receipt-mode]');
                if (modeButton) {
                    this.mode = modeButton.getAttribute('data-receipt-mode') === 'confirmed' ? 'confirmed' : 'pending';
                    this.render();
                    return;
                }

                const detailsButton = event.target.closest('[data-receipt-details]');
                if (!detailsButton) return;
                const row = detailsButton.closest('[data-batch-id]');
                if (!row) return;
                const details = row.querySelector('.receipt-row__details');
                if (!details) return;
                const willOpen = details.hasAttribute('hidden');
                details.toggleAttribute('hidden');
                detailsButton.textContent = willOpen ? 'סגור' : 'הכרטיסים בשורה';
                detailsButton.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
            });

            panel.addEventListener('change', (event) => {
                const target = event.target;
                if (!target) return;
                if (target.matches('[data-receipt-confirm]')) {
                    this.onCheckboxChange(target);
                    return;
                }
                if (target.matches('[data-receipt-date]')) {
                    this.onDateChange(target);
                }
            });
        }

        isAdmin() {
            return !!(this.controller.currentUser && this.controller.currentUser.isAdmin);
        }

        showCardsView() {
            this.open = false;
            const controls = document.querySelector('#mainContainer .controls');
            const table = document.querySelector('#mainContainer .data-table');
            const panel = document.getElementById('receiptConfirmPanel');
            if (controls) controls.style.display = '';
            if (table) table.style.display = '';
            if (panel) panel.style.display = 'none';
            this.setTabState();
        }

        async showReceiptView() {
            if (!this.isAdmin()) return;
            this.open = true;
            if (typeof hideAllTypingForms === 'function') hideAllTypingForms();
            const controls = document.querySelector('#mainContainer .controls');
            const table = document.querySelector('#mainContainer .data-table');
            const panel = document.getElementById('receiptConfirmPanel');
            if (controls) controls.style.display = 'none';
            if (table) table.style.display = 'none';
            if (panel) panel.style.display = 'block';
            this.setTabState();
            if (!this.loaded) this.loading = true;
            this.render();
            await this.load();
        }

        setTabState() {
            const cardsTab = document.getElementById('cardsViewTab');
            const receiptTab = document.getElementById('receiptViewTab');
            if (cardsTab) cardsTab.classList.toggle('view-tab--active', !this.open);
            if (receiptTab) receiptTab.classList.toggle('view-tab--active', this.open);
        }

        async load() {
            if (!this.isAdmin()) return;
            if (!window.db || !window.firebaseGetDocs || !window.firebaseCollection) {
                this.loadError = 'Firebase עדיין לא מוכן';
                this.render();
                return;
            }

            this.loading = true;
            this.loadError = '';
            if (this.open) this.render();

            try {
                const snapshot = await window.firebaseGetDocs(
                    window.firebaseCollection(window.db, 'receiptConfirmations')
                );
                const next = new Map();
                snapshot.forEach((item) => {
                    const data = item.data() || {};
                    next.set(item.id, data);
                });
                this.confirmations = next;
                this.loaded = true;
            } catch (error) {
                console.error('שגיאה בטעינת אימותי קבלה:', error);
                this.loadError = 'לא הצלחתי לטעון את אימותי הקבלה';
            } finally {
                this.loading = false;
                this.updateTabBadge();
                if (this.open) this.render();
            }
        }

        refreshIfVisible() {
            if (!this.open || !this.loaded) return;
            this.render();
        }

        buildBatches() {
            const start = this.startDateKey();
            const groups = new Map();
            const cards = Array.isArray(this.controller.fuelCards) ? this.controller.fuelCards : [];

            cards.forEach((card) => {
                const rawDate = card.issueDate || card.date || '';
                const parsed = this.controller.parseDateString
                    ? this.controller.parseDateString(String(rawDate))
                    : null;
                if (!parsed) return;
                const dateKey = toDateKey(parsed);
                if (dateKey < start) return;
                const gadudNumber = String(card.gadudNumber || '').trim();
                const id = batchId(dateKey, gadudNumber);
                if (!groups.has(id)) {
                    groups.set(id, {
                        id,
                        dateKey,
                        gadudNumber,
                        cards: []
                    });
                }
                groups.get(id).cards.push(card);
            });

            return Array.from(groups.values()).sort((a, b) => {
                if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey);
                return a.gadudNumber.localeCompare(b.gadudNumber, 'he');
            });
        }

        recordFor(batch) {
            return this.confirmations.get(batch.id) || null;
        }

        isFullyConfirmed(batch) {
            const record = this.recordFor(batch);
            if (!record) return false;
            return Number(record.confirmedQuantity) === batch.cards.length;
        }

        pendingBatches() {
            return this.buildBatches().filter((batch) => !this.isFullyConfirmed(batch));
        }

        confirmedBatches() {
            return this.buildBatches().filter((batch) => this.isFullyConfirmed(batch));
        }

        updateTabBadge() {
            const tab = document.getElementById('receiptViewTab');
            if (!tab || !this.loaded) return;
            const pending = this.pendingBatches().length;
            tab.textContent = pending > 0 ? `אימות קבלה (${pending})` : 'אימות קבלה';
        }

        findBatch(id) {
            return this.buildBatches().find((batch) => batch.id === id) || null;
        }

        isValidVerifyDate(value, batch) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
            const [year, month, day] = value.split('-').map((part) => parseInt(part, 10));
            const parsed = new Date(year, month - 1, day);
            if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
                return false;
            }
            if (!batch) return false;
            return value >= batch.dateKey && value <= todayKey();
        }

        async onCheckboxChange(checkbox) {
            const row = checkbox.closest('[data-batch-id]');
            if (!row) return;
            const id = row.getAttribute('data-batch-id');
            const batch = this.findBatch(id);
            if (!batch) {
                checkbox.checked = false;
                return;
            }

            if (!checkbox.checked) {
                const approved = window.confirm('לבטל את אישור הקבלה של הכמות הזו?');
                if (!approved) {
                    checkbox.checked = true;
                    return;
                }
                checkbox.disabled = true;
                try {
                    await this.deleteConfirmation(id);
                    this.controller.showStatus('אישור הקבלה בוטל', 'success');
                    this.render();
                } catch (error) {
                    console.error(error);
                    checkbox.checked = true;
                    checkbox.disabled = false;
                    this.controller.showStatus('לא הצלחתי לבטל את האישור', 'error');
                }
                return;
            }

            const dateInput = row.querySelector('[data-receipt-date]');
            const verifyDate = dateInput ? dateInput.value : '';
            if (!this.isValidVerifyDate(verifyDate, batch)) {
                checkbox.checked = false;
                this.controller.showStatus('לפני הסימון צריך תאריך אימות בוואטסאפ, מיום הניפוק ועד היום', 'error');
                if (dateInput) dateInput.focus();
                return;
            }

            checkbox.disabled = true;
            try {
                await this.saveConfirmation(batch, verifyDate);
                this.controller.showStatus('הגדוד סומן כמי שאישר את קבלת הכרטיסים', 'success');
                this.render();
            } catch (error) {
                console.error(error);
                checkbox.checked = false;
                checkbox.disabled = false;
                this.controller.showStatus('לא הצלחתי לשמור את האישור', 'error');
            }
        }

        async onDateChange(input) {
            const row = input.closest('[data-batch-id]');
            if (!row) return;
            const checkbox = row.querySelector('[data-receipt-confirm]');
            if (!checkbox || !checkbox.checked) return;
            const id = row.getAttribute('data-batch-id');
            const batch = this.findBatch(id);
            const record = batch ? this.recordFor(batch) : null;
            if (!batch || !this.isValidVerifyDate(input.value, batch)) {
                if (record && record.whatsappVerifyDate) input.value = record.whatsappVerifyDate;
                this.controller.showStatus('תאריך האימות בוואטסאפ צריך להיות מיום הניפוק ועד היום', 'error');
                return;
            }
            input.disabled = true;
            try {
                await this.saveConfirmation(batch, input.value);
                this.controller.showStatus('תאריך האימות עודכן', 'success');
                this.render();
            } catch (error) {
                console.error(error);
                input.disabled = false;
                if (record && record.whatsappVerifyDate) input.value = record.whatsappVerifyDate;
                this.controller.showStatus('לא הצלחתי לעדכן את תאריך האימות', 'error');
            }
        }

        async saveConfirmation(batch, verifyDate) {
            if (!this.isAdmin()) throw new Error('unauthorized');
            if (!window.firebaseSetDoc || !window.firebaseDoc || !window.db) {
                throw new Error('firebase setDoc missing');
            }
            const payload = {
                issueDateKey: batch.dateKey,
                gadudNumber: batch.gadudNumber,
                confirmedQuantity: batch.cards.length,
                whatsappVerifyDate: verifyDate,
                confirmedAt: new Date().toISOString(),
                confirmedBy: this.controller.currentUser.name || ''
            };
            await window.firebaseSetDoc(
                window.firebaseDoc(window.db, 'receiptConfirmations', batch.id),
                payload
            );
            this.confirmations.set(batch.id, payload);
            this.loaded = true;
            this.updateTabBadge();
        }

        async deleteConfirmation(id) {
            if (!this.isAdmin()) throw new Error('unauthorized');
            if (!window.firebaseDeleteDoc || !window.firebaseDoc || !window.db) {
                throw new Error('firebase deleteDoc missing');
            }
            await window.firebaseDeleteDoc(window.firebaseDoc(window.db, 'receiptConfirmations', id));
            this.confirmations.delete(id);
            this.updateTabBadge();
        }

        gadudLabel(gadudNumber) {
            if (!gadudNumber) return 'ללא גדוד';
            return GADUD_LABELS[gadudNumber] || `גדוד ${gadudNumber}`;
        }

        contactFor(gadudNumber) {
            const contacts = this.controller.adminGadudContacts || {};
            return contacts[gadudNumber] || null;
        }

        render() {
            const panel = document.getElementById('receiptConfirmPanel');
            if (!panel) return;
            const startLabel = formatKey(this.startDateKey());
            const pendingCount = this.loaded ? this.pendingBatches().length : 0;
            const confirmedCount = this.loaded ? this.confirmedBatches().length : 0;
            const rows = this.mode === 'confirmed' ? this.confirmedBatches() : this.pendingBatches();

            let body = '';
            if (this.loading && !this.loaded) {
                body = '<div class="receipt-empty">טוען אימותי קבלה...</div>';
            } else if (rows.length === 0) {
                body = `<div class="receipt-empty">${this.mode === 'confirmed'
                    ? 'עדיין אין שורות שאושרו.'
                    : 'אין ניפוקים שממתינים לאימות.'}</div>`;
            } else {
                body = rows.map((batch) => this.renderBatch(batch)).join('');
            }
            const loadNotice = this.loadError
                ? `<div class="receipt-note">${escapeHtml(this.loadError)}. רשימת הניפוקים מוצגת, אבל אישורים שנשמרו לא נטענו.</div>`
                : '';

            panel.innerHTML = `
                <h3>אימות קבלת כרטיסים</h3>
                <p class="receipt-panel__note">מוצגים רק ניפוקים מ-${escapeHtml(startLabel)} ואילך. כל שורה היא כמות הכרטיסים שנופקה באותו יום לאותו גדוד. מסמנים את האישור רק אחרי שהגדוד אישר בוואטסאפ שקיבל את הכמות הזו.</p>
                <div class="receipt-switch">
                    <button type="button" class="view-tab ${this.mode === 'pending' ? 'view-tab--active' : ''}" data-receipt-mode="pending">ממתינים לאימות${this.loaded ? ` (${pendingCount})` : ''}</button>
                    <button type="button" class="view-tab ${this.mode === 'confirmed' ? 'view-tab--active' : ''}" data-receipt-mode="confirmed">שאושרו${this.loaded ? ` (${confirmedCount})` : ''}</button>
                </div>
                ${loadNotice}
                ${body}
            `;
            this.updateTabBadge();
        }

        renderBatch(batch) {
            const record = this.recordFor(batch);
            const confirmed = this.isFullyConfirmed(batch);
            const contact = this.contactFor(batch.gadudNumber);
            const link = contact ? whatsAppUrl(contact.phone) : '';
            const verifyDate = record && record.whatsappVerifyDate ? record.whatsappVerifyDate : '';
            const quantityChanged = record && !confirmed;
            const cards = batch.cards
                .slice()
                .sort((a, b) => (Number(a.cardNumber) || 0) - (Number(b.cardNumber) || 0));

            const cardItems = cards.map((card) => {
                const number = escapeHtml(card.cardNumber);
                const name = String(card.name || '').trim();
                return `<li>כרטיס ${number}${name ? ` — ${escapeHtml(name)}` : ''}</li>`;
            }).join('');

            const whatsApp = link
                ? `<a class="receipt-wa" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">פתח וואטסאפ${contact.name ? ` · ${escapeHtml(contact.name)}` : ''}</a>`
                : '<span class="receipt-wa receipt-wa--disabled">אין איש קשר לוואטסאפ</span>';

            const savedLine = confirmed && record && record.confirmedAt
                ? `<p>האישור נשמר במערכת ב-${escapeHtml(formatStamp(record.confirmedAt))}.</p>`
                : '';
            const statusLine = confirmed
                ? `<p>הגדוד אישר שקיבל ${batch.cards.length} כרטיסים שנופקו ב-${escapeHtml(formatKey(batch.dateKey))}. תאריך האימות בוואטסאפ: ${escapeHtml(formatKey(verifyDate))}.</p>`
                : '<p>אלה הכרטיסים שנכללים בכמות של השורה הזו.</p>';
            const mismatch = quantityChanged
                ? `<div class="receipt-note">הכמות השתנתה אחרי אימות קודם (אושרו ${escapeHtml(record.confirmedQuantity)}, עכשיו ${batch.cards.length}). צריך אישור מחדש על הכמות העדכנית.</div>`
                : '';

            return `
                <article class="receipt-row ${confirmed ? 'receipt-row--done' : ''}" data-batch-id="${escapeHtml(batch.id)}">
                    <div class="receipt-row__facts">
                        <div class="receipt-field">
                            <span class="label">תאריך ניפוק</span>
                            <strong>${escapeHtml(formatKey(batch.dateKey))}</strong>
                        </div>
                        <div class="receipt-field">
                            <span class="label">גדוד</span>
                            <strong>${escapeHtml(this.gadudLabel(batch.gadudNumber))}</strong>
                        </div>
                        <div class="receipt-field">
                            <span class="label">כמות כרטיסים</span>
                            <strong>${batch.cards.length}</strong>
                        </div>
                    </div>
                    <div class="receipt-row__actions">
                        <label class="receipt-check">
                            <input type="checkbox" data-receipt-confirm ${confirmed ? 'checked' : ''}>
                            הגדוד אישר שקיבל
                        </label>
                        <label class="receipt-field receipt-date-field">
                            <span class="label">תאריך אימות בוואטסאפ</span>
                            <input type="date" data-receipt-date value="${escapeHtml(verifyDate)}" min="${escapeHtml(batch.dateKey)}" max="${escapeHtml(todayKey())}">
                        </label>
                        ${whatsApp}
                        <button type="button" class="receipt-details-btn" data-receipt-details aria-expanded="false">הכרטיסים בשורה</button>
                    </div>
                    ${mismatch}
                    <div class="receipt-row__details" hidden>
                        ${statusLine}
                        ${savedLine}
                        <ul class="receipt-card-list">${cardItems}</ul>
                    </div>
                </article>
            `;
        }
    }

    window.ReceiptConfirmationManager = ReceiptConfirmationManager;
})();
