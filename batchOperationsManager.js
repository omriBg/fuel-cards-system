class BatchOperationsManager {
    constructor(controller) {
        this.controller = controller;
    }

    showBatchCreditModal() {
        if (!this.controller.currentUser || !this.controller.currentUser.isAdmin) {
            this.controller.showStatus('אין לך הרשאה לבצע זיכוי רצף. רק מנהל מערכת יכול לבצע פעולה זו.', 'error');
            return;
        }
        const modal = document.getElementById('batchCreditModal');
        if (!modal) return;
        modal.style.display = 'block';
        document.getElementById('batchCreditGadud').value = '';
        document.getElementById('batchCreditCardsList').innerHTML = '<p style="text-align: center; color: #666;">בחר גדוד כדי לראות כרטיסים</p>';
        document.getElementById('executeBatchCreditBtn').style.display = 'none';
    }

    closeBatchCreditModal() {
        const modal = document.getElementById('batchCreditModal');
        if (modal) modal.style.display = 'none';
    }

    loadCardsForBatchCredit() {
        const gadud = document.getElementById('batchCreditGadud').value;
        const cardsList = document.getElementById('batchCreditCardsList');
        const executeBtn = document.getElementById('executeBatchCreditBtn');
        if (!gadud) {
            cardsList.innerHTML = '<p style="text-align: center; color: #666;">בחר גדוד כדי לראות כרטיסים</p>';
            executeBtn.style.display = 'none';
            return;
        }

        const eligibleCards = this.controller.fuelCards.filter((card) =>
            card.gadudNumber === gadud && card.gadudCreditDate && card.status !== 'returned' && card.status !== 'final_return'
        );
        if (eligibleCards.length === 0) {
            cardsList.innerHTML = '<p style="text-align: center; color: #666;">לא נמצאו כרטיסים לזיכוי בגדוד זה</p>';
            executeBtn.style.display = 'none';
            return;
        }

        let html = '<div style="direction: rtl;">';
        html += `<h4 style="margin-bottom: 15px; color: #2c3e50;">נמצאו ${eligibleCards.length} כרטיסים לזיכוי:</h4>`;
        html += '<div style="max-height: 350px; overflow-y: auto;">';
        eligibleCards.forEach((card) => {
            const cardNum = typeof card.cardNumber === 'string' ? parseInt(card.cardNumber, 10) : card.cardNumber;
            const cardName = this.controller.escapeHtml(card.name || 'ללא שם');
            const gadudName = card.gadudName ? this.controller.escapeHtml(card.gadudName) : '';
            const remainingFuelText = card.remainingFuel !== undefined ? this.controller.escapeHtml(String(card.remainingFuel)) : '';
            html += `
                <div style="padding: 12px; margin-bottom: 8px; border: 2px solid #ddd; border-radius: 8px; background: #f9f9f9; display: flex; align-items: center; gap: 15px;">
                    <input type="checkbox" id="batchCreditCard_${cardNum}" value="${cardNum}" style="width: 20px; height: 20px; cursor: pointer;" onchange="fuelCardManager.updateBatchCreditButton()">
                    <label for="batchCreditCard_${cardNum}" style="flex: 1; cursor: pointer; margin: 0;">
                        <strong>כרטיס ${cardNum}</strong> - ${cardName}
                        ${card.gadudName ? `(${gadudName})` : ''}
                        ${card.remainingFuel !== undefined ? `- נשאר: ${remainingFuelText} ליטר` : ''}
                    </label>
                </div>`;
        });
        html += '</div></div>';
        cardsList.innerHTML = html;
        executeBtn.style.display = 'none';
    }

    updateBatchCreditButton() {
        const checkboxes = document.querySelectorAll('#batchCreditCardsList input[type="checkbox"]:checked');
        const executeBtn = document.getElementById('executeBatchCreditBtn');
        if (checkboxes.length > 0) {
            executeBtn.style.display = 'block';
            executeBtn.textContent = `זכה ${checkboxes.length} כרטיסים נבחרים`;
        } else {
            executeBtn.style.display = 'none';
        }
    }

    selectAllBatchCredit() {
        document.querySelectorAll('#batchCreditCardsList input[type="checkbox"]').forEach((cb) => { cb.checked = true; });
        this.updateBatchCreditButton();
    }

    deselectAllBatchCredit() {
        document.querySelectorAll('#batchCreditCardsList input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
        this.updateBatchCreditButton();
    }

    async executeBatchCredit() {
        return this._executeBatch('credit');
    }

    showBatchReturnModal() {
        if (!this.controller.currentUser || !this.controller.currentUser.isAdmin) {
            this.controller.showStatus('אין לך הרשאה לבצע החזרה רצף. רק מנהל מערכת יכול לבצע פעולה זו.', 'error');
            return;
        }
        const modal = document.getElementById('batchReturnModal');
        if (!modal) return;
        modal.style.display = 'block';
        document.getElementById('batchReturnGadud').value = '';
        document.getElementById('batchReturnCardsList').innerHTML = '<p style="text-align: center; color: #666;">בחר גדוד כדי לראות כרטיסים</p>';
        document.getElementById('executeBatchReturnBtn').style.display = 'none';
    }

    closeBatchReturnModal() {
        const modal = document.getElementById('batchReturnModal');
        if (modal) modal.style.display = 'none';
    }

    loadCardsForBatchReturn() {
        const gadud = document.getElementById('batchReturnGadud').value;
        const cardsList = document.getElementById('batchReturnCardsList');
        const executeBtn = document.getElementById('executeBatchReturnBtn');
        if (!gadud) {
            cardsList.innerHTML = '<p style="text-align: center; color: #666;">בחר גדוד כדי לראות כרטיסים</p>';
            executeBtn.style.display = 'none';
            return;
        }

        const eligibleCards = this.controller.fuelCards.filter((card) => {
            const remaining = card.remainingFuel !== undefined && card.remainingFuel !== null ? Number(card.remainingFuel) : null;
            return card.gadudNumber === gadud && card.gadudCreditDate && (remaining === null || remaining === 0) &&
                card.status !== 'returned' && card.status !== 'final_return';
        });

        if (eligibleCards.length === 0) {
            cardsList.innerHTML = '<p style="text-align: center; color: #666;">לא נמצאו כרטיסים להחזרה בגדוד זה (צריך זיכוי גדודי מלא - כמות שנותרה = 0)</p>';
            executeBtn.style.display = 'none';
            return;
        }

        let html = '<div style="direction: rtl;">';
        html += `<h4 style="margin-bottom: 15px; color: #2c3e50;">נמצאו ${eligibleCards.length} כרטיסים להחזרה:</h4>`;
        html += '<div style="max-height: 350px; overflow-y: auto;">';
        eligibleCards.forEach((card) => {
            const cardNum = typeof card.cardNumber === 'string' ? parseInt(card.cardNumber, 10) : card.cardNumber;
            const remaining = card.remainingFuel !== undefined && card.remainingFuel !== null ? Number(card.remainingFuel) : 0;
            const cardName = this.controller.escapeHtml(card.name || 'ללא שם');
            const gadudName = card.gadudName ? this.controller.escapeHtml(card.gadudName) : '';
            const gadudCreditDate = card.gadudCreditDate ? this.controller.escapeHtml(String(card.gadudCreditDate)) : '';
            html += `
                <div style="padding: 12px; margin-bottom: 8px; border: 2px solid #ddd; border-radius: 8px; background: #f9f9f9; display: flex; align-items: center; gap: 15px;">
                    <input type="checkbox" id="batchReturnCard_${cardNum}" value="${cardNum}" style="width: 20px; height: 20px; cursor: pointer;" onchange="fuelCardManager.updateBatchReturnButton()">
                    <label for="batchReturnCard_${cardNum}" style="flex: 1; cursor: pointer; margin: 0;">
                        <strong>כרטיס ${cardNum}</strong> - ${cardName}
                        ${card.gadudName ? `(${gadudName})` : ''}
                        ${remaining === 0 ? '- כמות שנותרה: 0 ליטר ✓' : ''}
                        ${card.gadudCreditDate ? `- זיכוי גדודי: ${gadudCreditDate}` : ''}
                    </label>
                </div>`;
        });
        html += '</div></div>';
        cardsList.innerHTML = html;
        executeBtn.style.display = 'none';
    }

    updateBatchReturnButton() {
        const checkboxes = document.querySelectorAll('#batchReturnCardsList input[type="checkbox"]:checked');
        const executeBtn = document.getElementById('executeBatchReturnBtn');
        if (checkboxes.length > 0) {
            executeBtn.style.display = 'block';
            executeBtn.textContent = `החזר ${checkboxes.length} כרטיסים נבחרים`;
        } else {
            executeBtn.style.display = 'none';
        }
    }

    selectAllBatchReturn() {
        document.querySelectorAll('#batchReturnCardsList input[type="checkbox"]').forEach((cb) => { cb.checked = true; });
        this.updateBatchReturnButton();
    }

    deselectAllBatchReturn() {
        document.querySelectorAll('#batchReturnCardsList input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
        this.updateBatchReturnButton();
    }

    async executeBatchReturn() {
        return this._executeBatch('return');
    }

    async _executeBatch(mode) {
        const selector = mode === 'credit' ? '#batchCreditCardsList input[type="checkbox"]:checked' : '#batchReturnCardsList input[type="checkbox"]:checked';
        const checkboxes = document.querySelectorAll(selector);
        if (checkboxes.length === 0) {
            this.controller.showStatus(mode === 'credit' ? 'לא נבחרו כרטיסים לזיכוי' : 'לא נבחרו כרטיסים להחזרה', 'error');
            return;
        }
        const cardNumbers = Array.from(checkboxes).map((cb) => parseInt(cb.value, 10));
        const actionName = mode === 'credit' ? 'לזכות' : 'להחזיר';
        if (!confirm(`האם אתה בטוח שברצונך ${actionName} ${cardNumbers.length} כרטיסים?\n\nכרטיסים: ${cardNumbers.join(', ')}`)) return;

        this.controller.showStatus(`מבצע ${mode === 'credit' ? 'זיכוי' : 'החזרה'} על ${cardNumbers.length} כרטיסים...`, 'processing');
        let successCount = 0;
        let errorCount = 0;
        const errors = [];
        const cardIndexByNumber = new Map();
        this.controller.fuelCards.forEach((card, idx) => {
            const raw = card ? card.cardNumber : null;
            const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
            if (Number.isFinite(n)) cardIndexByNumber.set(n, idx);
        });

        const concurrency = Math.max(1, Math.min(8, cardNumbers.length));
        let cursor = 0;
        const worker = async () => {
            while (true) {
                const cardNum = cardNumbers[cursor++];
                if (cardNum === undefined) return;
                try {
                    const cardIndex = cardIndexByNumber.get(cardNum);
                    if (cardIndex === undefined) {
                        errors.push(`כרטיס ${cardNum} לא נמצא`);
                        errorCount++;
                        continue;
                    }
                    const card = this.controller.fuelCards[cardIndex];
                    if (card.status === 'returned' || card.status === 'final_return') {
                        errors.push(`כרטיס ${cardNum} כבר הוחזר לגמרי`);
                        errorCount++;
                        continue;
                    }
                    if (mode === 'return') {
                        if (!card.gadudCreditDate) {
                            errors.push(`כרטיס ${cardNum} - לא ניתן להחזיר לפני ביצוע זיכוי גדודי`);
                            errorCount++;
                            continue;
                        }
                        const remaining = card.remainingFuel !== undefined && card.remainingFuel !== null ? Number(card.remainingFuel) : null;
                        if (remaining !== null && (Number.isNaN(remaining) || remaining !== 0)) {
                            errors.push(`כרטיס ${cardNum} - לא ניתן להחזיר לפני זיכוי גדודי מלא (כמות שנותרה חייבת להיות 0)`);
                            errorCount++;
                            continue;
                        }
                    }

                    const now = this.controller.formatDateTime();
                    card.status = 'returned';
                    card.date = now;
                    card.creditDate = now;
                    if (!card.cardChain) card.cardChain = [];
                    card.cardChain.push({
                        action: mode === 'credit' ? 'החזרת כרטיס (זיכוי רצף)' : 'החזרת כרטיס (החזרה רצף)',
                        amount: card.amount,
                        date: now,
                        status: 'returned'
                    });
                    await this.controller.updateCardInFirebase(card);
                    successCount++;
                } catch (error) {
                    errors.push(`כרטיס ${cardNum}: ${error.message}`);
                    errorCount++;
                }
            }
        };

        await Promise.all(Array.from({ length: concurrency }, worker));
        this.controller.renderTable();
        if (mode === 'credit') this.closeBatchCreditModal(); else this.closeBatchReturnModal();
        if (errorCount === 0) {
            this.controller.showStatus(`${mode === 'credit' ? 'זיכוי' : 'החזרה'} הושלמה בהצלחה! ${successCount} כרטיסים ${mode === 'credit' ? 'זוכו' : 'הוחזרו'}.`, 'success');
        } else {
            this.controller.showStatus(`${mode === 'credit' ? 'זיכוי' : 'החזרה'} הושלמה חלקית: ${successCount} הצלחות, ${errorCount} שגיאות.\n${errors.join('\n')}`, 'error');
        }
    }
}

window.BatchOperationsManager = BatchOperationsManager;
