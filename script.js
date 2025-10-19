// מערכת ניהול כרטיסי דלק עם Firebase Firestore
class FuelCardManager {
    constructor() {
        console.log('מתחיל את מערכת ניהול כרטיסי הדלק עם Firebase... - עדכון חדש 2025!');
        this.recognition = null;
        this.isRecording = false;
        this.fuelCards = [];
        this.tableColumns = this.loadTableColumns();
        this.currentUser = this.getCurrentUser();
        console.log('עמודות טבלה:', this.tableColumns);
        console.log('משתמש נוכחי:', this.currentUser);
        this.initSpeechRecognition();
        this.checkLogin();
        this.loadDataFromFirebase();
        console.log('המערכת מוכנה לשימוש!');
    }

    // אתחול מערכת זיהוי דיבור
    initSpeechRecognition() {
        console.log('בודק תמיכה בהקלטה קולית...');
        
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            console.log('הדפדפן תומך בהקלטה קולית');
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            
            this.recognition.continuous = false;
            this.recognition.interimResults = true;
            this.recognition.lang = 'he-IL';
            this.recognition.maxAlternatives = 1;
            
            this.recognition.onstart = () => {
                console.log('ההקלטה התחילה');
                this.showStatus('מקליט... (עצור ידנית או חכה 30 שניות)', 'recording');
            };
            
            this.recognition.onresult = (event) => {
                console.log('תוצאות הקלטה:', event.results);
                
                // חפש תוצאה סופית
                for (let i = event.results.length - 1; i >= 0; i--) {
                    const result = event.results[i];
                    if (result.isFinal && result.length > 0) {
                        const transcript = result[0].transcript;
                        console.log('הקלטה סופית התקבלה:', transcript);
                        this.processVoiceCommand(transcript);
                        return;
                    } else if (result.length > 0) {
                        const transcript = result[0].transcript;
                        console.log('הקלטה זמנית:', transcript);
                        this.showStatus('מקליט: ' + transcript, 'recording');
                    }
                }
                
                // אם לא נמצאה תוצאה סופית
                if (event.results.length === 0) {
                    console.log('לא התקבל טקסט מההקלטה');
                    this.showStatus('לא התקבל טקסט מההקלטה', 'error');
                }
            };
            
            this.recognition.onerror = (event) => {
                console.log('שגיאה בהקלטה:', event.error);
                this.showStatus('שגיאה בהקלטה: ' + event.error, 'error');
                this.isRecording = false;
            };
            
            this.recognition.onend = () => {
                console.log('ההקלטה הסתיימה');
                this.isRecording = false;
                if (this.recordingTimeout) {
                    clearTimeout(this.recordingTimeout);
                    this.recordingTimeout = null;
                }
                if (this.countdownInterval) {
                    clearInterval(this.countdownInterval);
                    this.countdownInterval = null;
                }
                this.updateRecordButtons();
            };
            
            this.recognition.onnomatch = () => {
                console.log('לא זוהה דיבור');
                this.showStatus('לא זוהה דיבור - נסה שוב', 'error');
            };
            
            this.recognition.onspeechstart = () => {
                console.log('זוהה דיבור');
            };
            
            this.recognition.onspeechend = () => {
                console.log('סיום דיבור');
            };
            
            console.log('מערכת זיהוי דיבור מוכנה');
        } else {
            console.log('הדפדפן לא תומך בהקלטה קולית');
            this.showStatus('הדפדפן לא תומך בהקלטה קולית', 'error');
        }
    }

    // התחלת הקלטה
    startRecording(action) {
        console.log('לחצו על כפתור:', action);
        
        if (!this.recognition) {
            console.log('מערכת זיהוי דיבור לא זמינה');
            this.showStatus('הקלטה קולית לא זמינה', 'error');
            return;
        }

        if (this.isRecording) {
            console.log('עוצר הקלטה');
            if (this.recordingTimeout) {
                clearTimeout(this.recordingTimeout);
                this.recordingTimeout = null;
            }
            if (this.countdownInterval) {
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
            }
            this.recognition.stop();
            return;
        }

        console.log('מתחיל הקלטה עבור:', action);
        
        // הצגת הוראות לפני ההקלטה
        showVoiceInstructions(action);

        this.currentAction = action;
        this.isRecording = true;
        
        try {
            this.recognition.start();
            console.log('ההקלטה התחילה בהצלחה');
            
            // timeout אוטומטי אחרי 30 שניות
            this.recordingTimeout = setTimeout(() => {
                if (this.isRecording) {
                    console.log('timeout - עוצר הקלטה');
                    this.recognition.stop();
                }
            }, 30000);
            
            // ספירה לאחור
            this.countdownInterval = setInterval(() => {
                if (this.isRecording && this.recordingTimeout) {
                    const remaining = Math.ceil((30000 - (Date.now() - this.recordingStartTime)) / 1000);
                    if (remaining > 0) {
                        this.showStatus(`מקליט... (${remaining} שניות נותרו)`, 'recording');
                    }
                }
            }, 1000);
            
            this.recordingStartTime = Date.now();
            
        } catch (error) {
            console.log('שגיאה בהתחלת ההקלטה:', error);
            this.showStatus('שגיאה בהתחלת ההקלטה: ' + error.message, 'error');
            this.isRecording = false;
        }
        
        this.updateRecordButtons();
    }

    // עדכון כפתורי הקלטה
    updateRecordButtons() {
        const buttons = document.querySelectorAll('.record-btn');
        buttons.forEach(btn => {
            if (this.isRecording) {
                btn.classList.add('recording');
                btn.textContent = 'עצור הקלטה';
            } else {
                btn.classList.remove('recording');
                btn.textContent = btn.textContent.replace('עצור הקלטה', 'הקלט ' + 
                    (btn.onclick.toString().includes('new') ? 'ניפוק' :
                     btn.onclick.toString().includes('update') ? 'עדכון' : 'החזרה'));
            }
        });
    }

    // עיבוד פקודה קולית
    processVoiceCommand(transcript) {
        console.log('מעבד פקודה:', transcript);
        this.showStatus('מעבד: ' + transcript, 'processing');
        
        try {
            const command = this.parseCommand(transcript);
            command.fromVoice = true; // סמן שהפקודה מגיעה מהקלטה קולית
            console.log('פקודה מפוענחת:', command);
            
            if (command.type === 'new') {
                this.addNewCard(command);
            } else if (command.type === 'update') {
                this.updateCard(command);
            } else if (command.type === 'return') {
                this.returnCard(command);
            } else {
                console.log('סוג פקודה לא מוכר:', command.type);
                this.showStatus('לא הצלחתי להבין את הפקודה', 'error');
            }
        } catch (error) {
            console.log('שגיאה בעיבוד:', error.message);
            this.showStatus('שגיאה בעיבוד הפקודה: ' + error.message, 'error');
        }
    }

    // ניתוח פקודה קולית
    parseCommand(transcript) {
        const text = transcript.toLowerCase();
        console.log('מנתח טקסט:', text);
        
        // ניפוק כרטיס חדש
        if (text.includes('כרטיס') && !text.includes('עדכון') && !text.includes('החזרה')) {
            console.log('מזהה: ניפוק כרטיס חדש');
            return this.parseNewCard(text);
        }
        
        // עדכון כרטיס
        if (text.includes('עדכון') && text.includes('כרטיס')) {
            console.log('מזהה: עדכון כרטיס');
            return this.parseUpdateCard(text);
        }
        
        // החזרת כרטיס
        if (text.includes('החזרה') && text.includes('כרטיס')) {
            console.log('מזהה: החזרת כרטיס');
            return this.parseReturnCard(text);
        }
        
        console.log('לא זוהה סוג פקודה');
        throw new Error('פקודה לא מוכרת');
    }

    // ניתוח ניפוק כרטיס חדש
    parseNewCard(text) {
        // דוגמה: "כרטיס 12345, יוסי כהן, 0501234567, 50 ליטר, דיזל"
        console.log('מנתח ניפוק כרטיס חדש:', text);
        
        // נסה תחילה עם פסיקים
        let parts = text.split(',');
        console.log('חלקי הטקסט עם פסיקים:', parts);
        
        // אם אין פסיקים, ננסה לחלץ לפי מילים
        if (parts.length < 5) {
            console.log('מנסה לחלץ ללא פסיקים...');
            parts = this.parseWithoutCommas(text);
            console.log('חלקי הטקסט ללא פסיקים:', parts);
        }
        
        if (parts.length < 5) {
            console.log('חסרים פרטים - יש רק', parts.length, 'חלקים');
            throw new Error('חסרים פרטים לכרטיס חדש');
        }
        
        const cardNumber = this.extractNumber(parts[0]);
        const name = parts[1].trim();
        const phone = this.extractPhone(parts[2]);
        const amount = this.extractNumber(parts[3]);
        const fuelType = parts[4].trim();
        
        console.log('פרטים מחולצים:', {
            cardNumber, name, phone, amount, fuelType
        });
        
        return {
            type: 'new',
            cardNumber,
            name,
            phone,
            amount,
            fuelType,
            gadudNumber: '' // מספר גדוד ימוזן רק בטופס ההקלדה
        };
    }

    // חילוץ פרטים ללא פסיקים
    parseWithoutCommas(text) {
        // דוגמה: "כרטיס 123 עומרי בן גיגי 05-06620734 50 ליטר בנזין"
        console.log('מנתח טקסט ללא פסיקים:', text);
        const words = text.split(' ');
        console.log('מילים:', words);
        const parts = [];
        
        // חלק 1: "כרטיס [מספר]"
        console.log('יוצר חלק 1...');
        parts.push('כרטיס ' + words[1]);
        console.log('חלק 1 (כרטיס):', 'כרטיס ' + words[1]);
        
        // חלק 2: שם (מילה 2 עד הטלפון)
        console.log('יוצר חלק 2...');
        let nameParts = [];
        for (let i = 2; i < words.length; i++) {
            if (words[i].startsWith('0')) {
                break;
            }
            nameParts.push(words[i]);
        }
        const name = nameParts.join(' ');
        parts.push(name);
        console.log('חלק 2 (שם):', name);
        
        // חלק 3: טלפון
        let phoneIndex = -1;
        for (let i = 0; i < words.length; i++) {
            if (words[i].startsWith('0')) {
                phoneIndex = i;
                break;
            }
        }
        if (phoneIndex !== -1) {
            parts.push(words[phoneIndex]);
            console.log('חלק 3 (טלפון):', words[phoneIndex]);
        }
        
        // חלק 4: כמות ליטר
        let amountIndex = phoneIndex + 1;
        if (amountIndex < words.length && words[amountIndex + 1] === 'ליטר') {
            parts.push(words[amountIndex] + ' ליטר');
            console.log('חלק 4 (כמות):', words[amountIndex] + ' ליטר');
        }
        
        // חלק 5: סוג דלק
        let fuelIndex = amountIndex + 2; // אחרי "כמות ליטר"
        if (fuelIndex < words.length) {
            parts.push(words[fuelIndex]);
            console.log('חלק 5 (דלק):', words[fuelIndex]);
        }
        
        console.log('כל החלקים:', parts);
        return parts;
    }

    // בדיקה אם מילה היא מספר טלפון
    isPhoneNumber(word) {
        console.log('בודק אם זה טלפון:', word);
        // זיהוי טלפון ישראלי - מתחיל ב-0 ומכיל ספרות ומינוס
        const isPhone = /^0\d{2,3}-?\d{7}$/.test(word) || /^05\d-?\d{7}$/.test(word) || /^0\d{2,3}-\d{7}$/.test(word) || /^0\d{2,3}-\d{7}$/.test(word);
        console.log('תוצאה:', isPhone);
        return isPhone;
    }

    // ניתוח עדכון כרטיס
    parseUpdateCard(text) {
        // דוגמה: "עדכון כרטיס 12345, 30 ליטר"
        console.log('מנתח עדכון כרטיס:', text);
        const parts = text.split(',');
        console.log('חלקי עדכון:', parts);
        
        let cardNumber, amount;
        
        if (parts.length >= 2) {
            // עם פסיקים
            cardNumber = this.extractNumber(parts[0]);
            amount = this.extractNumber(parts[1]);
        } else {
            // ללא פסיקים - "עדכון כרטיס 123 20 ליטר"
            const words = text.split(' ');
            console.log('מילים עדכון:', words);
            
            // מצא את מספר הכרטיס (אחרי "כרטיס")
            for (let i = 0; i < words.length; i++) {
                if (words[i] === 'כרטיס' && i + 1 < words.length) {
                    cardNumber = this.extractNumber(words[i + 1]);
                    break;
                }
            }
            
            // מצא את הכמות (לפני "ליטר")
            for (let i = 0; i < words.length; i++) {
                if (words[i] === 'ליטר' && i - 1 >= 0) {
                    amount = this.extractNumber(words[i - 1]);
                    break;
                }
            }
        }
        
        console.log('עדכון מחולץ:', { cardNumber, amount });
        
        return {
            type: 'update',
            cardNumber,
            amount
        };
    }

    // ניתוח החזרת כרטיס
    parseReturnCard(text) {
        // דוגמה: "החזרה כרטיס 12345"
        console.log('מנתח החזרת כרטיס:', text);
        const words = text.split(' ');
        console.log('מילים החזרה:', words);
        
        let cardNumber;
        
        // מצא את מספר הכרטיס (אחרי "כרטיס")
        for (let i = 0; i < words.length; i++) {
            if (words[i] === 'כרטיס' && i + 1 < words.length) {
                cardNumber = this.extractNumber(words[i + 1]);
                break;
            }
        }
        
        console.log('החזרה מחולצת:', { cardNumber });
        
        return {
            type: 'return',
            cardNumber
        };
    }

    // חילוץ מספר מטקסט
    extractNumber(text) {
        const numbers = text.match(/\d+/g);
        return numbers ? parseInt(numbers[0]) : null;
    }

    // חילוץ טלפון מטקסט
    extractPhone(text) {
        const phone = text.match(/0\d{2,3}-?\d{7}/);
        return phone ? phone[0] : text.trim();
    }

    // הוספת כרטיס חדש
    async addNewCard(command) {
        // בדיקת הרשאות - רק מנהל יכול לנפק כרטיסים
        if (!this.currentUser || !this.currentUser.isAdmin) {
            this.showStatus('אין לך הרשאה לנפק כרטיסים. רק מנהל מערכת יכול לבצע פעולה זו.', 'error');
            return;
        }
        
        const existingIndex = this.fuelCards.findIndex(card => card.cardNumber === command.cardNumber);
        
        if (existingIndex !== -1) {
            this.showStatus('כרטיס כבר קיים במערכת', 'error');
            return;
        }
        
        // אם זה מהקלטה קולית ולא מהטופס, נציג טופס בחירת גדוד
        if (!command.gadudNumber && command.fromVoice) {
            this.showGadudSelectionForm(command);
            return;
        }
        
        const newCard = {
            cardNumber: command.cardNumber,
            name: command.name,
            phone: command.phone,
            amount: command.amount,
            fuelType: command.fuelType,
            gadudNumber: command.gadudNumber || '',
            status: 'new',
            date: new Date().toLocaleString('he-IL'),
            // שרשרת העברת כרטיס
            cardChain: [{
                action: 'ניפוק ראשוני',
                amount: command.amount,
                date: new Date().toLocaleString('he-IL'),
                status: 'active'
            }],
            currentHolder: 'system',
            currentHolderName: 'מערכת'
        };
        
        this.fuelCards.push(newCard);
        await this.saveDataToFirebase();
        this.renderTable();
        this.showStatus('כרטיס חדש נוסף בהצלחה', 'success');
    }

    // עדכון כרטיס קיים
    async updateCard(command) {
        // בדיקת הרשאות - רק מנהל יכול לעדכן כרטיסים
        if (!this.currentUser || !this.currentUser.isAdmin) {
            this.showStatus('אין לך הרשאה לעדכן כרטיסים. רק מנהל מערכת יכול לבצע פעולה זו.', 'error');
            return;
        }
        
        const cardIndex = this.fuelCards.findIndex(card => card.cardNumber === command.cardNumber);
        
        if (cardIndex === -1) {
            this.showStatus('כרטיס לא נמצא במערכת', 'error');
            return;
        }
        
        this.fuelCards[cardIndex].amount = command.amount;
        this.fuelCards[cardIndex].status = 'updated';
        this.fuelCards[cardIndex].date = new Date().toLocaleString('he-IL');
        
        await this.saveDataToFirebase();
        this.renderTable();
        this.showStatus('כרטיס עודכן בהצלחה', 'success');
    }

    // החזרת כרטיס
    async returnCard(command) {
        // בדיקת הרשאות - רק מנהל יכול להחזיר כרטיסים
        if (!this.currentUser || !this.currentUser.isAdmin) {
            this.showStatus('אין לך הרשאה להחזיר כרטיסים. רק מנהל מערכת יכול לבצע פעולה זו.', 'error');
            return;
        }
        
        const cardIndex = this.fuelCards.findIndex(card => card.cardNumber === command.cardNumber);
        
        if (cardIndex === -1) {
            this.showStatus('כרטיס לא נמצא במערכת', 'error');
            return;
        }
        
        this.fuelCards[cardIndex].amount = 0;
        this.fuelCards[cardIndex].status = 'returned';
        this.fuelCards[cardIndex].date = new Date().toLocaleString('he-IL');
        
        await this.saveDataToFirebase();
        this.renderTable();
        this.showStatus('כרטיס הוחזר בהצלחה', 'success');
    }

    // העברת כרטיס לאדם אחר
    transferCard(cardNumber, newHolderName, newHolderPhone, amountUsed) {
        const cardIndex = this.fuelCards.findIndex(card => card.cardNumber === cardNumber);
        
        if (cardIndex === -1) {
            this.showStatus('כרטיס לא נמצא במערכת', 'error');
            return;
        }

        const card = this.fuelCards[cardIndex];

        // הוסף רשומה לשרשרת
        const chainEntry = {
            action: 'העברה',
            amount: amountUsed || 0,
            date: new Date().toLocaleString('he-IL'),
            status: 'transferred',
            newHolder: newHolderName,
            newHolderPhone: newHolderPhone
        };

        card.cardChain.push(chainEntry);
        card.currentHolder = 'transferred';
        card.currentHolderName = newHolderName;
        card.status = 'transferred';
        card.date = new Date().toLocaleString('he-IL');

        this.saveData();
        this.renderTable();
        this.showStatus(`כרטיס הועבר ל-${newHolderName}`, 'success');
    }

    // עדכון כרטיס על ידי המחזיק הנוכחי
    updateCardByHolder(cardNumber, amountUsed, notes) {
        const cardIndex = this.fuelCards.findIndex(card => card.cardNumber === cardNumber);
        
        if (cardIndex === -1) {
            this.showStatus('כרטיס לא נמצא במערכת', 'error');
            return;
        }

        const card = this.fuelCards[cardIndex];

        // הוסף רשומה לשרשרת
        const chainEntry = {
            action: 'שימוש',
            amount: amountUsed,
            date: new Date().toLocaleString('he-IL'),
            status: 'used',
            notes: notes || ''
        };

        card.cardChain.push(chainEntry);
        card.amount = Math.max(0, card.amount - amountUsed);
        card.status = card.amount > 0 ? 'active' : 'empty';
        card.date = new Date().toLocaleString('he-IL');

        this.saveData();
        this.renderTable();
        this.showStatus(`עדכון כרטיס: ${amountUsed} ליטר`, 'success');
    }

    // החזרת כרטיס למנהל (זיכוי סופי)
    finalReturn(cardNumber) {
        const cardIndex = this.fuelCards.findIndex(card => card.cardNumber === cardNumber);
        
        if (cardIndex === -1) {
            this.showStatus('כרטיס לא נמצא במערכת', 'error');
            return;
        }

        const card = this.fuelCards[cardIndex];
        
        // הוסף רשומה לשרשרת
        const chainEntry = {
            action: 'זיכוי סופי',
            amount: 0,
            date: new Date().toLocaleString('he-IL'),
            status: 'final_return'
        };

        card.cardChain.push(chainEntry);
        card.currentHolder = 'system';
        card.currentHolderName = 'מערכת';
        card.status = 'final_return';
        card.amount = 0;
        card.date = new Date().toLocaleString('he-IL');

        this.saveData();
        this.renderTable();
        this.showStatus('כרטיס הוחזר למערכת - זיכוי סופי', 'success');
    }

    // הצגת סטטוס
    showStatus(message, type) {
        const statusDiv = document.getElementById('status');
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';
        
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }

    // רינדור טבלה
    renderTable() {
        const tbody = document.getElementById('fuelCardsBody');
        tbody.innerHTML = '';
        
        // עדכון כותרות הטבלה
        this.updateTableHeaders();
        
        // קבל כרטיסים מסוננים לפי הרשאות
        const filteredCards = this.getFilteredCards();
        
        filteredCards.forEach(card => {
            const row = document.createElement('tr');
            
            // הוספת מחלקת צבע לפי סטטוס
            if (card.status === 'new') {
                row.classList.add('row-new');
            } else if (card.status === 'updated') {
                row.classList.add('row-updated');
            } else if (card.status === 'returned') {
                row.classList.add('row-returned');
            }
            
            // יצירת תוכן השורה לפי העמודות
            let rowContent = '';
            this.tableColumns.forEach(column => {
                // בדוק אם המשתמש יכול לראות את העמודה
                if (this.canViewColumn(column)) {
                    let cellValue = this.getCellValue(card, column);
                    rowContent += `<td>${cellValue}</td>`;
                }
            });
            
            row.innerHTML = rowContent;
            tbody.appendChild(row);
        });
    }

    // עדכון כותרות הטבלה
    updateTableHeaders() {
        const thead = document.querySelector('#fuelCardsTable thead tr');
        if (!thead) return;
        
        let headerContent = '';
        this.tableColumns.forEach(column => {
            if (this.canViewColumn(column)) {
                headerContent += `<th>${column.name}</th>`;
            }
        });
        
        thead.innerHTML = headerContent;
    }

    // בדיקה אם משתמש יכול לראות עמודה
    canViewColumn(column) {
        return true; // כל המשתמשים יכולים לראות את כל העמודות
    }

    // קבלת ערך תא
    getCellValue(card, column) {
        switch(column.id) {
            case 'cardNumber':
                return card.cardNumber || '';
            case 'name':
                return card.name || '';
            case 'phone':
                return card.phone || '';
            case 'amount':
                return card.amount || '';
            case 'fuelType':
                return card.fuelType || '';
            case 'gadudNumber':
                return card.gadudNumber || '';
            case 'status':
                return this.getStatusText(card.status);
            case 'date':
                return card.date || '';
            case 'currentHolder':
                return card.currentHolderName || 'לא זמין';
            case 'cardChain':
                return this.getCardChainText(card.cardChain);
            case 'gadudName':
                return card.gadudName || '';
            case 'gadudId':
                return card.gadudId || '';
            case 'remainingFuel':
                return card.remainingFuel || card.amount || '';
            default:
                // עמודות מותאמות אישית
                return card[column.id] || '';
        }
    }

    // קבלת טקסט שרשרת הכרטיס
    getCardChainText(cardChain) {
        if (!cardChain || cardChain.length === 0) return 'אין היסטוריה';
        
        let chainText = '';
        cardChain.forEach((entry, index) => {
            chainText += `${index + 1}. ${entry.action} - ${entry.userName}`;
            if (entry.amount > 0) {
                chainText += ` (${entry.amount} ליטר)`;
            }
            chainText += ` - ${entry.date}`;
            if (index < cardChain.length - 1) {
                chainText += '<br>';
            }
        });
        
        return chainText;
    }

    // קבלת טקסט סטטוס
    getStatusText(status) {
        switch (status) {
            case 'new': return 'חדש';
            case 'updated': return 'עודכן';
            case 'returned': return 'הוחזר';
            case 'transferred': return 'הועבר';
            case 'active': return 'פעיל';
            case 'empty': return 'ריק';
            case 'final_return': return 'זיכוי סופי';
            default: return status;
        }
    }

    // קבלת מידע על המשתמש
    getUserInfo(card) {
        return 'מערכת';
    }

    // שמירת נתונים
    saveData() {
        localStorage.setItem('fuelCards', JSON.stringify(this.fuelCards));
    }

    // טעינת נתונים
    loadData() {
        const data = localStorage.getItem('fuelCards');
        return data ? JSON.parse(data) : [];
    }

    // טעינת נתונים מ-Firebase
    async loadDataFromFirebase() {
        try {
            console.log('טוען נתונים מ-Firebase...');
            const querySnapshot = await window.firebaseGetDocs(window.firebaseCollection(window.db, 'fuelCards'));
            this.fuelCards = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                data.id = doc.id; // הוסף את ה-ID של המסמך
                this.fuelCards.push(data);
            });
            console.log('כרטיסים נטענו מ-Firebase:', this.fuelCards.length);
            this.renderTable();
        } catch (error) {
            console.error('שגיאה בטעינת נתונים מ-Firebase:', error);
            this.showStatus('שגיאה בטעינת נתונים', 'error');
        }
    }

    // שמירת נתונים ל-Firebase
    async saveDataToFirebase() {
        try {
            console.log('שומר נתונים ל-Firebase...');
            // נמחק את כל המסמכים הקיימים
            const querySnapshot = await window.firebaseGetDocs(window.firebaseCollection(window.db, 'fuelCards'));
            const deletePromises = querySnapshot.docs.map(doc => 
                window.firebaseDeleteDoc(window.firebaseDoc(window.db, 'fuelCards', doc.id))
            );
            await Promise.all(deletePromises);
            
            // נוסיף את כל הכרטיסים מחדש
            const addPromises = this.fuelCards.map(card => 
                window.firebaseAddDoc(window.firebaseCollection(window.db, 'fuelCards'), card)
            );
            await Promise.all(addPromises);
            
            console.log('נתונים נשמרו ל-Firebase בהצלחה');
        } catch (error) {
            console.error('שגיאה בשמירת נתונים ל-Firebase:', error);
            this.showStatus('שגיאה בשמירת נתונים', 'error');
        }
    }

    // מערכת עמודות דינמיות
    loadTableColumns() {
        const columns = localStorage.getItem('fuelCardColumns');
        if (!columns) {
            // עמודות ברירת מחדל
            const defaultColumns = [
                { id: 'cardNumber', name: 'מספר כרטיס', type: 'number', editable: true, department: 'all' },
                { id: 'name', name: 'שם', type: 'text', editable: true, department: 'all' },
                { id: 'phone', name: 'טלפון', type: 'text', editable: true, department: 'all' },
                { id: 'amount', name: 'כמות (ליטר)', type: 'number', editable: true, department: 'all' },
                { id: 'fuelType', name: 'סוג דלק', type: 'text', editable: true, department: 'all' },
                { id: 'gadudNumber', name: 'מספר גדוד', type: 'select', editable: true, department: 'all', options: ['650', '651', '652', '653', '674', '703', '638', '791'] },
                { id: 'status', name: 'סטטוס', type: 'text', editable: false, department: 'all' },
                { id: 'date', name: 'תאריך', type: 'text', editable: false, department: 'all' },
                { id: 'gadudName', name: 'שם (ניפוק גדודי)', type: 'text', editable: true, department: 'all' },
                { id: 'gadudId', name: 'מספר אישי (ניפוק גדודי)', type: 'text', editable: true, department: 'all' },
                { id: 'remainingFuel', name: 'כמות דלק שנשאר (ניפוק גדודי)', type: 'number', editable: true, department: 'all' }
            ];
            this.saveTableColumns(defaultColumns);
            return defaultColumns;
        }
        
        // אם יש עמודות קיימות, נבדוק אם צריך להוסיף את העמודות החדשות
        const existingColumns = JSON.parse(columns);
        const newColumns = [
            { id: 'gadudNumber', name: 'מספר גדוד', type: 'select', editable: true, department: 'all', options: ['650', '651', '652', '653', '674', '703', '638', '791'] },
            { id: 'gadudName', name: 'שם (ניפוק גדודי)', type: 'text', editable: true, department: 'all' },
            { id: 'gadudId', name: 'מספר אישי (ניפוק גדודי)', type: 'text', editable: true, department: 'all' },
            { id: 'remainingFuel', name: 'כמות דלק שנשאר (ניפוק גדודי)', type: 'number', editable: true, department: 'all' }
        ];
        
        // הוסף עמודות חדשות אם הן לא קיימות
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

    // הוספת עמודה חדשה
    addColumn(columnName, columnType, department) {
        const newColumn = {
            id: Date.now().toString(),
            name: columnName,
            type: columnType,
            editable: true,
            department: department
        };

        this.tableColumns.push(newColumn);
        this.saveTableColumns(this.tableColumns);
        this.renderTable();
        this.showStatus('עמודה נוספה בהצלחה', 'success');
    }

    // עריכת עמודה
    editColumn(columnId, newName, newType, newDepartment) {
        const columnIndex = this.tableColumns.findIndex(col => col.id === columnId);
        if (columnIndex !== -1) {
            this.tableColumns[columnIndex].name = newName;
            this.tableColumns[columnIndex].type = newType;
            this.tableColumns[columnIndex].department = newDepartment;
            this.saveTableColumns(this.tableColumns);
            this.renderTable();
            this.showStatus('עמודה עודכנה בהצלחה', 'success');
        }
    }

    // מחיקת עמודה
    deleteColumn(columnId) {
        this.tableColumns = this.tableColumns.filter(col => col.id !== columnId);
        this.saveTableColumns(this.tableColumns);
        this.renderTable();
        this.showStatus('עמודה נמחקה בהצלחה', 'success');
    }




    // טופס העברת כרטיס
    showTransferCardForm() {
        const cardNumber = prompt('הכנס מספר כרטיס להעברה:');
        if (!cardNumber) return;
        
        const newHolderName = prompt('הכנס שם המחזיק החדש:');
        if (!newHolderName) return;
        
        const newHolderPhone = prompt('הכנס טלפון המחזיק החדש:');
        if (!newHolderPhone) return;
        
        const amountUsed = prompt('כמה ליטר השתמשת? (השאר ריק אם לא השתמשת):');
        const amount = amountUsed ? parseInt(amountUsed) : 0;
        
        this.transferCard(parseInt(cardNumber), newHolderName, newHolderPhone, amount);
    }

    // טופס עדכון שימוש
    showUpdateCardForm() {
        const cardNumber = prompt('הכנס מספר כרטיס לעדכון:');
        if (!cardNumber) return;
        
        const amountUsed = prompt('כמה ליטר השתמשת?');
        if (!amountUsed) return;
        
        const notes = prompt('הערות (אופציונלי):');
        
        this.updateCardByHolder(parseInt(cardNumber), parseInt(amountUsed), notes);
    }

    // טופס זיכוי סופי
    showFinalReturnForm() {
        const cardNumber = prompt('הכנס מספר כרטיס לזיכוי סופי:');
        if (!cardNumber) return;
        
        if (confirm('האם אתה בטוח שברצונך לבצע זיכוי סופי לכרטיס ' + cardNumber + '?')) {
            this.finalReturn(parseInt(cardNumber));
        }
    }


    // הורדת Excel
    downloadExcel() {
        const filteredCards = this.getFilteredCards();
        
        if (filteredCards.length === 0) {
            this.showStatus('אין נתונים להורדה', 'error');
            return;
        }
        
        // יצירת CSV עם העמודות החדשות
        let csv = 'מספר כרטיס,שם,טלפון,כמות (ליטר),סוג דלק,מספר גדוד,סטטוס,תאריך,משתמש,שם (ניפוק גדודי),מספר אישי (ניפוק גדודי),כמות דלק שנשאר (ניפוק גדודי)\n';
        
        filteredCards.forEach(card => {
            const userInfo = this.getUserInfo(card).replace(/<br>/g, ' | ');
            // הוספת העמודות החדשות - כרגע ריקות, ניתן להוסיף לוגיקה בהמשך
            const gadudNumber = card.gadudNumber || '';
            const gadudName = card.gadudName || '';
            const gadudId = card.gadudId || '';
            const remainingFuel = card.remainingFuel || card.amount || '';
            
            csv += `${card.cardNumber},${card.name},${card.phone},${card.amount},${card.fuelType},${gadudNumber},${this.getStatusText(card.status)},${card.date},${userInfo},${gadudName},${gadudId},${remainingFuel}\n`;
        });
        
        // הורדה
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `fuel_cards_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.showStatus('קובץ Excel הורד בהצלחה', 'success');
    }

    // הוספת נתונים גדודיים לכרטיס
    async addGadudData(cardNumber, gadudName, gadudId, remainingFuel) {
        // בדיקת הרשאות - רק משתמשים רגילים יכולים לעבוד עם נתונים גדודיים
        if (!this.currentUser || this.currentUser.isAdmin) {
            this.showStatus('רק משתמשים רגילים יכולים לעבוד עם נתונים גדודיים', 'error');
            return;
        }

        const cardIndex = this.fuelCards.findIndex(card => card.cardNumber === cardNumber);
        
        if (cardIndex === -1) {
            this.showStatus('כרטיס לא נמצא במערכת', 'error');
            return;
        }

        // בדיקה שהכרטיס שייך לגדוד של המשתמש
        if (this.fuelCards[cardIndex].gadudNumber !== this.currentUser.gadud) {
            this.showStatus('אין לך הרשאה לערוך כרטיסים של גדודים אחרים', 'error');
            return;
        }

        this.fuelCards[cardIndex].gadudName = gadudName;
        this.fuelCards[cardIndex].gadudId = gadudId;
        this.fuelCards[cardIndex].remainingFuel = remainingFuel;
        this.fuelCards[cardIndex].date = new Date().toLocaleString('he-IL');

        await this.saveDataToFirebase();
        this.renderTable();
        this.showStatus('נתונים גדודיים נוספו בהצלחה', 'success');
    }

    // עדכון נתונים גדודיים לכרטיס
    async updateGadudData(cardNumber, gadudName, gadudId, remainingFuel) {
        // בדיקת הרשאות - רק משתמשים רגילים יכולים לעבוד עם נתונים גדודיים
        if (!this.currentUser || this.currentUser.isAdmin) {
            this.showStatus('רק משתמשים רגילים יכולים לעבוד עם נתונים גדודיים', 'error');
            return;
        }

        const cardIndex = this.fuelCards.findIndex(card => card.cardNumber === cardNumber);
        
        if (cardIndex === -1) {
            this.showStatus('כרטיס לא נמצא במערכת', 'error');
            return;
        }

        // בדיקה שהכרטיס שייך לגדוד של המשתמש
        if (this.fuelCards[cardIndex].gadudNumber !== this.currentUser.gadud) {
            this.showStatus('אין לך הרשאה לערוך כרטיסים של גדודים אחרים', 'error');
            return;
        }

        this.fuelCards[cardIndex].gadudName = gadudName;
        this.fuelCards[cardIndex].gadudId = gadudId;
        this.fuelCards[cardIndex].remainingFuel = remainingFuel;
        this.fuelCards[cardIndex].date = new Date().toLocaleString('he-IL');

        await this.saveDataToFirebase();
        this.renderTable();
        this.showStatus('נתונים גדודיים עודכנו בהצלחה', 'success');
    }

    // מחיקת נתונים גדודיים מכרטיס (זיכוי גדודי)
    async clearGadudData(cardNumber) {
        // בדיקת הרשאות - רק משתמשים רגילים יכולים לעבוד עם נתונים גדודיים
        if (!this.currentUser || this.currentUser.isAdmin) {
            this.showStatus('רק משתמשים רגילים יכולים לעבוד עם נתונים גדודיים', 'error');
            return;
        }

        const cardIndex = this.fuelCards.findIndex(card => card.cardNumber === cardNumber);
        
        if (cardIndex === -1) {
            this.showStatus('כרטיס לא נמצא במערכת', 'error');
            return;
        }

        // בדיקה שהכרטיס שייך לגדוד של המשתמש
        if (this.fuelCards[cardIndex].gadudNumber !== this.currentUser.gadud) {
            this.showStatus('אין לך הרשאה לערוך כרטיסים של גדודים אחרים', 'error');
            return;
        }
        
        this.fuelCards[cardIndex].gadudName = '';
        this.fuelCards[cardIndex].gadudId = '';
        this.fuelCards[cardIndex].remainingFuel = '';
        this.fuelCards[cardIndex].date = new Date().toLocaleString('he-IL');

        await this.saveDataToFirebase();
        this.renderTable();
        this.showStatus('נתונים גדודיים נמחקו בהצלחה (זיכוי גדודי)', 'success');
    }

    // מערכת התחברות והרשאות
    getCurrentUser() {
        return JSON.parse(localStorage.getItem('currentUser') || 'null');
    }

    setCurrentUser(user) {
        localStorage.setItem('currentUser', JSON.stringify(user));
        this.currentUser = user;
    }

    logout() {
        localStorage.removeItem('currentUser');
        this.currentUser = null;
        this.showLoginForm();
    }

    checkLogin() {
        if (!this.currentUser) {
            this.showLoginForm();
        } else {
            this.showMainInterface();
        }
    }

    showLoginForm() {
        // הסתר את הממשק הראשי
        document.querySelector('.container').style.display = 'none';
        
        // הצג טופס התחברות
        document.getElementById('loginForm').style.display = 'block';
    }

    showMainInterface() {
        // הסתר טופס התחברות
        document.getElementById('loginForm').style.display = 'none';
        
        // הצג את הממשק הראשי
        document.querySelector('.container').style.display = 'block';
        
        // עדכן את הממשק לפי הרשאות המשתמש
        this.updateInterfaceByPermissions();
    }

    login() {
        const name = document.getElementById('loginName').value;
        const gadud = document.getElementById('loginGadud').value;
        
        if (!name || !gadud) {
            this.showLoginStatus('יש למלא את כל השדות', 'error');
            return;
        }
        
        const user = {
            name: name.trim(),
            gadud: gadud,
            isAdmin: gadud === 'admin',
            loginTime: new Date().toLocaleString('he-IL')
        };
        
            this.setCurrentUser(user);
            this.showMainInterface();
            this.showStatus(`ברוך הבא ${user.name}!`, 'success');
    }

    showLoginStatus(message, type) {
        const statusDiv = document.getElementById('loginStatus');
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';
        
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }

    updateInterfaceByPermissions() {
        const user = this.currentUser;
        if (!user) return;

        // עדכן את המידע על המשתמש
        const userInfo = document.getElementById('currentUserInfo');
        const userInfoDiv = document.getElementById('userInfo');
        const adminPanelBtn = document.getElementById('adminPanelBtn');
        
        if (user.isAdmin) {
            userInfo.textContent = `${user.name} - מנהל מערכת`;
            adminPanelBtn.style.display = 'inline-block';
        } else {
            userInfo.textContent = `${user.name} - גדוד ${user.gadud}`;
            adminPanelBtn.style.display = 'none';
        }
        
        userInfoDiv.style.display = 'block';
        
        // הסתר/הצג כפתורים לפי הרשאות
        this.updateButtonVisibility();
        
        // עדכן את הטבלה לפי הרשאות
        this.renderTable();
    }

    // עדכון נראות כפתורים לפי הרשאות
    updateButtonVisibility() {
        const user = this.currentUser;
        if (!user) return;

        // כפתורי ניפוק/עדכון/החזרת כרטיס - רק למנהל
        const adminButtons = [
            'button[onclick*="startRecording(\'new\')"]',
            'button[onclick*="showTypingForm(\'new\')"]',
            'button[onclick*="startRecording(\'update\')"]',
            'button[onclick*="showTypingForm(\'update\')"]',
            'button[onclick*="startRecording(\'return\')"]',
            'button[onclick*="showTypingForm(\'return\')"]'
        ];

        // כפתורי פעולות גדודיות - לכולם
        const gadudButtons = [
            'button[onclick*="showTypingForm(\'gadud_new\')"]',
            'button[onclick*="showTypingForm(\'gadud_update\')"]',
            'button[onclick*="showTypingForm(\'gadud_return\')"]'
        ];

        if (user.isAdmin) {
            // מנהל - הצג הכל
            adminButtons.forEach(selector => {
                const buttons = document.querySelectorAll(selector);
                buttons.forEach(btn => btn.style.display = 'block');
            });
            gadudButtons.forEach(selector => {
                const buttons = document.querySelectorAll(selector);
                buttons.forEach(btn => btn.style.display = 'block');
            });
        } else {
            // משתמש רגיל - הסתר כפתורי מנהל, הצג רק גדודיים
            adminButtons.forEach(selector => {
                const buttons = document.querySelectorAll(selector);
                buttons.forEach(btn => btn.style.display = 'none');
            });
            gadudButtons.forEach(selector => {
                const buttons = document.querySelectorAll(selector);
                buttons.forEach(btn => btn.style.display = 'block');
            });
        }
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

    // הצגת טופס בחירת גדוד אחרי הקלטה קולית
    showGadudSelectionForm(command) {
        // הסתר את הממשק הראשי
        document.querySelector('.container').style.display = 'none';
        
        // צור/הצג טופס בחירת גדוד
        let gadudForm = document.getElementById('gadudSelectionForm');
        if (!gadudForm) {
            gadudForm = this.createGadudSelectionForm();
            document.body.appendChild(gadudForm);
        }
        
        // שמור את הפקודה לטופס
        gadudForm.setAttribute('data-command', JSON.stringify(command));
        gadudForm.style.display = 'block';
    }

    createGadudSelectionForm() {
        const form = document.createElement('div');
        form.id = 'gadudSelectionForm';
        form.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
            ">
                <div style="
                    background: white;
                    padding: 40px;
                    border-radius: 15px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                    text-align: center;
                    min-width: 500px;
                ">
                    <h2 style="color: #2c3e50; margin-bottom: 30px;">בחירת מספר גדוד</h2>
                    <div style="margin-bottom: 20px;">
                        <p style="color: #666; margin-bottom: 20px;">בחר מספר גדוד עבור הכרטיס:</p>
                        <select id="gadudSelection" style="
                    width: 100%;
                            padding: 15px;
                            border: 2px solid #ddd;
                            border-radius: 8px;
                            font-size: 16px;
                            margin-bottom: 20px;
                        ">
                            <option value="">בחר מספר גדוד (אופציונלי)</option>
                            <option value="650">650</option>
                            <option value="651">651</option>
                            <option value="652">652</option>
                            <option value="653">653</option>
                            <option value="674">674</option>
                            <option value="703">703</option>
                            <option value="638">638</option>
                            <option value="791">791</option>
                            </select>
                        </div>
                    <div style="display: flex; gap: 15px; justify-content: center;">
                        <button onclick="fuelCardManager.confirmGadudSelection()" style="
                            background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
                            color: white;
                            border: none;
                            padding: 15px 30px;
                            border-radius: 25px;
                            font-size: 16px;
                            cursor: pointer;
                        ">אישור</button>
                        <button onclick="fuelCardManager.cancelGadudSelection()" style="
                            background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%);
                        color: white;
                        border: none;
                            padding: 15px 30px;
                            border-radius: 25px;
                            font-size: 16px;
                        cursor: pointer;
                        ">ביטול</button>
                </div>
            </div>
            </div>
        `;
        return form;
    }

    confirmGadudSelection() {
        const gadudForm = document.getElementById('gadudSelectionForm');
        const command = JSON.parse(gadudForm.getAttribute('data-command'));
        const selectedGadud = document.getElementById('gadudSelection').value;
        
        // הוסף את מספר הגדוד לפקודה
        command.gadudNumber = selectedGadud;
        
        // סגור את הטופס
        gadudForm.style.display = 'none';
        document.querySelector('.container').style.display = 'block';
        
        // המשך עם יצירת הכרטיס
        this.addNewCard(command);
    }

    cancelGadudSelection() {
        const gadudForm = document.getElementById('gadudSelectionForm');
        gadudForm.style.display = 'none';
        document.querySelector('.container').style.display = 'block';
        this.showStatus('ניפוק הכרטיס בוטל', 'error');
    }

    // פונקציות לניהול המערכת
    clearAllData() {
        if (confirm('האם אתה בטוח שברצונך למחוק את כל הנתונים? פעולה זו לא ניתנת לביטול!')) {
            localStorage.clear();
            this.fuelCards = [];
            this.currentUser = null;
            this.saveData();
            this.renderTable();
            this.showStatus('כל הנתונים נמחקו', 'success');
            this.showLoginForm();
        }
    }

    resetSystem() {
        if (confirm('האם אתה בטוח שברצונך לאפס את המערכת? כל הנתונים יימחקו!')) {
            // מחיקת כל הנתונים
            localStorage.removeItem('fuelCards');
            localStorage.removeItem('fuelCardColumns');
            localStorage.removeItem('currentUser');
            
            // איפוס המערכת
            this.fuelCards = [];
            this.currentUser = null;
            this.tableColumns = this.loadTableColumns();
            
            // רענון הממשק
            this.renderTable();
            this.showLoginForm();
            
            this.showStatus('המערכת אופסה בהצלחה', 'success');
        }
    }

    // פונקציה להצגת פאנל מנהל
    showAdminPanel() {
        if (!this.currentUser || !this.currentUser.isAdmin) {
            this.showStatus('אין לך הרשאה לגשת לפאנל מנהל', 'error');
            return;
        }

        const adminPanel = document.createElement('div');
        adminPanel.id = 'adminPanel';
        adminPanel.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
            ">
                <div style="
                    background: white;
                    padding: 40px;
                    border-radius: 15px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                    text-align: center;
                    min-width: 500px;
                ">
                    <h2 style="color: #2c3e50; margin-bottom: 30px;">פאנל מנהל</h2>
                    <div style="margin-bottom: 20px;">
                        <button onclick="fuelCardManager.clearAllData()" style="
                            background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
                            color: white;
                            border: none;
                            padding: 15px 30px;
                            border-radius: 25px;
                            font-size: 16px;
                            cursor: pointer;
                            margin: 10px;
                            width: 100%;
                        ">מחק כל הנתונים</button>
                    </div>
                    <div style="margin-bottom: 20px;">
                        <button onclick="fuelCardManager.resetSystem()" style="
                            background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
                            color: white;
                            border: none;
                            padding: 15px 30px;
                            border-radius: 25px;
                            font-size: 16px;
                            cursor: pointer;
                            margin: 10px;
                            width: 100%;
                        ">אפס מערכת</button>
                    </div>
                    <div style="margin-bottom: 20px;">
                        <button onclick="fuelCardManager.showSystemInfo()" style="
                            background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
                        color: white;
                        border: none;
                            padding: 15px 30px;
                            border-radius: 25px;
                            font-size: 16px;
                        cursor: pointer;
                            margin: 10px;
                width: 100%;
                        ">מידע על המערכת</button>
                    </div>
                    <button onclick="fuelCardManager.closeAdminPanel()" style="
                        background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%);
                            color: white;
                            border: none;
                        padding: 15px 30px;
                        border-radius: 25px;
                        font-size: 16px;
                            cursor: pointer;
                        margin: 10px;
                        width: 100%;
                        ">סגור</button>
                </div>
            </div>
        `;
        document.body.appendChild(adminPanel);
    }

    closeAdminPanel() {
        const adminPanel = document.getElementById('adminPanel');
        if (adminPanel) {
            adminPanel.remove();
        }
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
}

// אתחול המערכת
console.log('מתחיל לטעון את המערכת...');
const fuelCardManager = new FuelCardManager();
console.log('המערכת נטענה בהצלחה!');

// פונקציות גלובליות
function startRecording(action) {
    fuelCardManager.startRecording(action);
}

function downloadExcel() {
    fuelCardManager.downloadExcel();
}

// הצגת טופס הקלדה - פונקציה גלובלית
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

// הסתרת טופס הקלדה
function hideTypingForm() {
    hideAllTypingForms();
}

// שליחת טופס ניפוק כרטיס חדש
function submitNewCard() {
    console.log('שולח טופס ניפוק כרטיס חדש');
    
    const cardNumber = document.getElementById('newCardNumber').value;
    const name = document.getElementById('newName').value;
    const phone = document.getElementById('newPhone').value;
    const amount = document.getElementById('newAmount').value;
    const fuelType = document.getElementById('newFuelType').value;
    const gadudNumber = document.getElementById('newGadudNumber').value;
    
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
        gadudNumber: gadudNumber || ''
    };
    
    console.log('פקודה נוצרה:', command);
    
    // ביצוע הפעולה
    try {
        fuelCardManager.addNewCard(command);
        hideTypingForm();
        clearNewCardForm();
    } catch (error) {
        console.log('שגיאה בהוספת כרטיס:', error);
        fuelCardManager.showStatus('שגיאה בהוספת הכרטיס: ' + error.message, 'error');
    }
}

// שליחת טופס עדכון כרטיס
function submitUpdateCard() {
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
    
    console.log('פקודת עדכון נוצרה:', command);
    
    // ביצוע הפעולה
    try {
        fuelCardManager.updateCard(command);
        hideTypingForm();
        clearUpdateCardForm();
    } catch (error) {
        console.log('שגיאה בעדכון כרטיס:', error);
        fuelCardManager.showStatus('שגיאה בעדכון הכרטיס: ' + error.message, 'error');
    }
}

// שליחת טופס החזרת כרטיס
function submitReturnCard() {
    console.log('שולח טופס החזרת כרטיס');
    
    const cardNumber = document.getElementById('returnCardNumber').value;
    
    // בדיקת שדה חובה
    if (!cardNumber) {
        fuelCardManager.showStatus('יש למלא מספר כרטיס', 'error');
        return;
    }
    
    // יצירת פקודה
    const command = {
        type: 'return',
        cardNumber: parseInt(cardNumber)
    };
    
    console.log('פקודת החזרה נוצרה:', command);
    
    // ביצוע הפעולה
    try {
        fuelCardManager.returnCard(command);
        hideTypingForm();
        clearReturnCardForm();
    } catch (error) {
        console.log('שגיאה בהחזרת כרטיס:', error);
        fuelCardManager.showStatus('שגיאה בהחזרת הכרטיס: ' + error.message, 'error');
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
}

// ניקוי טופס עדכון כרטיס
function clearUpdateCardForm() {
    document.getElementById('updateCardNumber').value = '';
    document.getElementById('updateAmount').value = '';
}

// ניקוי טופס החזרת כרטיס
function clearReturnCardForm() {
    document.getElementById('returnCardNumber').value = '';
}

// שליחת טופס ניפוק גדודי
function submitGadudNew() {
    console.log('שולח טופס ניפוק גדודי');
    
    const cardNumber = document.getElementById('gadudCardNumber').value;
    const gadudName = document.getElementById('gadudName').value;
    const gadudId = document.getElementById('gadudId').value;
    const remainingFuel = document.getElementById('gadudRemainingFuel').value;
    
    // בדיקת שדות חובה
    if (!cardNumber || !gadudName || !gadudId || !remainingFuel) {
        fuelCardManager.showStatus('יש למלא את כל השדות', 'error');
        return;
    }
    
    // ביצוע הפעולה
    try {
        fuelCardManager.addGadudData(parseInt(cardNumber), gadudName, gadudId, parseInt(remainingFuel));
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
    const gadudId = document.getElementById('gadudUpdateId').value;
    const remainingFuel = document.getElementById('gadudUpdateRemainingFuel').value;
    
    // בדיקת שדות חובה
    if (!cardNumber || !gadudName || !gadudId || !remainingFuel) {
        fuelCardManager.showStatus('יש למלא את כל השדות', 'error');
        return;
    }
    
    // ביצוע הפעולה
    try {
        fuelCardManager.updateGadudData(parseInt(cardNumber), gadudName, gadudId, parseInt(remainingFuel));
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
    
    // בדיקת שדה חובה
    if (!cardNumber) {
        fuelCardManager.showStatus('יש למלא מספר כרטיס', 'error');
        return;
    }
    
    // ביצוע הפעולה
    try {
        fuelCardManager.clearGadudData(parseInt(cardNumber));
        hideTypingForm();
        clearGadudReturnForm();
    } catch (error) {
        console.log('שגיאה בזיכוי גדודי:', error);
        fuelCardManager.showStatus('שגיאה בזיכוי גדודי: ' + error.message, 'error');
    }
}

// ניקוי טופס ניפוק גדודי
function clearGadudNewForm() {
    document.getElementById('gadudCardNumber').value = '';
    document.getElementById('gadudName').value = '';
    document.getElementById('gadudId').value = '';
    document.getElementById('gadudRemainingFuel').value = '';
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
}

// הצגת הוראות קוליות
function showVoiceInstructions(action) {
    const instructionsDiv = document.getElementById('voiceInstructions');
    const instructionText = document.getElementById('instructionText');
    
    let content = '';
    
    if (action === 'new') {
        content = `
            <div class="instruction-content">
                <strong>ניפוק כרטיס חדש</strong><br>
                אמור את הפרטים הבאים בסדר הזה:
            </div>
            <div class="example">
                "כרטיס [מספר] [שם] [טלפון] [כמות] ליטר [סוג דלק]"
            </div>
            <div class="instruction-content">
                <strong>דוגמה:</strong><br>
                "כרטיס 123 עומרי בן גיגי 05-06620734 50 ליטר בנזין"
            </div>
            <div class="instruction-content">
                <strong>או עם פסיקים:</strong><br>
                "כרטיס 123, עומרי בן גיגי, 05-06620734, 50 ליטר, בנזין"
            </div>
        `;
    } else if (action === 'update') {
        content = `
            <div class="instruction-content">
                <strong>עדכון כרטיס</strong><br>
                אמור את הפרטים הבאים:
            </div>
            <div class="example">
                "עדכון כרטיס [מספר], [כמות חדשה] ליטר"
            </div>
            <div class="instruction-content">
                <strong>דוגמה:</strong><br>
                "עדכון כרטיס 12345, 30 ליטר"
            </div>
        `;
    } else if (action === 'return') {
        content = `
            <div class="instruction-content">
                <strong>החזרת כרטיס</strong><br>
                אמור את הפרטים הבאים:
            </div>
            <div class="example">
                "החזרה כרטיס [מספר]"
            </div>
            <div class="instruction-content">
                <strong>דוגמה:</strong><br>
                "החזרה כרטיס 12345"
            </div>
        `;
    } else if (action === 'gadud_new') {
        content = `
            <div class="instruction-content">
                <strong>ניפוק גדודי</strong><br>
                אמור את הפרטים הבאים:
            </div>
            <div class="example">
                "ניפוק גדודי כרטיס [מספר] [שם] [מספר אישי] [כמות דלק שנשאר]"
            </div>
            <div class="instruction-content">
                <strong>דוגמה:</strong><br>
                "ניפוק גדודי כרטיס 123 יוסי כהן 1234567 30"
            </div>
        `;
    } else if (action === 'gadud_update') {
        content = `
            <div class="instruction-content">
                <strong>עדכון גדודי</strong><br>
                אמור את הפרטים הבאים:
            </div>
            <div class="example">
                "עדכון גדודי כרטיס [מספר] [שם] [מספר אישי] [כמות דלק שנשאר]"
            </div>
            <div class="instruction-content">
                <strong>דוגמה:</strong><br>
                "עדכון גדודי כרטיס 123 יוסי כהן 1234567 20"
            </div>
        `;
    } else if (action === 'gadud_return') {
        content = `
            <div class="instruction-content">
                <strong>זיכוי גדודי</strong><br>
                אמור את הפרטים הבאים:
            </div>
            <div class="example">
                "זיכוי גדודי כרטיס [מספר]"
            </div>
            <div class="instruction-content">
                <strong>דוגמה:</strong><br>
                "זיכוי גדודי כרטיס 123"
            </div>
        `;
    }
    
    instructionText.innerHTML = content;
    instructionsDiv.style.display = 'block';
}

// הסתרת הוראות
function hideInstructions() {
    const instructionsDiv = document.getElementById('voiceInstructions');
    instructionsDiv.style.display = 'none';
}

// הוספת תמיכה במקלדת לטופסים
document.addEventListener('DOMContentLoaded', function() {
    // תמיכה במקלדת לטופס ניפוק כרטיס חדש
    const newCardInputs = ['newCardNumber', 'newName', 'newPhone', 'newAmount', 'newFuelType'];
    newCardInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    submitNewCard();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    hideTypingForm();
                }
            });
        }
    });
    
    // תמיכה במקלדת לטופס עדכון כרטיס
    const updateCardInputs = ['updateCardNumber', 'updateAmount'];
    updateCardInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    submitUpdateCard();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    hideTypingForm();
                }
            });
        }
    });
    
    // תמיכה במקלדת לטופס החזרת כרטיס
    const returnCardInput = document.getElementById('returnCardNumber');
    if (returnCardInput) {
        returnCardInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitReturnCard();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                hideTypingForm();
            }
        });
    }
    
    console.log('תמיכה במקלדת הופעלה');
});