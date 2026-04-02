class FuelCardsDomainService {
    constructor(controller) {
        this.controller = controller;
    }

    async addNewCard(command) {
        if (!this.controller.currentUser || !this.controller.currentUser.isAdmin) {
            this.controller.showStatus('אין לך הרשאה לנפק כרטיסים. רק מנהל מערכת יכול לבצע פעולה זו.', 'error');
            return;
        }

        if (command.fuelType) {
            const allowedFuels = (window.APP_CONSTANTS && window.APP_CONSTANTS.ALLOWED_FUELS)
                ? window.APP_CONSTANTS.ALLOWED_FUELS
                : ['בנזין', 'סולר', 'דיזל', 'גז', 'חשמל', 'היברידי', 'אוריאה'];
            const fuel = command.fuelType.toString().trim();
            if (!allowedFuels.includes(fuel)) {
                this.controller.showStatus('סוג דלק לא תקין - בחר: בנזין, סולר, דיזל, גז, חשמל, היברידי, אוריאה', 'error');
                return;
            }
        }

        const existingIndex = this.controller.fuelCards.findIndex((card) => card.cardNumber === command.cardNumber);
        if (existingIndex !== -1) {
            this.controller.showStatus('כרטיס כבר קיים במערכת', 'error');
            return;
        }

        const issueDate = command.issueDate || this.controller.formatDateTime();
        const newCard = {
            cardNumber: command.cardNumber,
            name: command.name,
            phone: command.phone,
            amount: command.amount,
            fuelType: command.fuelType,
            gadudNumber: command.gadudNumber || '',
            issueDate,
            status: 'new',
            date: issueDate,
            cardChain: [{ action: 'ניפוק ראשוני', amount: command.amount, date: issueDate, status: 'active' }],
            currentHolder: 'system',
            currentHolderName: 'מערכת'
        };

        this.controller.fuelCards.push(newCard);
        await this.controller.addCardToFirebase(newCard);
        this.controller.renderTable();
        this.controller.showStatus('כרטיס חדש נוסף בהצלחה', 'success');
    }

    async updateCard(command) {
        if (!this.controller.currentUser || !this.controller.currentUser.isAdmin) {
            this.controller.showStatus('אין לך הרשאה לעדכן כרטיסים. רק מנהל מערכת יכול לבצע פעולה זו.', 'error');
            return;
        }

        const cardIndex = this.controller.fuelCards.findIndex((card) => card.cardNumber === command.cardNumber);
        if (cardIndex === -1) {
            this.controller.showStatus('כרטיס לא נמצא במערכת', 'error');
            return;
        }

        const card = this.controller.fuelCards[cardIndex];
        card.amount = command.amount;
        card.status = 'updated';
        card.date = this.controller.formatDateTime();
        card.cardChain.push({
            action: 'עדכון כמות',
            amount: command.amount,
            date: this.controller.formatDateTime(),
            status: 'active'
        });

        await this.controller.updateCardInFirebase(card);
        this.controller.renderTable();
        this.controller.showStatus('כרטיס עודכן בהצלחה', 'success');
    }

    async returnCard(command) {
        if (!this.controller.currentUser || !this.controller.currentUser.isAdmin) {
            this.controller.showStatus('אין לך הרשאה להחזיר כרטיסים. רק מנהל מערכת יכול לבצע פעולה זו.', 'error');
            return;
        }

        const cardIndex = this.controller.fuelCards.findIndex((card) => card.cardNumber === command.cardNumber);
        if (cardIndex === -1) {
            this.controller.showStatus('כרטיס לא נמצא במערכת', 'error');
            return;
        }

        const card = this.controller.fuelCards[cardIndex];
        if (card.gadudName || card.gadudNumber) {
            const remaining = card.remainingFuel !== undefined && card.remainingFuel !== null ? Number(card.remainingFuel) : null;
            if (remaining !== null && (Number.isNaN(remaining) || remaining !== 0)) {
                this.controller.showStatus('לא ניתן להחזיר כרטיס לפני זיכוי גדודי מלא (כמות שנותרה חייבת להיות 0)', 'error');
                return;
            }
            if (!card.gadudCreditDate) {
                this.controller.showStatus('לא ניתן להחזיר כרטיס לפני ביצוע זיכוי גדודי (חובה לתעד תאריך זיכוי גדודי)', 'error');
                return;
            }
        }

        card.status = 'returned';
        card.date = this.controller.formatDateTime();
        card.creditDate = command.creditDate || this.controller.formatDateTime();
        card.cardChain.push({
            action: 'החזרת כרטיס',
            amount: card.amount,
            date: this.controller.formatDateTime(),
            status: 'returned'
        });

        await this.controller.updateCardInFirebase(card);
        this.controller.renderTable();
        this.controller.showStatus('כרטיס הוחזר בהצלחה', 'success');
    }

    async addGadudData(cardNumber, gadudName, remainingFuel, gadudIssueDate) {
        if (!this.controller.currentUser) {
            this.controller.showStatus('נדרשת התחברות', 'error');
            return;
        }

        const cardIndex = this.controller.fuelCards.findIndex((card) => card.cardNumber === cardNumber);
        if (cardIndex === -1) {
            this.controller.showStatus('כרטיס לא נמצא במערכת', 'error');
            return;
        }

        const card = this.controller.fuelCards[cardIndex];
        if (card.status === 'returned' || card.status === 'final_return') {
            this.controller.showStatus('לא ניתן לבצע פעולות גדודיות על כרטיס שהוחזר לגמרי (זיכוי סופי)', 'error');
            return;
        }
        if (!this.controller.currentUser.isAdmin && card.gadudNumber !== this.controller.currentUser.gadud) {
            this.controller.showStatus('אין לך הרשאה לערוך כרטיסים של גדודים אחרים', 'error');
            return;
        }

        card.gadudName = gadudName;
        if (typeof remainingFuel !== 'undefined') card.remainingFuel = remainingFuel;
        card.gadudIssueDate = gadudIssueDate || this.controller.formatDateTime();
        card.date = this.controller.formatDateTime();

        await this.controller.updateCardInFirebase(card);
        this.controller.renderTable();
        this.controller.showStatus('נתונים גדודיים נוספו בהצלחה', 'success');
    }

    async updateGadudData(cardNumber, gadudName, remainingFuel) {
        if (!this.controller.currentUser) {
            this.controller.showStatus('נדרשת התחברות', 'error');
            return;
        }

        const cardIndex = this.controller.fuelCards.findIndex((card) => card.cardNumber === cardNumber);
        if (cardIndex === -1) {
            this.controller.showStatus('כרטיס לא נמצא במערכת', 'error');
            return;
        }

        const card = this.controller.fuelCards[cardIndex];
        if (card.status === 'returned' || card.status === 'final_return') {
            this.controller.showStatus('לא ניתן לבצע פעולות גדודיות על כרטיס שהוחזר לגמרי (זיכוי סופי)', 'error');
            return;
        }
        if (!this.controller.currentUser.isAdmin && card.gadudNumber !== this.controller.currentUser.gadud) {
            this.controller.showStatus('אין לך הרשאה לערוך כרטיסים של גדודים אחרים', 'error');
            return;
        }

        card.gadudName = gadudName;
        card.remainingFuel = remainingFuel;
        card.date = this.controller.formatDateTime();

        await this.controller.updateCardInFirebase(card);
        this.controller.renderTable();
        this.controller.showStatus('נתונים גדודיים עודכנו בהצלחה', 'success');
    }

    async clearGadudData(cardNumber, vehicleNumber, gadudCreditDate) {
        if (!this.controller.currentUser) {
            this.controller.showStatus('נדרשת התחברות', 'error');
            return;
        }

        const cardNum = typeof cardNumber === 'string' ? parseInt(cardNumber, 10) : cardNumber;
        const cardIndex = this.controller.fuelCards.findIndex((card) => {
            const cardCardNum = typeof card.cardNumber === 'string' ? parseInt(card.cardNumber, 10) : card.cardNumber;
            return cardCardNum === cardNum;
        });
        if (cardIndex === -1) {
            this.controller.showStatus('כרטיס לא נמצא במערכת', 'error');
            return;
        }

        const card = this.controller.fuelCards[cardIndex];
        if (card.status === 'returned' || card.status === 'final_return') {
            this.controller.showStatus('לא ניתן לבצע פעולות גדודיות על כרטיס שהוחזר לגמרי (זיכוי סופי)', 'error');
            return;
        }
        if (!this.controller.currentUser.isAdmin && card.gadudNumber !== this.controller.currentUser.gadud) {
            this.controller.showStatus('אין לך הרשאה לערוך כרטיסים של גדודים אחרים', 'error');
            return;
        }

        card.gadudName = '';
        card.remainingFuel = 0;
        card.gadudVehicleNumber = vehicleNumber;
        card.gadudCreditDate = gadudCreditDate || this.controller.formatDateTime();
        card.date = this.controller.formatDateTime();

        await this.controller.updateCardInFirebase(card);
        this.controller.renderTable();
        this.controller.showStatus('נתונים גדודיים נמחקו בהצלחה (זיכוי גדודי)', 'success');
    }
}

window.FuelCardsDomainService = FuelCardsDomainService;
