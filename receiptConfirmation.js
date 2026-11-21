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
            this.selectedGadud = '';
            this.selectedDate = '';
            this.open = false;
            this.loaded = false;
            this.loading = false;
            this.loadError = '';
            this._bound = false;
            this._openedAt = 0;
            this._loadPromise = null;
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
            if (receiptTab) receiptTab.addEventListener('click', () => this.onReceiptTabClick());

            const panel = document.getElementById('receiptConfirmPanel');
            if (!panel) return;

            panel.addEventListener('click', (event) => {
                const clearDay = event.target.closest('[data-receipt-clear-day]');
                if (clearDay) {
                    this.selectedDate = '';
                    this.render();
                    return;
                }

                const saveButton = event.target.closest('[data-receipt-save]');
                if (saveButton) {
                    this.onSaveDate(saveButton);
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
                detailsButton.textContent = willOpen ? 'סגור' : 'כרטיסים שנופקו ביום זה';
                detailsButton.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
            });

            panel.addEventListener('change', (event) => {
                const target = event.target;
                if (!target) return;
                if (target.matches('[data-receipt-gadud]')) {
                    this.selectedGadud = target.value || '';
                    this.render();
                    return;
                }
                if (target.matches('[data-receipt-day]')) {
                    this.selectedDate = target.value || '';
                    this.render();
                    return;
                }
            });
        }

        onReceiptTabClick() {
            if (!this.isAdmin()) return;
            const now = Date.now();
            if (this.open) {
                if (now - this._openedAt < 400) return;
                this.showCardsView();
                return;
            }
            this._openedAt = now;
            this.showReceiptView();
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
            if (this._loadPromise) {
                this.render();
                return;
            }
            if (!this.loaded) this.loading = true;
            this.render();
            this._loadPromise = this.load().finally(() => {
                this._loadPromise = null;
            });
            await this._loadPromise;
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
                this.loading = false;
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

        batchesForSelection() {
            if (!this.selectedGadud) return [];
            return this.buildBatches().filter((batch) => {
                if (batch.gadudNumber !== this.selectedGadud) return false;
                if (this.selectedDate && batch.dateKey !== this.selectedDate) return false;
                return true;
            });
        }

        updateTabBadge() {
            const tab = document.getElementById('receiptViewTab');
            if (tab) tab.textContent = 'אימות קבלה';
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

        async onSaveDate(button) {
            const row = button.closest('[data-batch-id]');
            if (!row || button.disabled) return;
            const batch = this.findBatch(row.getAttribute('data-batch-id'));
            const input = row.querySelector('[data-receipt-date]');
            const verifyDate = input ? input.value : '';
            if (!batch || !this.isValidVerifyDate(verifyDate, batch)) {
                this.controller.showStatus('התאריך צריך להיות מיום הניפוק ועד היום', 'error');
                if (input) input.focus();
                return;
            }

            button.disabled = true;
            try {
                await this.saveConfirmation(batch, verifyDate);
                this.controller.showStatus('התאריך נשמר', 'success');
                this.render();
            } catch (error) {
                console.error(error);
                button.disabled = false;
                this.controller.showStatus('לא הצלחתי לשמור את התאריך', 'error');
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

        gadudLabel(gadudNumber) {
            if (!gadudNumber) return 'ללא גדוד';
            return GADUD_LABELS[gadudNumber] || `גדוד ${gadudNumber}`;
        }

        gadudOptions() {
            const options = ['<option value="">בחר גדוד</option>'];
            Object.keys(GADUD_LABELS).forEach((id) => {
                const selected = id === this.selectedGadud ? ' selected' : '';
                options.push(`<option value="${id}"${selected}>${escapeHtml(GADUD_LABELS[id])}</option>`);
            });
            return options.join('');
        }

        renderLists() {
            if (this.loading && !this.loaded) {
                return '<div class="receipt-empty">טוען אימותי קבלה...</div>';
            }
            if (!this.selectedGadud) {
                return '<div class="receipt-empty">בחר גדוד כדי לראות רק את הניפוקים שלו.</div>';
            }

            const batches = this.batchesForSelection();
            const pending = batches.filter((batch) => !this.isFullyConfirmed(batch));
            const confirmed = batches.filter((batch) => this.isFullyConfirmed(batch));
            const dayLabel = this.selectedDate ? formatKey(this.selectedDate) : '';

            if (this.selectedDate && batches.length === 0) {
                return `<div class="receipt-empty">ביום ${escapeHtml(dayLabel)} לא נופקו כרטיסים לגדוד הזה.</div>`;
            }

            const pendingBody = pending.length
                ? pending.map((batch) => this.renderBatch(batch)).join('')
                : `<div class="receipt-empty">${dayLabel ? `אין ניפוק שממתין ב-${escapeHtml(dayLabel)}.` : 'אין ניפוקים שממתינים לאימות לגדוד הזה.'}</div>`;
            const confirmedBody = confirmed.length
                ? confirmed.map((batch) => this.renderBatch(batch)).join('')
                : `<div class="receipt-empty">${dayLabel ? `אין אימות ב-${escapeHtml(dayLabel)}.` : 'עדיין אין אימותים לגדוד הזה.'}</div>`;

            return `
                <h4 class="receipt-section-title">ממתינים לאימות</h4>
                ${pendingBody}
                <h4 class="receipt-section-title">אומתו</h4>
                ${confirmedBody}
            `;
        }

        render() {
            const panel = document.getElementById('receiptConfirmPanel');
            if (!panel) return;
            const startLabel = formatKey(this.startDateKey());
            const loadNotice = this.loadError
                ? `<div class="receipt-note">${escapeHtml(this.loadError)}. רשימת הניפוקים מוצגת, אבל אישורים שנשמרו לא נטענו.</div>`
                : '';
            const clearDay = this.selectedDate
                ? '<button type="button" class="receipt-details-btn" data-receipt-clear-day>כל הימים</button>'
                : '';

            panel.innerHTML = `
                <h3>אימות קבלת כרטיסים</h3>
                <p class="receipt-panel__note">בוחרים גדוד, ורואים רק אותו. למטה מופיעים קודם ניפוקים שממתינים לאימות, ואחר כך מה שכבר אומת. אפשר לבחור יום ולראות מה נופק בו לגדוד. מוצגים ניפוקים מ-${escapeHtml(startLabel)} ואילך. לחיצה נוספת על אימות קבלה מחזירה לכרטיסים.</p>
                <div class="receipt-filters">
                    <label class="receipt-field">גדוד
                        <select data-receipt-gadud>${this.gadudOptions()}</select>
                    </label>
                    <label class="receipt-field">יום
                        <input type="date" data-receipt-day value="${escapeHtml(this.selectedDate)}" min="${escapeHtml(this.startDateKey())}" max="${escapeHtml(todayKey())}">
                    </label>
                    ${clearDay}
                </div>
                ${loadNotice}
                ${this.renderLists()}
            `;
            this.updateTabBadge();
        }

        renderBatch(batch) {
            const record = this.recordFor(batch);
            const confirmed = this.isFullyConfirmed(batch);
            const verifyDate = record && record.whatsappVerifyDate ? record.whatsappVerifyDate : batch.dateKey;
            const quantityChanged = record && !confirmed;
            const cards = batch.cards
                .slice()
                .sort((a, b) => (Number(a.cardNumber) || 0) - (Number(b.cardNumber) || 0));

            const cardItems = cards.map((card) => {
                const number = escapeHtml(card.cardNumber);
                const name = String(card.name || '').trim();
                return `<li>כרטיס ${number}${name ? ` — ${escapeHtml(name)}` : ''}</li>`;
            }).join('');

            const savedLine = confirmed && record && record.confirmedAt
                ? `<p>התאריך נשמר במערכת ב-${escapeHtml(formatStamp(record.confirmedAt))}.</p>`
                : '';
            const mismatch = quantityChanged
                ? `<div class="receipt-note">הכמות השתנתה אחרי השמירה (נשמרו ${escapeHtml(record.confirmedQuantity)}, עכשיו ${batch.cards.length}). צריך לשמור שוב את התאריך.</div>`
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
                        <label class="receipt-field receipt-date-field">
                            <span class="label">תאריך</span>
                            <input type="date" data-receipt-date value="${escapeHtml(verifyDate)}" min="${escapeHtml(batch.dateKey)}" max="${escapeHtml(todayKey())}">
                        </label>
                        <button type="button" class="receipt-details-btn" data-receipt-save>שמור תאריך</button>
                        <button type="button" class="receipt-details-btn" data-receipt-details aria-expanded="false">כרטיסים שנופקו ביום זה</button>
                    </div>
                    ${mismatch}
                    <div class="receipt-row__details" hidden>
                        ${savedLine}
                        <ul class="receipt-card-list">${cardItems}</ul>
                    </div>
                </article>
            `;
        }
    }

    window.ReceiptConfirmationManager = ReceiptConfirmationManager;
})();
