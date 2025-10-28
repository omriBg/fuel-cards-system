// מערכת ניהול כרטיסי דלק עם הקלטה קולית
class FuelCardManager {
    constructor() {
        console.log('מתחיל את מערכת ניהול כרטיסי הדלק...');
        this.recognition = null;
        this.isRecording = false;
        this.fuelCards = this.loadData();
        console.log('כרטיסים נטענו:', this.fuelCards.length);
        this.initSpeechRecognition();
        this.renderTable();
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
            fuelType
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
    addNewCard(command) {
        const existingIndex = this.fuelCards.findIndex(card => card.cardNumber === command.cardNumber);
        
        if (existingIndex !== -1) {
            this.showStatus('כרטיס כבר קיים במערכת', 'error');
            return;
        }
        
        const newCard = {
            cardNumber: command.cardNumber,
            name: command.name,
            phone: command.phone,
            amount: command.amount,
            fuelType: command.fuelType,
            status: 'new',
            date: new Date().toLocaleString('he-IL')
        };
        
        this.fuelCards.push(newCard);
        this.saveData();
        this.renderTable();
        this.showStatus('כרטיס חדש נוסף בהצלחה', 'success');
    }

    // עדכון כרטיס קיים
    updateCard(command) {
        const cardIndex = this.fuelCards.findIndex(card => card.cardNumber === command.cardNumber);
        
        if (cardIndex === -1) {
            this.showStatus('כרטיס לא נמצא במערכת', 'error');
            return;
        }
        
        this.fuelCards[cardIndex].amount = command.amount;
        this.fuelCards[cardIndex].status = 'updated';
        this.fuelCards[cardIndex].date = new Date().toLocaleString('he-IL');
        
        this.saveData();
        this.renderTable();
        this.showStatus('כרטיס עודכן בהצלחה', 'success');
    }

    // החזרת כרטיס
    returnCard(command) {
        const cardIndex = this.fuelCards.findIndex(card => card.cardNumber === command.cardNumber);
        
        if (cardIndex === -1) {
            this.showStatus('כרטיס לא נמצא במערכת', 'error');
            return;
        }
        
        this.fuelCards[cardIndex].amount = 0;
        this.fuelCards[cardIndex].status = 'returned';
        this.fuelCards[cardIndex].date = new Date().toLocaleString('he-IL');
        
        this.saveData();
        this.renderTable();
        this.showStatus('כרטיס הוחזר בהצלחה', 'success');
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
        
        this.fuelCards.forEach(card => {
            const row = document.createElement('tr');
            
            // הוספת מחלקת צבע לפי סטטוס
            if (card.status === 'new') {
                row.classList.add('row-new');
            } else if (card.status === 'updated') {
                row.classList.add('row-updated');
            } else if (card.status === 'returned') {
                row.classList.add('row-returned');
            }
            
            row.innerHTML = `
                <td>${card.cardNumber}</td>
                <td>${card.name}</td>
                <td>${card.phone}</td>
                <td>${card.amount}</td>
                <td>${card.fuelType}</td>
                <td>${this.getStatusText(card.status)}</td>
                <td>${card.date}</td>
            `;
            
            tbody.appendChild(row);
        });
    }

    // קבלת טקסט סטטוס
    getStatusText(status) {
        switch (status) {
            case 'new': return 'חדש';
            case 'updated': return 'עודכן';
            case 'returned': return 'הוחזר';
            default: return status;
        }
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

    // הורדת Excel
    downloadExcel() {
        if (this.fuelCards.length === 0) {
            this.showStatus('אין נתונים להורדה', 'error');
            return;
        }
        
        // יצירת CSV
        let csv = 'מספר כרטיס,שם,טלפון,כמות (ליטר),סוג דלק,סטטוס,תאריך\n';
        
        this.fuelCards.forEach(card => {
            csv += `${card.cardNumber},${card.name},${card.phone},${card.amount},${card.fuelType},${this.getStatusText(card.status)},${card.date}\n`;
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
    
    // בדיקת שדות חובה
    if (!cardNumber || !name || !phone || !amount || !fuelType) {
        fuelCardManager.showStatus('יש למלא את כל השדות', 'error');
        return;
    }
    
    // יצירת פקודה
    const command = {
        type: 'new',
        cardNumber: parseInt(cardNumber),
        name: name.trim(),
        phone: phone.trim(),
        amount: parseInt(amount),
        fuelType: fuelType.trim()
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





