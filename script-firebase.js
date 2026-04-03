class FuelCardManager {
    constructor() {
        console.log('מתחיל את מערכת ניהול כרטיסי הדלק עם Firebase...');
        this.fuelCards = [];
        this.tableColumns = this.loadTableColumns();
        this.authManager = new window.AuthManager(this);
        this.uiManager = new window.FuelCardsUIManager(this);
        this.domainService = new window.FuelCardsDomainService(this);
        this.batchManager = new window.BatchOperationsManager(this);
        this.currentUser = this.authManager.getCurrentUser();
        //time to rendor
        this._filterDebounceTimer = null; 
        this.filterDebounceMs = 200;
       
        // Loaded from `app-constants.js` (see index.html).
        this.adminGadudContacts = (window.APP_CONSTANTS && window.APP_CONSTANTS.ADMIN_GADUD_CONTACTS)
            ? window.APP_CONSTANTS.ADMIN_GADUD_CONTACTS
            : {};

        document.addEventListener('keydown', this.uiManager.handleStatusModalKeydown);    //*
        this.setupGadudAutoFillHandler();
        console.log('עמודות טבלה:', this.tableColumns);
        console.log('משתמש נוכחי:', this.currentUser);

        this.checkLogin();
        this.waitForFirebaseAndInit();
        setTimeout(() => {
            this.updateAdminSortingControls();
        }, 1000);
        console.log('המערכת מוכנה לשימוש!');
        
        this.setupStatusModalListeners();
        
        setTimeout(() => {
            const splashScreen = document.getElementById('splashScreen');
            if (splashScreen && splashScreen.style.display !== 'none') {
                splashScreen.classList.add('fade-out');
                setTimeout(() => {
                    splashScreen.style.display = 'none';
                }, 600);
            }
        }, 3000);

        
        this._remainingFuelClickBound = false;
    }

    setupStatusModalListeners() {
        this.uiManager.setupStatusModalListeners();
    }

    attachModalListeners() {
        this.uiManager.attachModalListeners();
    }

    formatDateTime(value) {
        const options = { dateStyle: 'short', timeStyle: 'short' };
        if (value) {
            const parsed = new Date(value);
            if (!isNaN(parsed.getTime())) {
                return parsed.toLocaleString('he-IL', options);
            }
        }
        return new Date().toLocaleString('he-IL', options);
    }

    async loadDataFromFirebase() {
        try {
            if (!window.db || !window.firebaseGetDocs) {
                console.warn('Firebase לא זמין - ממתין...');
                setTimeout(() => this.loadDataFromFirebase(), 1000);  //polling
                return;
            }
            
            if (window.auth && !window.auth.currentUser) {
                console.warn('⚠️ ממתין להתחברות ל-Firebase Authentication...');
                // נסה שוב אחרי שנייה
                setTimeout(() => this.loadDataFromFirebase(), 1000);
                return;
            }
            
            console.log('טוען נתונים מ-Firebase...');
            
            //  loading state
            this.showLoadingState();
            const cards = await window.FuelCardsService.getFuelCardsForUser(this.currentUser);
            this.fuelCards = cards.map((card) => this.cleanUndefinedValues(card));
            console.log('כרטיסים נטענו מ-Firebase:', this.fuelCards.length);
            this.hideLoadingState();
            this.renderTable();

            if (this.currentUser && this.currentUser.isAdmin) {
                this.updateAdminSortingControls();
            }
        } catch (error) {
            console.error('שגיאה בטעינת נתונים מ-Firebase:', error);
            this.hideLoadingState();
            

            if (error.code === 'permission-denied') {
                this.showStatus('שגיאה: אין הרשאות לגשת לנתונים. ודא שהתחברת עם סיסמת גדוד נכונה.', 'error');

                setTimeout(() => this.loadDataFromFirebase(), 2000);  //add counter
            } else {
                this.showStatus('שגיאה בטעינת נתונים', 'error');
            }
        }
    }
    
    cleanUndefinedValues(obj) {
        if (obj === null || obj === undefined) {
            return {};
        }
        
        const cleaned = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {  //*
                const value = obj[key];

                if (value === undefined) {
                    cleaned[key] = '';
                } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {

                    cleaned[key] = this.cleanUndefinedValues(value);
                } else {
                    cleaned[key] = value;
                }
            }
        }
        return cleaned;
    }
    
     showLoadingState() {     //facade  - DP
        this.uiManager.showLoadingState();
    }
    
    hideLoadingState() {
        this.uiManager.hideLoadingState();
    }

    // ============================================
    // Firebase Authentication
    // ============================================
    
    async waitForFirebaseAndInit() {
        return this.authManager.waitForFirebaseAndInit();
    }

    setupAuthStateListener() {
        return this.authManager.setupAuthStateListener();
    }

    // ============================================
    // פונקציות יעילות ל-Firebase (תיקון קריטי!)
    // ============================================
    // במקום למחוק ולהחזיר הכל, משתמשים בפעולות ספציפיות
    // זה חוסך 99.95% מהשימוש ב-writes!

    // הוספת כרטיס חדש ל-Firebase (רק 1 write!)
    async addCardToFirebase(card) {
        try {
            const docId = await window.FuelCardsService.addCard(card);
            console.log('כרטיס נוסף ל-Firebase:', docId);
            return docId;
        } catch (error) {
            console.error('שגיאה בהוספת כרטיס ל-Firebase:', error);
            this.showStatus('שגיאה בשמירת כרטיס', 'error');
            throw error;
        }
    }

    // עדכון כרטיס קיים ב-Firebase (רק 1 write!)
    async updateCardInFirebase(card) {
        try {
            const updatedId = await window.FuelCardsService.updateCard(card);
            console.log('כרטיס עודכן ב-Firebase:', updatedId);
            return updatedId;
        } catch (error) {
            console.error('שגיאה בעדכון כרטיס ב-Firebase:', error);
            this.showStatus('שגיאה בעדכון כרטיס', 'error');
            throw error;
        }
    }

    // מחיקת כרטיס מ-Firebase (רק 1 write!)
    async deleteCardFromFirebase(cardId) {
        try {
            await window.FuelCardsService.deleteCard(cardId);
            console.log('כרטיס נמחק מ-Firebase:', cardId);
        } catch (error) {
            console.error('שגיאה במחיקת כרטיס מ-Firebase:', error);
            this.showStatus('שגיאה במחיקת כרטיס', 'error');
            throw error;
        }
    }

    // מחיקת כל הכרטיסים (רק למקרים של clearAllData)
    async deleteAllCardsFromFirebase() {
        try {
            await window.FuelCardsService.deleteAllFuelCards();
            console.log('כל הכרטיסים נמחקו מ-Firebase');
        } catch (error) {
            console.error('שגיאה במחיקת כל הכרטיסים מ-Firebase:', error);
            this.showStatus('שגיאה במחיקת נתונים', 'error');
            throw error;
        }
    }

    // שמירת נתונים ל-Firebase (DEPRECATED - משמש רק לגיבוי/תאימות לאחור)
    // ⚠️ פונקציה זו לא יעילה - משתמשת רק במקרים מיוחדים
    async saveDataToFirebase() {
        console.warn('⚠️ שימוש ב-saveDataToFirebase() - לא יעיל! יש להשתמש בפונקציות הספציפיות');
        // שמירה רק למקרים מיוחדים - לא למחוק את הפונקציה לחלוטין
        try {
            await window.FuelCardsService.saveDataToFirebase(this.fuelCards);
            console.log('נתונים נשמרו ל-Firebase בהצלחה (שיטה לא יעילה)');
        } catch (error) {
            console.error('שגיאה בשמירת נתונים ל-Firebase:', error);
            this.showStatus('שגיאה בשמירת נתונים', 'error');
        }
    }

    // הוספת כרטיס חדש
    async addNewCard(command) {
        return this.domainService.addNewCard(command);
    }

    // עדכון כרטיס קיים
    async updateCard(command) {
        return this.domainService.updateCard(command);
    }

    // החזרת כרטיס
    async returnCard(command) {
        return this.domainService.returnCard(command);
    }

    loadTableColumns() {
        const columns = localStorage.getItem('fuelCardColumns');
        if (!columns) {
            const defaultColumns = [
                { id: 'cardNumber', name: 'מספר כרטיס', type: 'number', editable: true, department: 'all' },
                { id: 'name', name: 'שם', type: 'text', editable: true, department: 'all' },
                { id: 'phone', name: 'טלפון', type: 'text', editable: true, department: 'all' },
                { id: 'amount', name: 'כמות (ליטר)', type: 'number', editable: true, department: 'all' },
                { id: 'fuelType', name: 'סוג דלק', type: 'text', editable: true, department: 'all' },
                { id: 'gadudNumber', name: 'מספר גדוד', type: 'select', editable: true, department: 'all', options: ['650', '703', '651', '791', '652', '638', '653', '674'] },
                { id: 'issueDate', name: 'תאריך ניפוק', type: 'date', editable: true, department: 'all' },
                { id: 'creditDate', name: 'תאריך זיכוי', type: 'date', editable: true, department: 'all' },
                { id: 'status', name: 'סטטוס', type: 'text', editable: false, department: 'all' },
                { id: 'gadudName', name: 'שם (ניפוק גדודי)', type: 'text', editable: true, department: 'all' },
                { id: 'remainingFuel', name: 'כמות דלק שנשאר (ניפוק גדודי)', type: 'number', editable: true, department: 'all' },
                { id: 'gadudVehicleNumber', name: 'מספר רכב (זיכוי גדודי)', type: 'text', editable: false, department: 'all' },
                { id: 'gadudIssueDate', name: 'תאריך ניפוק גדודי', type: 'date', editable: true, department: 'all' },
                { id: 'gadudCreditDate', name: 'תאריך זיכוי גדודי', type: 'date', editable: true, department: 'all' }
            ];
            this.saveTableColumns(defaultColumns);
            return defaultColumns;
        }
        

        const existingColumns = JSON.parse(columns);
        const newColumns = [
            { id: 'gadudNumber', name: 'מספר גדוד', type: 'select', editable: true, department: 'all', options: ['650', '703', '651', '791', '652', '638', '653', '674'] },
            { id: 'issueDate', name: 'תאריך ניפוק', type: 'date', editable: true, department: 'all' },
            { id: 'creditDate', name: 'תאריך זיכוי', type: 'date', editable: true, department: 'all' },
            { id: 'gadudName', name: 'שם (ניפוק גדודי)', type: 'text', editable: true, department: 'all' },
            { id: 'remainingFuel', name: 'כמות דלק שנשאר (ניפוק גדודי)', type: 'number', editable: true, department: 'all' },
            { id: 'gadudVehicleNumber', name: 'מספר רכב (זיכוי גדודי)', type: 'text', editable: false, department: 'all' },
            { id: 'gadudIssueDate', name: 'תאריך ניפוק גדודי', type: 'date', editable: true, department: 'all' },
            { id: 'gadudCreditDate', name: 'תאריך זיכוי גדודי', type: 'date', editable: true, department: 'all' }
        ];
        
        let columnsUpdated = false;
        newColumns.forEach(newColumn => {
            if (!existingColumns.find(col => col.id === newColumn.id)) {
                existingColumns.push(newColumn);
                columnsUpdated = true;
            }
        });
        
        if (columnsUpdated) {
            this.saveTableColumns(existingColumns);
        }
        
        return existingColumns;
    }

    saveTableColumns(columns) {
        localStorage.setItem('fuelCardColumns', JSON.stringify(columns));
    }

    // בדיקה אם משתמש יכול לראות עמודה
    canViewColumn(column) {
        return true; // כל המשתמשים יכולים לראות את כל העמודות
    }

    // ערך מספרי של "remainingFuel" כפי שמוצג בטבלה
    // אם אין `remainingFuel` נשווה ל-`amount` (זה תואם ל-getCellValue בעמודת remainingFuel)
    getRemainingFuelValue(card) {
        const fn = window.FuelCardsCellsUI && window.FuelCardsCellsUI.getRemainingFuelValue;
        if (typeof fn === 'function') {
            return fn(card);
        }
        if (!card) return null;
        const value = (card.remainingFuel !== undefined && card.remainingFuel !== null)
            ? card.remainingFuel
            : card.amount;

        const n = Number(value);
        if (!Number.isFinite(n)) return null;
        return n;
    }

    // מניעת XSS כאשר אנחנו מכניסים ערכים מ-DB לתוך HTML
    escapeHtml(value) {
        const fn = window.FuelCardsCellsUI && window.FuelCardsCellsUI.escapeHtml;
        if (typeof fn === 'function') {
            return fn(value);
        }
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/`/g, '&#96;')
            .replace(/=/g, '&#61;')
            .replace(/\//g, '&#47;');
    }

    // קבלת ערך תא
    getCellValue(card, column) {
        const fn = window.FuelCardsCellsUI && window.FuelCardsCellsUI.getCellValue;
        if (typeof fn === 'function') {
            return fn(card, column);
        }
        if (!card || !column) return '';
        
        // פונקציה עזר לניקוי ערך
        const cleanValue = (value) => {
            if (value === undefined || value === null) return '';
            return value;
        };
        
        switch(column.id) {
            case 'cardNumber':
                return cleanValue(card.cardNumber);
            case 'name':
                return cleanValue(card.name);
            case 'phone':
                return cleanValue(card.phone);
            case 'amount':
                return cleanValue(card.amount);
            case 'fuelType':
                return cleanValue(card.fuelType);
            case 'gadudNumber':
                return cleanValue(card.gadudNumber);
            case 'status':
                return this.getStatusText(card.status || '');
            case 'issueDate':
                return cleanValue(card.issueDate || card.date);
            case 'creditDate':
                return cleanValue(card.creditDate);
            case 'gadudIssueDate':
                return cleanValue(card.gadudIssueDate);
            case 'gadudCreditDate':
                return cleanValue(card.gadudCreditDate);
            case 'currentHolder':
                return cleanValue(card.currentHolderName) || 'לא זמין';
            case 'cardChain':
                return this.getCardChainText(card.cardChain);
            case 'gadudName':
                return cleanValue(card.gadudName);
            case 'gadudVehicleNumber':
                return cleanValue(card.gadudVehicleNumber);
            case 'remainingFuel':
                return (card.remainingFuel !== undefined && card.remainingFuel !== null) ? card.remainingFuel : (cleanValue(card.amount));
            default:
                // עמודות מותאמות אישית
                return cleanValue(card[column.id]);
        }
    }

    // קבלת טקסט שרשרת הכרטיס
    getCardChainText(cardChain) {
        const fn = window.FuelCardsCellsUI && window.FuelCardsCellsUI.getCardChainText;
        if (typeof fn === 'function') {
            return fn(cardChain);
        }
        if (!cardChain || cardChain.length === 0) return 'אין היסטוריה';
        
        // אנחנו מחזירים HTML (כולל `<br>`), לכן חייבים לברוח את הטקסט כדי לאפשר rendering בלי XSS.
        return cardChain.map(link => {
            const action = this.escapeHtml(link.action);
            const amount = this.escapeHtml(link.amount);
            const date = this.escapeHtml(link.date);
            return `${action}: ${amount} ליטר (${date})`;
        }).join('<br>');
    }

    // קבלת טקסט סטטוס
    getStatusText(status) {
        const fn = window.FuelCardsCellsUI && window.FuelCardsCellsUI.getStatusText;
        if (typeof fn === 'function') {
            return fn(status);
        }
        if (status === undefined || status === null) {
            return '';
        }
        switch(status) {
            case 'new': return 'חדש';
            case 'updated': return 'עודכן';
            case 'returned': return 'הוחזר';
            default: return status || '';
        }
    }

    // רינדור טבלה
    renderTable() {
        this.uiManager.renderTable();
    }

    renderTableCore() {
        const tbody = document.getElementById('fuelCardsBody');
        tbody.innerHTML = '';

        // Bind event delegation for table cell actions (only once per instance).
        // Handles clicks on the "remainingFuel" cell without inline `onclick`.
        if (!this._remainingFuelClickBound && tbody) {
            tbody.addEventListener('click', (e) => {
                const cell = e.target && e.target.closest
                    ? e.target.closest('[data-action="showGadudCreditConfirmation"]')
                    : null;
                if (!cell) return;

                const cardNumber = cell.getAttribute('data-card-number');
                if (!cardNumber) return;

                // Kept compatible with old behavior: vehicleNumber is empty string.
                this.showGadudCreditConfirmation(cardNumber, '');
            });
            this._remainingFuelClickBound = true;
        }
        
        // עדכון כותרות הטבלה
        this.updateTableHeaders();
        
        // קבל כרטיסים מסוננים לפי הרשאות וחיפוש
        const filteredCards = this.getFilteredAndSearchedCards();
        
        // עדכון תצוגת מספר כרטיסים מסוננים (למנהל)
        this.updateFilteredCardsCount(filteredCards);
        
        // עדכון סטטיסטיקות
        this.updateStats(filteredCards);
        
        // הצג/הסתר empty state
        const emptyState = document.getElementById('tableEmptyState');
        const table = document.getElementById('fuelCardsTable');
        if (filteredCards.length === 0) {
            if (emptyState) emptyState.style.display = 'block';
            if (table) table.style.display = 'none';
        } else {
            if (emptyState) emptyState.style.display = 'none';
            if (table) table.style.display = 'table';
        }
        
        filteredCards.forEach(card => {
            const row = document.createElement('tr');
            
            const renderer = window.FuelCardsTableRenderer;
            if (renderer && typeof renderer.getRowClasses === 'function' && typeof renderer.buildRowContent === 'function') {
                const classes = renderer.getRowClasses(card);
                classes.forEach(cls => row.classList.add(cls));

                const built = renderer.buildRowContent({
                    card,
                    tableColumns: this.tableColumns,
                    canViewColumn: (column) => this.canViewColumn(column),
                    getCellValue: (c, column) => this.getCellValue(c, column),
                    escapeHtml: (v) => this.escapeHtml(v)
                });

                if (built && built.hasAnyContent) {
                    row.innerHTML = built.rowContent;
                    tbody.appendChild(row);
                }
            } else {
                // Fallback - original rendering logic (keeps behavior stable if renderer failed to load)
                // הוספת מחלקת צבע לפי סטטוס
                // ניפוק/עדכון גדודי - צהוב (אם יש נתונים גדודיים)
                if (card.gadudName) {
                    row.classList.add('row-gadud');
                }
                // ניפוק רגיל - אדום
                else if (card.status === 'new') {
                    row.classList.add('row-new');
                }
                // זיכוי רגיל - ירוק
                else if (card.status === 'returned' || card.status === 'final_return') {
                    row.classList.add('row-returned');
                }
                
                // יצירת תוכן השורה לפי העמודות
                let rowContent = '';
                let hasAnyContent = false; // בדיקה אם יש תוכן כלשהו בשורה
                
                this.tableColumns.forEach(column => {
                    // בדוק אם המשתמש יכול לראות את העמודה
                    if (this.canViewColumn(column)) {
                        let cellValue = this.getCellValue(card, column);
                        // ודא ש-cellValue לא undefined או null
                        if (cellValue === undefined || cellValue === null) {
                            cellValue = '';
                        }
                        // המר למחרוזת כדי למנוע בעיות
                        cellValue = String(cellValue);

                        // `cardChain` מגיע עם `<br>` (והטקסט עצמו בורח בתוך getCardChainText),
                        // לכן לא בורחים אותו שוב.
                        const safeCellValue = column.id === 'cardChain'
                            ? cellValue
                            : this.escapeHtml(cellValue);

                        // בדוק אם יש תוכן בתא
                        if (cellValue.trim() !== '') {
                            hasAnyContent = true;
                        }
                        // אם זו עמודת כמות דלק שנשאר, הוסף אפשרות לחיצה לזיכוי גדודי
                        if (column.id === 'remainingFuel') {
                            const cardNumberRaw = card ? card.cardNumber : null;
                            const cardNumberNum = typeof cardNumberRaw === 'string'
                                ? parseInt(cardNumberRaw, 10)
                                : Number(cardNumberRaw);
                            const safeCardNumber = Number.isFinite(cardNumberNum) ? String(cardNumberNum) : '';

                            const isClickable = !!card.gadudName && safeCardNumber !== ''; // רק אם יש נתונים גדודיים + מספר תקין
                            const clickableClass = isClickable ? 'clickable-remaining-fuel' : '';
                            const cursorStyle = isClickable ? 'cursor: pointer;' : '';
                            const title = isClickable ? 'לחץ לזיכוי גדודי (איפוס ל-0)' : '';
                            const actionAttrs = isClickable
                                ? `data-action="showGadudCreditConfirmation" data-card-number="${safeCardNumber}"`
                                : '';
                            rowContent += `<td class="${clickableClass}" style="${cursorStyle}" title="${title}" ${actionAttrs}>${safeCellValue}</td>`;
                        } else {
                            rowContent += `<td>${safeCellValue}</td>`;
                        }
                    }
                });
                
                // הצג את השורה רק אם יש תוכן כלשהו
                if (hasAnyContent) {
                    row.innerHTML = rowContent;
                    tbody.appendChild(row);
                }
            }
        });
        
        // עדכן את פקדי המיון והסינון אחרי רינדור הטבלה (לכל משתמש מחובר)
        if (this.currentUser) {
            this.updateAdminSortingControls();
        }
    }
    
    // בדיקה אם כרטיס תקין (לא ריק)
    isValidCard(card) {
        if (!card) return false;
        // כרטיס נחשב תקין אם יש לו לפחות מספר כרטיס או שם
        const hasCardNumber = card.cardNumber !== undefined && card.cardNumber !== null && card.cardNumber !== '';
        const hasName = card.name !== undefined && card.name !== null && card.name !== '';
        // אם אין גם מספר כרטיס וגם שם, הכרטיס ריק
        return hasCardNumber || hasName;
    }
    
    // סינון וחיפוש כרטיסים
    getFilteredAndSearchedCards() {
        const cards = this.getFilteredCards();

        const statusFilter = document.getElementById('statusFilter');
        const gadudFilter = document.getElementById('gadudFilter');
        const fuelTypeFilter = document.getElementById('fuelTypeFilter');
        const yearFilter = document.getElementById('yearFilter');
        const monthFilter = document.getElementById('monthFilter');
        const searchInput = document.getElementById('searchInput');
        const sortBy = document.getElementById('sortBy');

        const isAdmin = !!(this.currentUser && this.currentUser.isAdmin);
        const statusFilterValue = statusFilter ? statusFilter.value : 'all';
        const gadudFilterValue = gadudFilter ? gadudFilter.value : 'all';
        const fuelTypeFilterValue = fuelTypeFilter ? fuelTypeFilter.value : 'all';
        const yearFilterValue = yearFilter ? yearFilter.value : 'all';
        const monthFilterValue = monthFilter ? monthFilter.value : 'all';
        const searchTerm = (searchInput && searchInput.value && searchInput.value.trim())
            ? searchInput.value.trim().toLowerCase()
            : '';
        const sortByValue = sortBy ? sortBy.value : 'none';

        // Delegation to selection module (safer + more modular).
        if (window.CardsSelectors && window.CardsSelectors.filterAndSearchCards) {
            return window.CardsSelectors.filterAndSearchCards(
                cards,
                {
                    isAdmin,
                    statusFilterValue,
                    gadudFilterValue,
                    fuelTypeFilterValue,
                    yearFilterValue,
                    monthFilterValue,
                    searchTerm,
                    sortByValue
                },
                {
                    isValidCard: (card) => this.isValidCard(card),
                    getRemainingFuelValue: (card) => this.getRemainingFuelValue(card),
                    parseDateString: (dateStr) => this.parseDateString(dateStr),
                    compareDates: (a, b) => this.compareDates(a, b)
                }
            );
        }

        // Fallback (in case cardsSelectors.js didn't load)
        let filtered = cards.filter(card => this.isValidCard(card));

        if (statusFilter && statusFilter.value !== 'all') {
            if (statusFilter.value === 'returned') {
                filtered = filtered.filter(card => card.status === 'returned' || card.status === 'final_return');
            } else if (statusFilter.value === 'not_returned') {
                filtered = filtered.filter(card => card.status !== 'returned' && card.status !== 'final_return');
            } else if (statusFilter.value === 'gadud_credited') {
                filtered = filtered.filter(card => {
                    const remaining = this.getRemainingFuelValue(card);
                    return remaining !== null && remaining === 0;
                });
            } else if (statusFilter.value === 'gadud_not_credited') {
                filtered = filtered.filter(card => {
                    const remaining = this.getRemainingFuelValue(card);
                    return remaining !== null && remaining !== 0;
                });
            }
        }

        if (gadudFilter && gadudFilter.value !== 'all') {
            if (gadudFilter.value === 'no_gadud') {
                filtered = filtered.filter(card => !card.gadudNumber || card.gadudNumber === '');
            } else {
                filtered = filtered.filter(card => card.gadudNumber === gadudFilter.value);
            }
        }

        if (fuelTypeFilter && fuelTypeFilter.value !== 'all') {
            const wantedFuel = fuelTypeFilter.value;
            filtered = filtered.filter(card => {
                const fuel = (card.fuelType || '').toString().trim();
                return fuel === wantedFuel;
            });
        }

        const filterByYear = yearFilter && yearFilter.value !== 'all';
        const filterByMonth = monthFilter && monthFilter.value !== 'all';
        if (filterByYear || filterByMonth) {
            filtered = filtered.filter(card => {
                const dateStr = card.issueDate || card.date || card.creditDate;
                const d = this.parseDateString(dateStr);
                if (!d) return false;
                const year = d.getFullYear().toString();
                const month = (d.getMonth() + 1).toString();
                if (filterByYear && yearFilter.value !== year) return false;
                if (filterByMonth && monthFilter.value !== month) return false;
                return true;
            });
        }

        if (searchInput && searchInput.value && searchInput.value.trim()) {
            const searchTermFallback = searchInput.value.trim().toLowerCase();
            filtered = filtered.filter(card => {
                const cardNumber = (card.cardNumber || '').toString().toLowerCase();
                const name = (card.name || '').toLowerCase();
                const phone = (card.phone || '').toLowerCase();
                return cardNumber.includes(searchTermFallback) ||
                    name.includes(searchTermFallback) ||
                    phone.includes(searchTermFallback);
            });
        }

        if (sortBy && sortBy.value !== 'none') {
            filtered = this.sortCards(filtered, sortBy.value);
        }

        return filtered;
    }
    
    // פונקציה למיון כרטיסים
    sortCards(cards, sortOption) {
        const sortedCards = [...cards];
        
        sortedCards.sort((a, b) => {
            switch(sortOption) {
                case 'date_asc':
                    return this.compareDates(a.issueDate || a.date || '', b.issueDate || b.date || '');
                case 'date_desc':
                    return this.compareDates(b.issueDate || b.date || '', a.issueDate || a.date || '');
                case 'credit_date_asc':
                    return this.compareDates(a.creditDate || '', b.creditDate || '');
                case 'credit_date_desc':
                    return this.compareDates(b.creditDate || '', a.creditDate || '');
                case 'card_number_asc':
                    return (a.cardNumber || 0) - (b.cardNumber || 0);
                case 'card_number_desc':
                    return (b.cardNumber || 0) - (a.cardNumber || 0);
                default:
                    return 0;
            }
        });
        
        return sortedCards;
    }
    
    // פונקציה לעיבוד מחרוזת תאריך לפורמטים שונים
    parseDateString(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return null;
        
        // ניקוי רווחים
        const cleaned = dateStr.trim();
        if (!cleaned) return null;
        
        // ניסיון ראשון: Date רגיל (ISO format, או פורמט סטנדרטי)
        const direct = new Date(cleaned);
        if (!isNaN(direct.getTime())) return direct;
        
        // ניסיון לפורמט dd/mm/yyyy או dd-mm-yyyy או dd.mm.yyyy
        // עם או בלי שעה: hh:mm או hh:mm:ss
        const datePattern = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
        const match = cleaned.match(datePattern);
        
        if (match) {
            const day = parseInt(match[1], 10);
            const month = parseInt(match[2], 10) - 1; // חודשים ב-JS הם 0-11
            let year = parseInt(match[3], 10);
            
            // אם השנה היא 2 ספרות, נניח שזה 20XX
            if (year < 100) {
                year = 2000 + year;
            }
            
            const hour = match[4] ? parseInt(match[4], 10) : 0;
            const minute = match[5] ? parseInt(match[5], 10) : 0;
            const second = match[6] ? parseInt(match[6], 10) : 0;
            
            const parsed = new Date(year, month, day, hour, minute, second);
            if (!isNaN(parsed.getTime())) return parsed;
        }
        
        // ניסיון לפורמט yyyy-mm-dd
        const isoPattern = /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/;
        const isoMatch = cleaned.match(isoPattern);
        if (isoMatch) {
            const year = parseInt(isoMatch[1], 10);
            const month = parseInt(isoMatch[2], 10) - 1;
            const day = parseInt(isoMatch[3], 10);
            const parsed = new Date(year, month, day);
            if (!isNaN(parsed.getTime())) return parsed;
        }
        
        return null;
    }

    // פונקציה להשוואת תאריכים (משופרת)
    compareDates(dateA, dateB) {
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        
        // ניסיון לפרסר את התאריכים
        const parsedA = this.parseDateString(dateA);
        const parsedB = this.parseDateString(dateB);
        
        // אם שניהם לא הצליחו לפרסר, ננסה Date רגיל
        if (!parsedA && !parsedB) {
            const dateAObj = new Date(dateA);
            const dateBObj = new Date(dateB);
            
            if (isNaN(dateAObj.getTime()) && isNaN(dateBObj.getTime())) return 0;
            if (isNaN(dateAObj.getTime())) return 1;
            if (isNaN(dateBObj.getTime())) return -1;
            
            return dateAObj.getTime() - dateBObj.getTime();
        }
        
        // אם אחד מהם לא הצליח לפרסר
        if (!parsedA) return 1;
        if (!parsedB) return -1;
        
        // השוואה בין תאריכים מפורסרים
        return parsedA.getTime() - parsedB.getTime();
    }
    
    // החלת מיון וסינון
    applySortingAndFiltering() {
        this.renderTable();
    }
    
    // איפוס מיון וסינון
    resetSortingAndFiltering() {
        const sortBy = document.getElementById('sortBy');
        const statusFilter = document.getElementById('statusFilter');
        const gadudFilter = document.getElementById('gadudFilter');
        const fuelTypeFilter = document.getElementById('fuelTypeFilter');
        const yearFilter = document.getElementById('yearFilter');
        const monthFilter = document.getElementById('monthFilter');
        
        if (sortBy) sortBy.value = 'none';
        if (statusFilter) statusFilter.value = 'all';
        if (gadudFilter) gadudFilter.value = 'all';
        if (fuelTypeFilter) fuelTypeFilter.value = 'all';
        if (yearFilter) yearFilter.value = 'all';
        if (monthFilter) monthFilter.value = 'all';
        
        this.renderTable();
    }
    
    // סינון טבלה לפי חיפוש
    filterTable() {
        if (this._filterDebounceTimer) {
            clearTimeout(this._filterDebounceTimer);
        }
        this._filterDebounceTimer = setTimeout(() => {
            this.renderTable();
            this._filterDebounceTimer = null;
        }, this.filterDebounceMs);
    }
    
    // עדכון תצוגת מספר כרטיסים מסוננים
    updateFilteredCardsCount(filteredCards) {
        const fn = window.FuelCardsTableUI && window.FuelCardsTableUI.updateFilteredCardsCount;
        if (typeof fn === 'function') {
            return fn({
                filteredCards,
                totalCards: this.fuelCards.length,
                isAdmin: !!(this.currentUser && this.currentUser.isAdmin)
            });
        }

        // Fallback (למקרה שה-UI module לא נטען)
        const countElement = document.getElementById('filteredCardsCount');
        if (!countElement) return;

        const totalCards = this.fuelCards.length;
        const filteredCount = filteredCards.length;

        if (this.currentUser && this.currentUser.isAdmin) {
            if (filteredCount === totalCards) {
                countElement.textContent = `סה"כ כרטיסים: ${totalCards}`;
            } else {
                countElement.textContent = `מוצגים ${filteredCount} מתוך ${totalCards} כרטיסים`;
            }
        } else {
            countElement.textContent = '';
        }
    }
    
    // עדכון סטטיסטיקות
    updateStats(cards) {
        const fn = window.FuelCardsTableUI && window.FuelCardsTableUI.updateStats;
        if (typeof fn === 'function') {
            return fn({ cards });
        }

        // Fallback
        const total = cards.length;
        const active = cards.filter(c => c.status === 'active' || c.status === 'new' || c.status === 'updated').length;
        const newCards = cards.filter(c => c.status === 'new').length;
        const returned = cards.filter(c => c.status === 'returned' || c.status === 'final_return').length;

        const statTotal = document.getElementById('statTotal');
        const statActive = document.getElementById('statActive');
        const statNew = document.getElementById('statNew');
        const statReturned = document.getElementById('statReturned');

        if (statTotal) statTotal.textContent = total;
        if (statActive) statActive.textContent = active;
        if (statNew) statNew.textContent = newCards;
        if (statReturned) statReturned.textContent = returned;
    }

    // עדכון כותרות הטבלה
    updateTableHeaders() {
        this.uiManager.updateTableHeaders();
    }

    updateTableHeadersCore() {
        const fn = window.FuelCardsTableUI && window.FuelCardsTableUI.updateTableHeaders;
        if (typeof fn === 'function') {
            return fn({
                tableColumns: this.tableColumns,
                canViewColumn: (column) => this.canViewColumn(column)
            });
        }

        // Fallback
        const thead = document.querySelector('#fuelCardsTable thead tr');
        if (!thead) return;

        thead.innerHTML = '';

        this.tableColumns.forEach(column => {
            if (this.canViewColumn(column)) {
                const th = document.createElement('th');
                th.textContent = column.name;
                thead.appendChild(th);
            }
        });
    }

    // הצגת הודעות סטטוס
    showStatus(message, type) {
        this.uiManager.showStatus(message, type);
    }

    openStatusModal(message, type = 'info') {
        this.uiManager.openStatusModal(message, type);
    }

    closeStatusModal() {
        this.uiManager.closeStatusModal();
    }

    handleStatusModalKeydown(event) {
        this.uiManager.handleStatusModalKeydown(event);
    }

    setupGadudAutoFillHandler() {
        const gadudSelect = document.getElementById('newGadudNumber');
        if (!gadudSelect || gadudSelect.dataset.autofillAttached === 'true') {
            return;
        }
        gadudSelect.dataset.autofillAttached = 'true';
        gadudSelect.addEventListener('change', () => this.handleGadudSelectionChange());
    }

    handleGadudSelectionChange() {
        if (!this.currentUser || !this.currentUser.isAdmin) {
            return;
        }
        const gadudSelect = document.getElementById('newGadudNumber');
        if (!gadudSelect) return;
        const contact = this.adminGadudContacts[gadudSelect.value];
        if (!contact) {
            return;
        }
        const shouldAutoFill = window.confirm(`האם למלא אוטומטית את שם וטלפון עבור גדוד ${gadudSelect.value}?`);
        if (!shouldAutoFill) {
            return;
        }
        const nameInput = document.getElementById('newName');
        const phoneInput = document.getElementById('newPhone');
        if (nameInput) {
            nameInput.value = contact.name;
        }
        if (phoneInput) {
            phoneInput.value = contact.phone;
        }
    }

    // הורדת Excel
    async downloadExcel() {
        const filteredCards = this.getFilteredAndSearchedCards();
        
        if (filteredCards.length === 0) {
            this.showStatus('אין נתונים להורדה', 'error');
            return;
        }
        
        // טעינת הספרייה אם לא נטענה
        if (typeof XLSX === 'undefined') {
            this.showStatus('טוען ספריית Excel...', 'processing');
            try {
                if (window.loadXLSX) {
                    await window.loadXLSX();
                } else {
                    // נסה לטעון ידנית
                    await new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
                        script.onload = () => resolve();
                        script.onerror = () => {
                            const script2 = document.createElement('script');
                            script2.src = 'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js';
                            script2.onload = () => resolve();
                            script2.onerror = () => reject(new Error('לא ניתן לטעון את ספריית Excel'));
                            document.head.appendChild(script2);
                        };
                        document.head.appendChild(script);
                    });
                }
            } catch (error) {
                this.showStatus('שגיאה בטעינת ספריית Excel. נסה לרענן את הדף.', 'error');
                return;
            }
        }
        
        // בדיקה נוספת שהספרייה נטענה
        if (typeof XLSX === 'undefined') {
            this.showStatus('שגיאה: ספריית Excel לא נטענה. נסה לרענן את הדף.', 'error');
            return;
        }
        
        // יצירת מערך של נתונים ל-Excel
        const excelData = [];
        
        // קבלת העמודות הנראות (כמו בטבלה)
        const visibleColumns = this.tableColumns.filter(column => this.canViewColumn(column));
        
        // הוספת כותרות - לפי העמודות הנראות בטבלה
        const headers = visibleColumns.map(column => column.name);
        excelData.push(headers);
        
        // הוספת הנתונים - לפי העמודות הנראות בטבלה
        filteredCards.forEach(card => {
            const row = visibleColumns.map(column => {
                // עבור עמודת משתמש, נשתמש בפונקציה מיוחדת
                if (column.id === 'user') {
                    return this.getUserInfo(card).replace(/<br>/g, ' | ');
                }
                // עבור כל שאר העמודות, נשתמש ב-getCellValue
                return this.getCellValue(card, column);
            });
            excelData.push(row);
        });
        
        // יצירת workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(excelData);
        
        // הגדרת רוחב עמודות - לפי מספר העמודות
        const colWidths = visibleColumns.map(() => ({ wch: 18 }));
        ws['!cols'] = colWidths;
        
        // הוספת גיליון ל-workbook
        XLSX.utils.book_append_sheet(wb, ws, 'כרטיסי דלק');
        
        // הורדת הקובץ
        const fileName = `fuel_cards_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        this.showStatus('קובץ Excel הורד בהצלחה', 'success');
    }

    // הוספת נתונים גדודיים לכרטיס
    async addGadudData(cardNumber, gadudName, remainingFuel, gadudIssueDate) {
        return this.domainService.addGadudData(cardNumber, gadudName, remainingFuel, gadudIssueDate);
    }

    // עדכון נתונים גדודיים לכרטיס
    async updateGadudData(cardNumber, gadudName, remainingFuel) {
        return this.domainService.updateGadudData(cardNumber, gadudName, remainingFuel);
    }

    // מחיקת נתונים גדודיים מכרטיס (זיכוי גדודי)
    async clearGadudData(cardNumber, vehicleNumber, gadudCreditDate) {
        return this.domainService.clearGadudData(cardNumber, vehicleNumber, gadudCreditDate);
    }

    // הצגת חלונית אישור לזיכוי גדודי
    showGadudCreditConfirmation(cardNumber, vehicleNumber, gadudCreditDate) {
        // הסתר את הממשק הראשי
        const container = document.querySelector('.container') || document.getElementById('mainContainer');
        if (container) container.style.display = 'none';
        
        // צור/הצג חלונית אישור
        let confirmationDialog = document.getElementById('gadudCreditConfirmationDialog');
        if (!confirmationDialog) {
            confirmationDialog = this.createGadudCreditConfirmationDialog();
            document.body.appendChild(confirmationDialog);
        }
        
        // שמור את הפרטים לחלונית
        confirmationDialog.setAttribute('data-card-number', cardNumber);
        confirmationDialog.setAttribute('data-vehicle-number', vehicleNumber);
        confirmationDialog.setAttribute('data-credit-date', gadudCreditDate);
        confirmationDialog.style.display = 'block';
        // החזר תצוגה ל-backdrop (בפתיחה שנייה אחרי סגירה הוא נשאר display:none)
        const backdrop = confirmationDialog.querySelector('div[style*="position: fixed"]');
        if (backdrop) backdrop.style.display = 'flex';

        this.bindGadudCreditConfirmationDialogEvents(confirmationDialog);
    }

    bindGadudCreditConfirmationDialogEvents(dialog) {
        if (!dialog) return;
        if (dialog.dataset.actionsBound === 'true') return;

        const confirmBtn = dialog.querySelector('[data-dialog-action="confirmGadudCredit"]');
        const cancelBtn = dialog.querySelector('[data-dialog-action="cancelGadudCredit"]');

        if (confirmBtn) {
            confirmBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.confirmGadudCredit();
            });
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelGadudCredit();
            });
        }

        dialog.dataset.actionsBound = 'true';
    }

    createGadudCreditConfirmationDialog() {
        const factory = window.FuelCardDialogs && window.FuelCardDialogs.createGadudCreditConfirmationDialog;
        if (factory) return factory();

        // Fallback למניעת קריסה אם ה-script לא נטען
        const dialog = document.createElement('div');
        dialog.id = 'gadudCreditConfirmationDialog';
        dialog.innerHTML = '<div style="padding:20px; direction: rtl;">לא ניתן לטעון את חלונית הזיכוי.</div>';
        return dialog;
    }

    confirmGadudCredit() {
        const dialog = document.getElementById('gadudCreditConfirmationDialog');
        if (!dialog) return;
        
        const cardNumber = dialog.getAttribute('data-card-number');
        const vehicleNumber = dialog.getAttribute('data-vehicle-number');
        const gadudCreditDate = dialog.getAttribute('data-credit-date');
        
        // סגור את החלונית
        dialog.style.display = 'none';
        // הסתר גם את הרקע
        const backdrop = dialog.querySelector('div[style*="position: fixed"]');
        if (backdrop) {
            backdrop.style.display = 'none';
        }
        const container = document.querySelector('.container') || document.getElementById('mainContainer');
        if (container) container.style.display = 'block';
        
        // ביצוע הזיכוי
        this.clearGadudData(cardNumber, vehicleNumber, gadudCreditDate);
        hideTypingForm();
        clearGadudReturnForm();
    }

    cancelGadudCredit() {
        const dialog = document.getElementById('gadudCreditConfirmationDialog');
        if (!dialog) return;
        
        // סגור את החלונית
        dialog.style.display = 'none';
        // הסתר גם את הרקע
        const backdrop = dialog.querySelector('div[style*="position: fixed"]');
        if (backdrop) {
            backdrop.style.display = 'none';
        }
        const container = document.querySelector('.container') || document.getElementById('mainContainer');
        if (container) container.style.display = 'block';
        
        // הצג הודעה
        this.showStatus('זיכוי גדודי בוטל', 'error');
    }

    // מערכת התחברות והרשאות
    getCurrentUser() {
        return this.authManager.getCurrentUser();
    }

    setCurrentUser(user) {
        this.authManager.setCurrentUser(user);
    }

    async logout() {
        return this.authManager.logout();
    }

    checkLogin() {    //Facade Pattern
        this.authManager.checkLogin();
    }

    showLoginForm() {
        this.uiManager.showLoginForm();
    }

    showMainInterface() {
        this.uiManager.showMainInterface();
    }

    async login() {
        return this.authManager.login();
    }

    showLoginStatus(message, type) {
        this.uiManager.showLoginStatus(message, type);
    }

    updateInterfaceByPermissions() {
        this.uiManager.updateInterfaceByPermissions();
    }
    
    // עדכון פקדי מיון וסינון לכל משתמש מחובר
    updateAdminSortingControls() {
        this.uiManager.updateAdminSortingControls();
    }

    // עדכון נראות כפתורים לפי הרשאות
    updateButtonVisibility() {
        this.uiManager.updateButtonVisibility();
    }

    // סינון כרטיסים לפי הרשאות
    getFilteredCards() {
        if (!this.currentUser) return [];
        
        if (this.currentUser.isAdmin) {
            // מנהל רואה הכל
            return this.fuelCards;
        } else {
            // משתמש רגיל רואה רק את הגדוד שלו
            return this.fuelCards.filter(card => 
                card.gadudNumber === this.currentUser.gadud
            );
        }
    }

    // זיכוי רצף - פתיחת modal
    showBatchCreditModal() {
        return this.batchManager.showBatchCreditModal();
    }

    // זיכוי רצף - סגירת modal
    closeBatchCreditModal() {
        return this.batchManager.closeBatchCreditModal();
    }

    // זיכוי רצף - טעינת כרטיסים לפי גדוד
    loadCardsForBatchCredit() {
        return this.batchManager.loadCardsForBatchCredit();
    }

    // עדכון נראות כפתור ביצוע זיכוי
    updateBatchCreditButton() {
        return this.batchManager.updateBatchCreditButton();
    }

    // בחירת כל הכרטיסים
    selectAllBatchCredit() {
        return this.batchManager.selectAllBatchCredit();
    }

    // ביטול בחירת כל הכרטיסים
    deselectAllBatchCredit() {
        return this.batchManager.deselectAllBatchCredit();
    }

    // ביצוע זיכוי על כל הכרטיסים שנבחרו
    async executeBatchCredit() {
        return this.batchManager.executeBatchCredit();
    }

    // החזרה רצף - פתיחת modal
    showBatchReturnModal() {
        return this.batchManager.showBatchReturnModal();
    }

    // החזרה רצף - סגירת modal
    closeBatchReturnModal() {
        return this.batchManager.closeBatchReturnModal();
    }

    // החזרה רצף - טעינת כרטיסים לפי גדוד
    loadCardsForBatchReturn() {
        return this.batchManager.loadCardsForBatchReturn();
    }

    // עדכון נראות כפתור ביצוע החזרה
    updateBatchReturnButton() {
        return this.batchManager.updateBatchReturnButton();
    }

    // בחירת כל הכרטיסים להחזרה
    selectAllBatchReturn() {
        return this.batchManager.selectAllBatchReturn();
    }

    // ביטול בחירת כל הכרטיסים להחזרה
    deselectAllBatchReturn() {
        return this.batchManager.deselectAllBatchReturn();
    }

    // ביצוע החזרה על כל הכרטיסים שנבחרו
    async executeBatchReturn() {
        return this.batchManager.executeBatchReturn();
    }

    showSystemInfo() {
        const totalCards = this.fuelCards.length;
        const cardsByGadud = {};
        
        this.fuelCards.forEach(card => {
            const gadud = card.gadudNumber || 'ללא גדוד';
            cardsByGadud[gadud] = (cardsByGadud[gadud] || 0) + 1;
        });

        let info = `סה"כ כרטיסים: ${totalCards}\n\n`;
        info += 'כרטיסים לפי גדוד:\n';
        Object.keys(cardsByGadud).forEach(gadud => {
            info += `גדוד ${gadud}: ${cardsByGadud[gadud]} כרטיסים\n`;
        });

        alert(info);
    }

    // הצגת טופס עריכת כרטיס (עם אימות סיסמה)
    showEditCardForm() {
        if (!this.currentUser || !this.currentUser.isAdmin) {
            this.showStatus('אין לך הרשאה לערוך כרטיסים', 'error');
            return;
        }

        // הצג חלונית אימות סיסמה
        this.showEditCardPasswordDialog();
    }

    // הצגת חלונית אימות סיסמה לעריכה
    showEditCardPasswordDialog() {
        // הסתר את הממשק הראשי
        const container = document.querySelector('.container') || document.getElementById('mainContainer');
        if (container) container.style.display = 'none';
        
        // צור/הצג חלונית סיסמה
        let passwordDialog = document.getElementById('editCardPasswordDialog');
        if (!passwordDialog) {
            passwordDialog = this.createEditCardPasswordDialog();
            document.body.appendChild(passwordDialog);
        }
        
        passwordDialog.style.display = 'block';
        // החזר תצוגה ל-backdrop (בפתיחה שנייה אחרי ביטול הוא נשאר display:none)
        const pwdBackdrop = passwordDialog.querySelector('div[style*="position: fixed"]');
        if (pwdBackdrop) pwdBackdrop.style.display = 'flex';
        // נקה את שדה הסיסמה
        const passwordInput = document.getElementById('editCardPassword');
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.focus();
        }

        this.bindEditCardPasswordDialogEvents(passwordDialog);
    }

    bindEditCardPasswordDialogEvents(dialog) {
        if (!dialog) return;
        if (dialog.dataset.actionsBound === 'true') return;

        const confirmBtn = dialog.querySelector('[data-dialog-action="verifyEditCardPassword"]');
        const cancelBtn = dialog.querySelector('[data-dialog-action="cancelEditCardPassword"]');
        const passwordInput = dialog.querySelector('#editCardPassword');

        if (confirmBtn) {
            confirmBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.verifyEditCardPassword();
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelEditCardPassword();
            });
        }

        if (passwordInput) {
            passwordInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.verifyEditCardPassword();
                }
            });
        }

        dialog.dataset.actionsBound = 'true';
    }

    // יצירת חלונית אימות סיסמה
    createEditCardPasswordDialog() {
        const factory = window.FuelCardDialogs && window.FuelCardDialogs.createEditCardPasswordDialog;
        if (factory) return factory();

        const dialog = document.createElement('div');
        dialog.id = 'editCardPasswordDialog';
        dialog.innerHTML = '<div style="padding:20px; direction: rtl;">לא ניתן לטעון את חלון אימות הסיסמה.</div>';
        return dialog;
    }

    // אימות סיסמה לעריכה (כולל מניעת הרצה כפולה – Enter + לחיצה)
    async verifyEditCardPassword() {
        if (this._verifyingEditPassword) return;
        this._verifyingEditPassword = true;

        try {
            const passwordInput = document.getElementById('editCardPassword');
            const statusDiv = document.getElementById('editCardPasswordStatus');

            if (!passwordInput) return;

            if (!this.currentUser || !this.currentUser.isAdmin) {
                if (statusDiv) {
                    statusDiv.textContent = 'אין לך הרשאה לערוך כרטיסים';
                    statusDiv.style.background = '#f8d7da';
                    statusDiv.style.color = '#721c24';
                    statusDiv.style.border = '1px solid #f5c6cb';
                    statusDiv.style.display = 'block';
                }
                passwordInput.value = '';
                passwordInput.focus();
                return;
            }

            const password = passwordInput.value.trim();
            if (!password) return;

            const userEmail = this.currentUser && this.currentUser.name ? String(this.currentUser.name) : '';
            if (!window.reauthenticateWithCredential || !window.EmailAuthProvider || !window.auth || !window.auth.currentUser || !userEmail) {
                this.showStatus('שגיאה: Firebase Auth לא זמין', 'error');
                return;
            }

            try {
                // אימות מול Firebase Auth (reauth) במקום סיסמה קבועה בקוד.
                const credential = window.EmailAuthProvider.credential(userEmail, password);
                await window.reauthenticateWithCredential(window.auth.currentUser, credential);
            } catch (error) {
                console.error('שגיאה באימות סיסמה לעריכת כרטיס:', error);
                if (statusDiv) {
                    statusDiv.textContent = 'סיסמה שגויה';
                    statusDiv.style.background = '#f8d7da';
                    statusDiv.style.color = '#721c24';
                    statusDiv.style.border = '1px solid #f5c6cb';
                    statusDiv.style.display = 'block';
                }
                passwordInput.value = '';
                passwordInput.focus();
                return;
            }

            const passwordDialog = document.getElementById('editCardPasswordDialog');
            if (passwordDialog) {
                passwordDialog.style.display = 'none';
            }

            try {
                this.showEditCardFormDialog();
            } catch (err) {
                console.error('שגיאה בפתיחת טופס עריכה:', err);
                const container = document.querySelector('.container') || document.getElementById('mainContainer');
                if (container) container.style.display = 'block';
                this.showStatus('שגיאה בפתיחת טופס עריכה. נסה לרענן את הדף.', 'error');
            }
        } finally {
            this._verifyingEditPassword = false;
        }
    }

    // ביטול אימות סיסמה (מסתירים רק את המעטפת – לא את ה-backdrop – כדי שפתיחה שנייה תעבוד)
    cancelEditCardPassword() {
        const passwordDialog = document.getElementById('editCardPasswordDialog');
        if (passwordDialog) {
            passwordDialog.style.display = 'none';
        }
        const container = document.querySelector('.container') || document.getElementById('mainContainer');
        if (container) container.style.display = 'block';
    }

    // הצגת טופס עריכת כרטיס
    showEditCardFormDialog() {
        const container = document.querySelector('.container') || document.getElementById('mainContainer');
        let editForm = document.getElementById('editCardFormDialog');
        if (!editForm) {
            editForm = this.createEditCardFormDialog();
            document.body.appendChild(editForm);
        }
        
        // ניקוי בטוח – רק ערכי שדות, בלי תלות בפונקציות גלובליות שעלולות לזרוק
        const ids = ['editCardSearchNumber', 'editCardNumber', 'editName', 'editPhone', 'editFuelType', 'editGadudNumber'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el && el.value !== undefined) el.value = '';
        });
        const formFields = document.getElementById('editCardFormFields');
        if (formFields) {
            formFields.style.display = 'none';
            formFields.removeAttribute('data-original-card-number');
        }
        const editStatus = document.getElementById('editCardStatus');
        if (editStatus) {
            editStatus.style.display = 'none';
            editStatus.textContent = '';
        }
        
        editForm.style.display = 'block';
        const backdrop = editForm.querySelector('div[style*="position: fixed"]');
        if (backdrop) backdrop.style.display = 'flex';
        if (container) container.style.display = 'none';

        this.bindEditCardFormDialogEvents(editForm);
    }

    bindEditCardFormDialogEvents(dialog) {
        if (!dialog) return;
        if (dialog.dataset.actionsBound === 'true') return;

        const searchInput = dialog.querySelector('#editCardSearchNumber');
        const searchBtn = dialog.querySelector('[data-dialog-action="searchCardForEdit"]');
        const submitBtn = dialog.querySelector('[data-dialog-action="submitEditCard"]');
        const cancelBtn = dialog.querySelector('[data-dialog-action="cancelEditCard"]');

        if (searchBtn) {
            searchBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.searchCardForEdit();
            });
        }

        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.searchCardForEdit();
                }
            });
        }

        if (submitBtn) {
            submitBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.submitEditCard();
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelEditCard();
            });
        }

        // Bind fuel type selector inside the edit dialog (replaces inline onclick/oninput).
        const fuelSelector = dialog.querySelector('[data-fuel-selector]');
        if (fuelSelector && fuelSelector.dataset && fuelSelector.dataset.fuelSelector) {
            const inputId = fuelSelector.dataset.fuelSelector;
            const fuelButtons = fuelSelector.querySelectorAll('[data-fuel-value]');

            fuelButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const value = btn.dataset ? btn.dataset.fuelValue : undefined;
                    if (window.selectFuelType && typeof window.selectFuelType === 'function') {
                        window.selectFuelType(inputId, value, btn);
                    }
                });
            });

            const customInput = dialog.querySelector(`#${inputId}`);
            if (customInput) {
                customInput.addEventListener('input', () => {
                    if (window.handleCustomFuelInput && typeof window.handleCustomFuelInput === 'function') {
                        window.handleCustomFuelInput(inputId);
                    }
                });
            }
        }

        dialog.dataset.actionsBound = 'true';
    }

    // יצירת טופס עריכת כרטיס
    createEditCardFormDialog() {
        const factory = window.FuelCardDialogs && window.FuelCardDialogs.createEditCardFormDialog;
        if (factory) return factory();

        const dialog = document.createElement('div');
        dialog.id = 'editCardFormDialog';
        dialog.innerHTML = '<div style="padding:20px; direction: rtl;">לא ניתן לטעון את טופס עריכת הכרטיס.</div>';
        return dialog;
    }

    // חיפוש כרטיס לעריכה
    searchCardForEdit() {
        const searchInput = document.getElementById('editCardSearchNumber');
        const formFields = document.getElementById('editCardFormFields');
        const statusDiv = document.getElementById('editCardStatus');
        
        if (!searchInput || !formFields) return;
        
        const cardNumber = parseInt(searchInput.value.trim());
        
        if (!cardNumber) {
            if (statusDiv) {
                statusDiv.textContent = 'יש להכניס מספר כרטיס';
                statusDiv.style.background = '#f8d7da';
                statusDiv.style.color = '#721c24';
                statusDiv.style.display = 'block';
            }
            return;
        }
        
        // חפש את הכרטיס
        const card = this.fuelCards.find(c => c.cardNumber === cardNumber);
        
        if (!card) {
            if (statusDiv) {
                statusDiv.textContent = 'כרטיס לא נמצא במערכת';
                statusDiv.style.background = '#f8d7da';
                statusDiv.style.color = '#721c24';
                statusDiv.style.display = 'block';
            }
            formFields.style.display = 'none';
            return;
        }
        
        // מצא את הכרטיס - מלא את הטופס
        const cardNumberInput = document.getElementById('editCardNumber');
        const nameInput = document.getElementById('editName');
        const phoneInput = document.getElementById('editPhone');
        const fuelTypeInput = document.getElementById('editFuelType');
        const gadudSelect = document.getElementById('editGadudNumber');
        
        if (cardNumberInput) cardNumberInput.value = card.cardNumber || '';
        if (nameInput) nameInput.value = card.name || '';
        if (phoneInput) phoneInput.value = card.phone || '';
        if (fuelTypeInput) {
            fuelTypeInput.value = card.fuelType || '';
            // עדכן את בורר סוג הדלק
            if (card.fuelType) {
                const fuelType = card.fuelType.trim();
                if (['בנזין', 'סולר', 'אוריאה'].includes(fuelType)) {
                    selectFuelType('editFuelType', fuelType);
                } else {
                    selectFuelType('editFuelType', 'other');
                }
            }
        }
        if (gadudSelect) gadudSelect.value = card.gadudNumber || '';
        
        // שמור את מספר הכרטיס המקורי לעריכה
        formFields.setAttribute('data-original-card-number', cardNumber);
        
        // הצג את שדות הטופס
        formFields.style.display = 'block';
        
        if (statusDiv) {
            statusDiv.textContent = 'כרטיס נמצא - ניתן לערוך';
            statusDiv.style.background = '#d4edda';
            statusDiv.style.color = '#155724';
            statusDiv.style.display = 'block';
        }
    }

    // שליחת טופס עריכה
    async submitEditCard() {
        const formFields = document.getElementById('editCardFormFields');
        const statusDiv = document.getElementById('editCardStatus');
        
        if (!formFields || formFields.style.display === 'none') {
            if (statusDiv) {
                statusDiv.textContent = 'יש לחפש כרטיס קודם';
                statusDiv.style.background = '#f8d7da';
                statusDiv.style.color = '#721c24';
                statusDiv.style.display = 'block';
            }
            return;
        }
        
        const originalCardNumber = parseInt(formFields.getAttribute('data-original-card-number'));
        const newCardNumber = parseInt(document.getElementById('editCardNumber').value);
        const name = document.getElementById('editName').value.trim();
        const phone = document.getElementById('editPhone').value.trim();
        const fuelType = document.getElementById('editFuelType').value.trim();
        const gadudNumber = document.getElementById('editGadudNumber').value;
        
        if (!newCardNumber || !fuelType) {
            if (statusDiv) {
                statusDiv.textContent = 'יש למלא מספר כרטיס וסוג דלק';
                statusDiv.style.background = '#f8d7da';
                statusDiv.style.color = '#721c24';
                statusDiv.style.display = 'block';
            }
            return;
        }
        
        // מצא את הכרטיס
        const cardIndex = this.fuelCards.findIndex(c => c.cardNumber === originalCardNumber);
        
        if (cardIndex === -1) {
            if (statusDiv) {
                statusDiv.textContent = 'כרטיס לא נמצא במערכת';
                statusDiv.style.background = '#f8d7da';
                statusDiv.style.color = '#721c24';
                statusDiv.style.display = 'block';
            }
            return;
        }
        
        // בדיקה אם מספר הכרטיס החדש כבר קיים (אם שונה)
        if (newCardNumber !== originalCardNumber) {
            const existingCard = this.fuelCards.find(c => c.cardNumber === newCardNumber);
            if (existingCard) {
                if (statusDiv) {
                    statusDiv.textContent = 'מספר כרטיס זה כבר קיים במערכת';
                    statusDiv.style.background = '#f8d7da';
                    statusDiv.style.color = '#721c24';
                    statusDiv.style.display = 'block';
                }
                return;
            }
        }
        
        // עדכן את הכרטיס
        this.fuelCards[cardIndex].cardNumber = newCardNumber;
        this.fuelCards[cardIndex].name = name || this.fuelCards[cardIndex].name || '';
        this.fuelCards[cardIndex].phone = phone || this.fuelCards[cardIndex].phone || '';
        this.fuelCards[cardIndex].fuelType = fuelType;
        this.fuelCards[cardIndex].gadudNumber = gadudNumber || '';
        this.fuelCards[cardIndex].date = this.formatDateTime();
        
        // שמירה יעילה - רק 1 write במקום 2,000!
        await this.updateCardInFirebase(this.fuelCards[cardIndex]);
        this.renderTable();
        
        // סגור את הטופס
        this.cancelEditCard();
        
        this.showStatus('כרטיס עודכן בהצלחה', 'success');
    }

    // ביטול עריכה (מסתירים רק את המעטפת – לא את ה-backdrop – כדי שפתיחה שנייה תעבוד)
    cancelEditCard() {
        const editForm = document.getElementById('editCardFormDialog');
        if (editForm) {
            editForm.style.display = 'none';
        }
        const container = document.querySelector('.container') || document.getElementById('mainContainer');
        if (container) container.style.display = 'block';
        try {
            this.clearEditCardForm();
        } catch (e) {
            console.warn('clearEditCardForm בביטול:', e);
        }
    }

    // ניקוי טופס עריכה (עם הגנה מפני אלמנטים שטרם קיימים ב-DOM)
    clearEditCardForm() {
        const searchInput = document.getElementById('editCardSearchNumber');
        const cardNumberInput = document.getElementById('editCardNumber');
        const nameInput = document.getElementById('editName');
        const phoneInput = document.getElementById('editPhone');
        const fuelTypeInput = document.getElementById('editFuelType');
        const gadudSelect = document.getElementById('editGadudNumber');
        const formFields = document.getElementById('editCardFormFields');
        const statusDiv = document.getElementById('editCardStatus');
        
        if (searchInput) searchInput.value = '';
        if (cardNumberInput) cardNumberInput.value = '';
        if (nameInput) nameInput.value = '';
        if (phoneInput) phoneInput.value = '';
        if (fuelTypeInput) {
            fuelTypeInput.value = '';
            if (typeof resetFuelTypeSelector === 'function') {
                try { resetFuelTypeSelector('editFuelType'); } catch (e) { console.warn(e); }
            }
        }
        if (gadudSelect) gadudSelect.value = '';
        if (formFields) {
            formFields.style.display = 'none';
            formFields.removeAttribute('data-original-card-number');
        }
        if (statusDiv) {
            statusDiv.style.display = 'none';
            statusDiv.textContent = '';
        }
    }

    // פונקציות עזר
    getUserInfo(card) {
        return 'מערכת';
    }
}

// אתחול המערכת
console.log('מתחיל לטעון את המערכת...');
const fuelCardManager = new FuelCardManager();
// הגדר גם ב-window כדי שה-onclick handlers יעבדו
window.fuelCardManager = fuelCardManager;

// פונקציות גלובליות
function showTypingForm(action) {
    console.log('מציג טופס הקלדה עבור:', action);
    
    // הסתר כל הטופסים
    hideAllTypingForms();
    
    // הצג את הטופס המתאים
    if (action === 'new') {
        document.getElementById('newCardForm').style.display = 'block';
    } else if (action === 'update') {
        document.getElementById('updateCardForm').style.display = 'block';
    } else if (action === 'return') {
        document.getElementById('returnCardForm').style.display = 'block';
    } else if (action === 'gadud_new') {
        document.getElementById('gadudNewForm').style.display = 'block';
    } else if (action === 'gadud_update') {
        document.getElementById('gadudUpdateForm').style.display = 'block';
    } else if (action === 'gadud_return') {
        document.getElementById('gadudReturnForm').style.display = 'block';
    }
    
    // גלילה לטופס
    setTimeout(() => {
        const form = document.querySelector('.typing-form[style*="block"]');
        if (form) {
            form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);

}

// הסתרת כל הטופסים
function hideAllTypingForms() {
    const forms = document.querySelectorAll('.typing-form');
    forms.forEach(form => {
        form.style.display = 'none';
    });
}

// הסתרת טופס הקלדה - ומחזיר תצוגה למסך הראשי (מונע מסך לבן)
function hideTypingForm() {
    hideAllTypingForms();
    const container = document.querySelector('.container') || document.getElementById('mainContainer');
    if (container) container.style.display = 'block';
}

// שליחת טופס ניפוק כרטיס חדש
async function submitNewCard() {
    console.log('שולח טופס ניפוק כרטיס חדש');
    
    const cardNumber = document.getElementById('newCardNumber').value;
    const name = document.getElementById('newName').value;
    const phone = document.getElementById('newPhone').value;
    const amount = document.getElementById('newAmount').value;
    const fuelType = document.getElementById('newFuelType').value;
    const gadudNumber = document.getElementById('newGadudNumber').value;
    const issueDateInput = document.getElementById('newIssueDate').value;
    const issueDate = fuelCardManager.formatDateTime(issueDateInput);
    
    // בדיקת שדות חובה
    if (!cardNumber || !name || !phone || !amount || !fuelType) {
        fuelCardManager.showStatus('יש למלא את כל השדות החובה', 'error');
        return;
    }
    
    // יצירת פקודה
    const command = {
        type: 'new',
        cardNumber: parseInt(cardNumber),
        name: name.trim(),
        phone: phone.trim(),
        amount: parseInt(amount),
        fuelType: fuelType.trim(),
        gadudNumber: gadudNumber || '',
        issueDate: issueDate
    };
    
    console.log('פקודה נוצרה:', command);
    
    try {
        await fuelCardManager.addNewCard(command);
        hideTypingForm();
        clearNewCardForm();
    } catch (error) {
        console.log('שגיאה בהוספת כרטיס:', error);
        fuelCardManager.showStatus('שגיאה בהוספת הכרטיס: ' + error.message, 'error');
        hideTypingForm();
    }
}

// שליחת טופס עדכון כרטיס
async function submitUpdateCard() {
    console.log('שולח טופס עדכון כרטיס');
    
    const cardNumber = document.getElementById('updateCardNumber').value;
    const amount = document.getElementById('updateAmount').value;
    
    // בדיקת שדות חובה
    if (!cardNumber || !amount) {
        fuelCardManager.showStatus('יש למלא את כל השדות', 'error');
        return;
    }
    
    // יצירת פקודה
    const command = {
        type: 'update',
        cardNumber: parseInt(cardNumber),
        amount: parseInt(amount)
    };
    
    console.log('פקודה נוצרה:', command);
    
    try {
        await fuelCardManager.updateCard(command);
        hideTypingForm();
        clearUpdateCardForm();
    } catch (error) {
        console.log('שגיאה בעדכון כרטיס:', error);
        fuelCardManager.showStatus('שגיאה בעדכון הכרטיס: ' + error.message, 'error');
        hideTypingForm();
    }
}

// שליחת טופס החזרת כרטיס
async function submitReturnCard() {
    console.log('שולח טופס החזרת כרטיס');
    
    const cardNumber = document.getElementById('returnCardNumber').value;
    const creditDateInput = document.getElementById('returnCreditDate').value;
    const creditDate = fuelCardManager.formatDateTime(creditDateInput);
    
    // בדיקת שדה חובה
    if (!cardNumber) {
        fuelCardManager.showStatus('יש למלא מספר כרטיס', 'error');
        return;
    }
    
    // יצירת פקודה
    const command = {
        type: 'return',
        cardNumber: parseInt(cardNumber),
        creditDate: creditDate
    };
    
    console.log('פקודה נוצרה:', command);
    
    try {
        await fuelCardManager.returnCard(command);
        hideTypingForm();
        clearReturnCardForm();
    } catch (error) {
        console.log('שגיאה בהחזרת כרטיס:', error);
        fuelCardManager.showStatus('שגיאה בהחזרת הכרטיס: ' + error.message, 'error');
        hideTypingForm();
    }
}

// ניקוי טופס ניפוק כרטיס חדש
function clearNewCardForm() {
    document.getElementById('newCardNumber').value = '';
    document.getElementById('newName').value = '';
    document.getElementById('newPhone').value = '';
    document.getElementById('newAmount').value = '';
    document.getElementById('newFuelType').value = '';
    document.getElementById('newGadudNumber').value = '';
    const issueDateField = document.getElementById('newIssueDate');
    if (issueDateField) {
        issueDateField.value = '';
    }
    resetFuelTypeSelector('newFuelType');
    resetAmountSelector('newAmount');
}

// ניקוי טופס עדכון כרטיס
function clearUpdateCardForm() {
    document.getElementById('updateCardNumber').value = '';
    document.getElementById('updateAmount').value = '';
}

// ניקוי טופס החזרת כרטיס
function clearReturnCardForm() {
    document.getElementById('returnCardNumber').value = '';
    const creditDateField = document.getElementById('returnCreditDate');
    if (creditDateField) {
        creditDateField.value = '';
    }
}

// שליחת טופס ניפוק גדודי
function submitGadudNew() {
    console.log('שולח טופס ניפוק גדודי');
    
    const cardNumber = document.getElementById('gadudCardNumber').value;
    const gadudName = document.getElementById('gadudName').value;
    const gadudIssueDateInput = document.getElementById('gadudIssueDate').value;
    const gadudIssueDate = fuelCardManager.formatDateTime(gadudIssueDateInput);
    
    // בדיקת שדות חובה
    if (!cardNumber || !gadudName) {
        fuelCardManager.showStatus('יש למלא את כל השדות', 'error');
        return;
    }
    
    // בדיקת ולידציה של מספר כרטיס (5 עד 15 ספרות)
    const cardNumStr = cardNumber.toString().trim();
    if (!/^\d{5,15}$/.test(cardNumStr)) {
        fuelCardManager.showStatus('מספר כרטיס חייב להכיל בין 5 ל-15 ספרות בלבד', 'error');
        return;
    }
    const cardNum = parseInt(cardNumStr);
    if (cardNum < 10000 || cardNum > 999999999999999) {
        fuelCardManager.showStatus('מספר כרטיס חייב להיות בין 10000 ל-999999999999999 (5 עד 15 ספרות)', 'error');
        return;
    }
    
    // ביצוע הפעולה
    try {
        fuelCardManager.addGadudData(cardNum, gadudName, undefined, gadudIssueDate);
        hideTypingForm();
        clearGadudNewForm();
    } catch (error) {
        console.log('שגיאה בהוספת ניפוק גדודי:', error);
        fuelCardManager.showStatus('שגיאה בהוספת ניפוק גדודי: ' + error.message, 'error');
    }
}

// שליחת טופס עדכון גדודי
function submitGadudUpdate() {
    console.log('שולח טופס עדכון גדודי');
    
    const cardNumber = document.getElementById('gadudUpdateCardNumber').value;
    const gadudName = document.getElementById('gadudUpdateName').value;
    const remainingFuel = document.getElementById('gadudUpdateRemainingFuel').value;
    
    // בדיקת שדות חובה
    if (!cardNumber || !gadudName || !remainingFuel) {
        fuelCardManager.showStatus('יש למלא את כל השדות', 'error');
        return;
    }
    
    // בדיקת ולידציה של מספר כרטיס (5 עד 15 ספרות)
    const cardNumStr = cardNumber.toString().trim();
    if (!/^\d{5,15}$/.test(cardNumStr)) {
        fuelCardManager.showStatus('מספר כרטיס חייב להכיל בין 5 ל-15 ספרות בלבד', 'error');
        return;
    }
    const cardNum = parseInt(cardNumStr);
    if (cardNum < 10000 || cardNum > 999999999999999) {
        fuelCardManager.showStatus('מספר כרטיס חייב להיות בין 10000 ל-999999999999999 (5 עד 15 ספרות)', 'error');
        return;
    }
    
    // ביצוע הפעולה
    try {
        fuelCardManager.updateGadudData(cardNum, gadudName, parseInt(remainingFuel));
        hideTypingForm();
        clearGadudUpdateForm();
    } catch (error) {
        console.log('שגיאה בעדכון גדודי:', error);
        fuelCardManager.showStatus('שגיאה בעדכון גדודי: ' + error.message, 'error');
    }
}

// שליחת טופס זיכוי גדודי
function submitGadudReturn() {
    console.log('שולח טופס זיכוי גדודי');
    
    const cardNumber = document.getElementById('gadudReturnCardNumber').value;
    const vehicleNumber = document.getElementById('gadudVehicleNumber').value.trim();
    const gadudCreditDateInput = document.getElementById('gadudCreditDate').value;
    const gadudCreditDate = fuelCardManager.formatDateTime(gadudCreditDateInput);
    
    // בדיקת שדה חובה - מספר כרטיס
    if (!cardNumber) {
        fuelCardManager.showStatus('יש למלא מספר כרטיס', 'error');
        return;
    }
    
    // בדיקת ולידציה של מספר כרטיס (5 עד 15 ספרות)
    const cardNumStr = cardNumber.toString().trim();
    if (!/^\d{5,15}$/.test(cardNumStr)) {
        fuelCardManager.showStatus('מספר כרטיס חייב להכיל בין 5 ל-15 ספרות בלבד', 'error');
        return;
    }
    const cardNum = parseInt(cardNumStr);
    if (cardNum < 10000 || cardNum > 999999999999999) {
        fuelCardManager.showStatus('מספר כרטיס חייב להיות בין 10000 ל-999999999999999 (5 עד 15 ספרות)', 'error');
        return;
    }
    
    // בדיקת שדה חובה - מספר רכב
    if (!vehicleNumber) {
        fuelCardManager.showStatus('יש למלא מספר רכב שנוצל הכרטיס עבורו', 'error');
        return;
    }
    
    // בדיקת ולידציה של מספר רכב (4 עד 9 ספרות)
    if (!/^\d{4,9}$/.test(vehicleNumber)) {
        fuelCardManager.showStatus('מספר רכב חייב להכיל בין 4 ל-9 ספרות בלבד', 'error');
        return;
    }
    
    // הצגת חלונית אישור לפני ביצוע הזיכוי (רק אחרי שכל השדות מולאו)
    fuelCardManager.showGadudCreditConfirmation(cardNum, vehicleNumber, gadudCreditDate);
}

// ניקוי טופס ניפוק גדודי
function clearGadudNewForm() {
    document.getElementById('gadudCardNumber').value = '';
    document.getElementById('gadudName').value = '';
    const issueDateField = document.getElementById('gadudIssueDate');
    if (issueDateField) {
        issueDateField.value = '';
    }
}

// ניקוי טופס עדכון גדודי
function clearGadudUpdateForm() {
    document.getElementById('gadudUpdateCardNumber').value = '';
    document.getElementById('gadudUpdateName').value = '';
    document.getElementById('gadudUpdateId').value = '';
    document.getElementById('gadudUpdateRemainingFuel').value = '';
}

// ניקוי טופס זיכוי גדודי
function clearGadudReturnForm() {
    document.getElementById('gadudReturnCardNumber').value = '';
    const vehicleNumberField = document.getElementById('gadudVehicleNumber');
    if (vehicleNumberField) {
        vehicleNumberField.value = '';
    }
    const creditDateField = document.getElementById('gadudCreditDate');
    if (creditDateField) {
        creditDateField.value = '';
    }
}

// הורדת Excel
function downloadExcel() {
    fuelCardManager.downloadExcel();
}

function initDomEventBindings() {
    if (document.body && document.body.dataset && document.body.dataset.actionsBound === 'true') {
        return;
    }

    document.addEventListener('click', (event) => {
        const actionElement = event.target.closest('[data-action]');
        if (!actionElement) return;

        const action = actionElement.getAttribute('data-action');
        if (!action) return;

        switch (action) {
            case 'login':
                if (fuelCardManager && typeof fuelCardManager.login === 'function') {
                    fuelCardManager.login();
                }
                break;
            case 'logout':
                if (fuelCardManager && typeof fuelCardManager.logout === 'function') {
                    fuelCardManager.logout();
                }
                break;
            case 'showEditCardForm':
                if (fuelCardManager && typeof fuelCardManager.showEditCardForm === 'function') {
                    fuelCardManager.showEditCardForm();
                }
                break;
            case 'showTypingForm':
                showTypingForm(actionElement.getAttribute('data-form-action'));
                break;
            case 'hideTypingForm':
                hideTypingForm();
                break;
            case 'submitNewCard':
                submitNewCard();
                break;
            case 'submitUpdateCard':
                submitUpdateCard();
                break;
            case 'submitReturnCard':
                submitReturnCard();
                break;
            case 'submitGadudNew':
                submitGadudNew();
                break;
            case 'submitGadudUpdate':
                submitGadudUpdate();
                break;
            case 'submitGadudReturn':
                submitGadudReturn();
                break;
            case 'downloadExcel':
                downloadExcel();
                break;
            case 'filterTable':
                if (fuelCardManager && typeof fuelCardManager.filterTable === 'function') {
                    fuelCardManager.filterTable();
                }
                break;
            case 'clearSearch': {
                const searchInput = document.getElementById('searchInput');
                if (searchInput) searchInput.value = '';
                if (fuelCardManager && typeof fuelCardManager.filterTable === 'function') {
                    fuelCardManager.filterTable();
                }
                break;
            }
            case 'resetSortingAndFiltering':
                if (fuelCardManager && typeof fuelCardManager.resetSortingAndFiltering === 'function') {
                    fuelCardManager.resetSortingAndFiltering();
                }
                break;
            default:
                break;
        }
    });

    document.addEventListener('change', (event) => {
        const target = event.target;
        if (!target || !target.id) return;
        const filterIds = ['sortBy', 'statusFilter', 'gadudFilter', 'fuelTypeFilter', 'yearFilter', 'monthFilter'];
        if (filterIds.includes(target.id) && fuelCardManager && typeof fuelCardManager.applySortingAndFiltering === 'function') {
            fuelCardManager.applySortingAndFiltering();
        }
    });

    document.addEventListener('keyup', (event) => {
        const target = event.target;
        if (!target || target.id !== 'searchInput') return;
        if (fuelCardManager && typeof fuelCardManager.filterTable === 'function') {
            fuelCardManager.filterTable();
        }
    });

    if (document.body && document.body.dataset) {
        document.body.dataset.actionsBound = 'true';
    }
}

initDomEventBindings();

// וידוא שהפונקציות זמינות
console.log('בודק זמינות פונקציות...');
console.log('showTypingForm:', typeof showTypingForm);
console.log('submitNewCard:', typeof submitNewCard);
console.log('downloadExcel:', typeof downloadExcel);

// תמיכה במקלדת ו-keyboard shortcuts
document.addEventListener('keydown', (event) => {
    // Ctrl+F / Cmd+F - חיפוש
    if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        event.preventDefault();
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
        return;
    }
    
    // Ctrl+Enter לשליחת טופס
    if (event.ctrlKey && event.key === 'Enter') {
        const visibleForm = document.querySelector('.typing-form[style*="block"]');
        if (visibleForm) {
            const submitBtn = visibleForm.querySelector('.submit-btn');
            if (submitBtn) {
                submitBtn.click();
            }
        }
        return;
    }
    
    // Escape לסגירת טופס
    if (event.key === 'Escape') {
        hideAllTypingForms();
    }
});
