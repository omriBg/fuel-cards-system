// מערכת ניהול כרטיסי דלק עם Firebase Firestore
class FuelCardManager {
    constructor() {
        console.log('מתחיל את מערכת ניהול כרטיסי הדלק עם Firebase... - עדכון חדש 2025!');
        this.recognition = null;
        this.isRecording = false;
        this.fuelCards = [];
        this.tableColumns = this.loadTableColumns();
        this.currentUser = this.getCurrentUser();
        this.errors = [];
        this.isInitialized = false;
        this.statusModalTimeout = null;
        this.handleStatusModalKeydown = this.handleStatusModalKeydown.bind(this);
        this.bulkIssue = {
            active: false,
            data: null
        };
        this.adminGadudContacts = {
            '651': { name: 'דור בן לולו', phone: '054-3091641' },
            '652': { name: 'לי נאגר', phone: '050-5559153' },
            '653': { name: 'אביחי', phone: '050-6909403' },
            '638': { name: 'מירב עדן בניאס', phone: '052-6889285' },
            '674': { name: 'נועה אסולין', phone: '052-7891707' },
            '703': { name: 'תאיר בנימיני', phone: '052-2030798' },
            '791': { name: 'סהר דניאל', phone: '052-9202202' }
        };
        document.addEventListener('keydown', this.handleStatusModalKeydown);
        this.setupGadudAutoFillHandler();
        
        // מערכת הגבלת קצב בקשות
        this.rateLimiter = {
            requests: new Map(),
            maxRequests: 100, // מקסימום בקשות לדקה
            windowMs: 60000, // חלון זמן של דקה
            maxConcurrent: 10 // מקסימום בקשות בו-זמנית
        };
        
        console.log('עמודות טבלה:', this.tableColumns);
        console.log('משתמש נוכחי:', this.currentUser);
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

    // ניסיון התחברות ל-Firebase Authentication (Anonymous)
    async attemptAnonymousAuth() {
        try {
            if (window.auth && window.signInAnonymously) {
                // בדיקה אם המשתמש כבר מחובר
                if (window.auth.currentUser) {
                    console.log('משתמש כבר מחובר:', window.auth.currentUser.uid);
                    return true;
                }
                
                // ניסיון התחברות אנונימית
                const userCredential = await window.signInAnonymously(window.auth);
                console.log('התחברות אנונימית הצליחה:', userCredential.user.uid);
                return true;
            }
            return false;
        } catch (error) {
            // אם יש שגיאה, נמשיך בלי authentication (הכללים מאפשרים זאת)
            console.warn('שגיאה בהתחברות אנונימית (המערכת תמשיך לעבוד):', error.message);
            return false;
        }
    }

    async initialize() {
        try {
            this.initSpeechRecognition();
            this.checkLogin();
            
            // ניסיון התחברות ל-Firebase Authentication לפני טעינת נתונים
            await this.attemptAnonymousAuth();
            
            await this.loadDataFromFirebase();
            this.isInitialized = true;
            console.log('המערכת מוכנה לשימוש!');
        } catch (error) {
            console.error('שגיאה באתחול המערכת:', error);
            this.logError('Initialize Error', error);
            this.showStatus('שגיאה באתחול המערכת', 'error');
        }
    }

    // פונקציות לוגינג וטיפול בשגיאות
    logError(context, error) {
        const errorLog = {
            timestamp: new Date().toISOString(),
            context: context,
            message: error.message || error,
            stack: error.stack || 'No stack trace',
            userAgent: navigator.userAgent,
            url: window.location.href
        };
        
        this.errors.push(errorLog);
        console.error(`[${context}]`, errorLog);
        
        // שמירה ל-localStorage למטרות דיבוג
        try {
            const existingErrors = JSON.parse(localStorage.getItem('fuelCardErrors') || '[]');
            existingErrors.push(errorLog);
            // שמור רק 50 השגיאות האחרונות
            if (existingErrors.length > 50) {
                existingErrors.splice(0, existingErrors.length - 50);
            }
            localStorage.setItem('fuelCardErrors', JSON.stringify(existingErrors));
        } catch (e) {
            console.error('שגיאה בשמירת לוג:', e);
        }
    }

    // בדיקת תקינות קלט מחמירה
    validateInput(input, type, required = true) {
        // בדיקת null/undefined
        if (required && (!input || input.toString().trim() === '')) {
            throw new Error(`${type} הוא שדה חובה`);
        }
        
        // בדיקת אורך מקסימלי
        if (input && input.toString().length > 1000) {
            throw new Error('קלט ארוך מדי');
        }
        
        if (input) {
            switch (type) {
                case 'cardNumber':
                    const cardStr = input.toString().trim();
                    if (!/^\d{4,12}$/.test(cardStr)) {
                        throw new Error('מספר כרטיס חייב להכיל רק ספרות (4-12 ספרות)');
                    }
                    const cardNum = parseInt(cardStr);
                    if (cardNum < 1000 || cardNum > 999999999999) {
                        throw new Error('מספר כרטיס חייב להיות בין 1000 ל-999999999999');
                    }
                    return cardNum;
                    
                case 'name':
                    const name = input.toString().trim();
                    if (name.length < 2 || name.length > 50) {
                        throw new Error('שם חייב להיות בין 2 ל-50 תווים');
                    }
                    // רק אותיות עבריות, רווחים ומינוס
                    if (!/^[\u0590-\u05FF\s\-]+$/.test(name)) {
                        throw new Error('שם חייב להכיל רק אותיות עבריות, רווחים ומינוס');
                    }
                    // בדיקת תווים מסוכנים
                    if (/[<>\"'&]/.test(name)) {
                        throw new Error('שם מכיל תווים לא מורשים');
                    }
                    return this.sanitizeInput(name);
                    
                case 'phone':
                    const phone = input.toString().trim();
                    // פורמט ישראלי מחמיר
                    if (!/^0(5[0-9]|2[0-9]|3[0-9]|4[0-9]|7[0-9]|8[0-9]|9[0-9])-?\d{7}$/.test(phone)) {
                        throw new Error('מספר טלפון ישראלי לא תקין');
                    }
                    return phone;
                    
                case 'amount':
                    const amountStr = input.toString().trim();
                    if (!/^\d+$/.test(amountStr)) {
                        throw new Error('כמות חייבת להכיל רק ספרות');
                    }
                    const amount = parseInt(amountStr);
                    if (isNaN(amount) || amount < 1 || amount > 10000) {
                        throw new Error('כמות חייבת להיות בין 1 ל-10000 ליטר');
                    }
                    return amount;
                    
                case 'fuelType':
                    const fuel = input.toString().trim();
                    const allowedFuels = ['בנזין', 'סולר', 'דיזל', 'גז', 'חשמל', 'היברידי'];
                    if (!allowedFuels.includes(fuel)) {
                        throw new Error('סוג דלק לא תקין - בחר: בנזין, סולר, דיזל, גז, חשמל, היברידי');
                    }
                    return fuel;
                    
                case 'gadudNumber':
                    const gadud = input.toString().trim();
                    const allowedGaduds = ['650', '703', '651', '791', '652', '638', '653', '674', 'admin'];
                    if (gadud && !allowedGaduds.includes(gadud)) {
                        throw new Error('מספר גדוד לא תקין');
                    }
                    return gadud;
                    
                default:
                    return this.sanitizeInput(input.toString().trim());
            }
        }
        
        return input;
    }

    // ניקוי וחיטוי קלטים
    sanitizeInput(input) {
        if (!input) return '';
        
        return input.toString()
            .replace(/[<>\"'&]/g, '') // הסרת תווים מסוכנים
            .replace(/javascript:/gi, '') // הסרת JavaScript
            .replace(/on\w+=/gi, '') // הסרת event handlers
            .replace(/<script/gi, '') // הסרת script tags
            .replace(/<iframe/gi, '') // הסרת iframe tags
            .replace(/<object/gi, '') // הסרת object tags
            .replace(/<embed/gi, '') // הסרת embed tags
            .replace(/<link/gi, '') // הסרת link tags
            .replace(/<meta/gi, '') // הסרת meta tags
            .trim();
    }

    // הגנה מפני XSS
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    // בדיקת הגבלת קצב בקשות
    checkRateLimit(userId = 'anonymous') {
        const now = Date.now();
        const userRequests = this.rateLimiter.requests.get(userId) || [];
        
        // ניקוי בקשות ישנות
        const validRequests = userRequests.filter(time => now - time < this.rateLimiter.windowMs);
        
        // בדיקת מקסימום בקשות
        if (validRequests.length >= this.rateLimiter.maxRequests) {
            throw new Error('יותר מדי בקשות - נסה שוב בעוד דקה');
        }
        
        // הוספת בקשה נוכחית
        validRequests.push(now);
        this.rateLimiter.requests.set(userId, validRequests);
        
        return true;
    }

    // בדיקת אבטחה כללית
    securityCheck(action, data = {}) {
        try {
            // בדיקת קצב בקשות
            const userId = this.currentUser?.name || 'anonymous';
            this.checkRateLimit(userId);
            
            // בדיקת הרשאות - רק אם זה לא פעולת התחברות
            if (action !== 'login' && !this.currentUser) {
                throw new Error('נדרשת התחברות');
            }
            
            // בדיקת נתונים חשודים
            const suspiciousPatterns = [
                /<script/i,
                /javascript:/i,
                /on\w+=/i,
                /eval\(/i,
                /function\s*\(/i,
                /document\./i,
                /window\./i
            ];
            
            const dataString = JSON.stringify(data);
            for (const pattern of suspiciousPatterns) {
                if (pattern.test(dataString)) {
                    this.logError('Security Violation', new Error(`Suspicious pattern detected: ${pattern}`));
                    throw new Error('נתונים חשודים זוהו');
                }
            }
            
            return true;
        } catch (error) {
            this.logError('Security Check Failed', error);
            throw error;
        }
    }

    // אתחול מערכת זיהוי דיבור
    initSpeechRecognition() {
        try {
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
        } catch (error) {
            console.error('שגיאה באתחול זיהוי דיבור:', error);
            this.logError('Speech Recognition Init', error);
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
        try {
            // בדיקת אבטחה
            this.securityCheck('addNewCard', command);
            
            // בדיקת הרשאות - רק מנהל יכול לנפק כרטיסים
            if (!this.currentUser || !this.currentUser.isAdmin) {
                this.showStatus('אין לך הרשאה לנפק כרטיסים. רק מנהל מערכת יכול לבצע פעולה זו.', 'error');
                return;
            }
            
            // ולידציה של הקלט
            const validatedCommand = {
                cardNumber: this.validateInput(command.cardNumber, 'cardNumber'),
                name: this.validateInput(command.name, 'name'),
                phone: this.validateInput(command.phone, 'phone'),
                amount: this.validateInput(command.amount, 'amount'),
                fuelType: this.validateInput(command.fuelType, 'fuelType'),
                gadudNumber: command.gadudNumber || '',
                issueDate: command.issueDate || this.formatDateTime()
            };
            
            // בדיקה שהכרטיס לא קיים (בצד הלקוח)
            const existingIndex = this.fuelCards.findIndex(card => card.cardNumber === validatedCommand.cardNumber);
            if (existingIndex !== -1) {
                this.showStatus('כרטיס כבר קיים במערכת', 'error');
                return;
            }
            
            // בדיקה שהכרטיס לא קיים ב-Firebase (בצד השרת)
            try {
                // ניסיון התחברות אנונימית לפני בדיקה
                await this.attemptAnonymousAuth();
                
                const querySnapshot = await window.firebaseGetDocs(
                    window.firebaseQuery(
                        window.firebaseCollection(window.db, 'fuelCards'),
                        window.firebaseWhere('cardNumber', '==', parseInt(validatedCommand.cardNumber))
                    )
                );
                
                if (!querySnapshot.empty) {
                    this.showStatus('כרטיס כבר קיים במערכת', 'error');
                    return;
                }
            } catch (error) {
                console.error('שגיאה בבדיקת כרטיס קיים ב-Firebase:', error);
                // אם יש שגיאה, נמשיך (לא נחסום את המשתמש)
            }
            
            // אם זה מהקלטה קולית ולא מהטופס, נציג טופס בחירת גדוד
            if (!validatedCommand.gadudNumber && command.fromVoice) {
                this.showGadudSelectionForm(validatedCommand);
                return;
            }
            
            const newCard = {
                cardNumber: parseInt(validatedCommand.cardNumber),
                name: validatedCommand.name,
                phone: validatedCommand.phone,
                amount: parseInt(validatedCommand.amount),
                fuelType: validatedCommand.fuelType,
                gadudNumber: validatedCommand.gadudNumber,
                issueDate: validatedCommand.issueDate,
                status: 'new',
                date: new Date().toLocaleString('he-IL'),
                // שרשרת העברת כרטיס
                cardChain: [{
                    action: 'ניפוק ראשוני',
                    amount: parseInt(validatedCommand.amount),
                    date: new Date().toLocaleString('he-IL'),
                    status: 'active',
                    userName: this.currentUser.name || 'מערכת'
                }],
                currentHolder: 'system',
                currentHolderName: 'מערכת'
            };
            
            // ניסיון התחברות אנונימית לפני הוספה
            await this.attemptAnonymousAuth();
            
            // הוסף ישירות ל-Firebase (לא דרך saveDataToFirebase)
            await window.firebaseAddDoc(
                window.firebaseCollection(window.db, 'fuelCards'),
                newCard
            );
            
            // עדכן את המערך המקומי
            this.fuelCards.push(newCard);
            this.renderTable();
            this.showStatus('כרטיס חדש נוסף בהצלחה', 'success');
            
        } catch (error) {
            console.error('שגיאה בהוספת כרטיס:', error);
            this.logError('Add New Card', error);
            this.showStatus('שגיאה בהוספת הכרטיס: ' + error.message, 'error');
        }
    }

    // עדכון כרטיס קיים
    async updateCard(command) {
        try {
            // בדיקת אבטחה
            this.securityCheck('updateCard', command);
            
            // בדיקת הרשאות - רק מנהל יכול לעדכן כרטיסים
            if (!this.currentUser || !this.currentUser.isAdmin) {
                this.showStatus('אין לך הרשאה לעדכן כרטיסים. רק מנהל מערכת יכול לבצע פעולה זו.', 'error');
                return;
            }
            
            const cardIndex = this.fuelCards.findIndex(card => card.cardNumber === parseInt(command.cardNumber));
            
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
            
        } catch (error) {
            this.logError('Update Card', error);
            this.showStatus('שגיאה בעדכון הכרטיס: ' + error.message, 'error');
        }
    }

    // החזרת כרטיס
    async returnCard(command) {
        try {
            // בדיקת אבטחה
            this.securityCheck('returnCard', command);
            
            // בדיקת הרשאות - רק מנהל יכול להחזיר כרטיסים
            if (!this.currentUser || !this.currentUser.isAdmin) {
                this.showStatus('אין לך הרשאה להחזיר כרטיסים. רק מנהל מערכת יכול לבצע פעולה זו.', 'error');
                return;
            }
            
            const cardIndex = this.fuelCards.findIndex(card => card.cardNumber === parseInt(command.cardNumber));
            
            if (cardIndex === -1) {
                this.showStatus('כרטיס לא נמצא במערכת', 'error');
                return;
            }
            
            this.fuelCards[cardIndex].amount = 0;
            this.fuelCards[cardIndex].status = 'returned';
            this.fuelCards[cardIndex].date = this.formatDateTime();
            // שמירת תאריך זיכוי
            const creditDate = command.creditDate || this.formatDateTime();
            this.fuelCards[cardIndex].creditDate = creditDate;
            
            await this.saveDataToFirebase();
            this.renderTable();
            this.showStatus('כרטיס הוחזר בהצלחה', 'success');
            
        } catch (error) {
            this.logError('Return Card', error);
            this.showStatus('שגיאה בהחזרת הכרטיס: ' + error.message, 'error');
        }
    }

    // העברת כרטיס לאדם אחר
    transferCard(cardNumber, newHolderName, newHolderPhone, amountUsed) {
        const cardIndex = this.fuelCards.findIndex(card => card.cardNumber === parseInt(cardNumber));
        
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
        const cardIndex = this.fuelCards.findIndex(card => card.cardNumber === parseInt(cardNumber));
        
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
        const cardIndex = this.fuelCards.findIndex(card => card.cardNumber === parseInt(cardNumber));
        
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
        if (statusDiv) {
            statusDiv.textContent = message;
            statusDiv.className = `status ${type}`;
            statusDiv.style.display = 'block';
            
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 3000);
        }

        this.openStatusModal(message, type);
    }

    openStatusModal(message, type = 'info') {
        const modal = document.getElementById('statusModal');
        const messageEl = document.getElementById('statusModalMessage');
        const titleEl = document.getElementById('statusModalTitle');
        const iconEl = document.getElementById('statusModalIcon');

        if (!modal || !messageEl) {
            return;
        }

        const titles = {
            success: 'הפעולה הצליחה',
            error: 'פעולה נכשלה',
            recording: 'מקליט...',
            processing: 'מעבד בקשה',
            info: 'עדכון מערכת'
        };

        const icons = {
            success: '✓',
            error: '!',
            recording: '●',
            processing: '…',
            info: 'ℹ'
        };

        const statusType = titles[type] ? type : 'info';
        if (titleEl) {
            titleEl.textContent = titles[statusType];
        }
        if (iconEl) {
            iconEl.textContent = icons[statusType];
        }
        messageEl.textContent = message;

        modal.setAttribute('data-status-type', statusType);
        modal.classList.remove('status-modal--hidden');
        modal.classList.add('status-modal--visible');
        modal.setAttribute('aria-hidden', 'false');

        if (this.statusModalTimeout) {
            clearTimeout(this.statusModalTimeout);
        }

        // השאר הודעות שגיאה על המסך עד לסגירה ידנית
        if (statusType !== 'error') {
            this.statusModalTimeout = setTimeout(() => {
                this.closeStatusModal();
            }, 4500);
        }
    }

    closeStatusModal() {
        const modal = document.getElementById('statusModal');
        if (!modal) {
            return;
        }

        modal.classList.remove('status-modal--visible');
        modal.classList.add('status-modal--hidden');
        modal.setAttribute('aria-hidden', 'true');

        if (this.statusModalTimeout) {
            clearTimeout(this.statusModalTimeout);
            this.statusModalTimeout = null;
        }
    }

    handleStatusModalKeydown(event) {
        if (event.key === 'Escape') {
            this.closeStatusModal();
        }
    }

    enableBulkIssue(data) {
        if (!this.currentUser || !this.currentUser.isAdmin) {
            return;
        }
        this.bulkIssue.active = true;
        this.bulkIssue.data = { ...data };
        this.applyBulkIssueDataToForm();
        this.updateBulkIssueUI();
        this.showStatus('מצב מקבץ הופעל - אפשר להנפיק מספר כרטיסים לאותו גורם', 'success');
    }

    disableBulkIssue(showMessage = true) {
        if (!this.currentUser || !this.currentUser.isAdmin) {
            return;
        }
        this.bulkIssue.active = false;
        this.bulkIssue.data = null;
        this.updateBulkIssueUI();
        if (showMessage) {
            this.showStatus('מצב מקבץ בוטל', 'info');
        }
    }

    isBulkIssueActive() {
        return !!(this.currentUser && this.currentUser.isAdmin && this.bulkIssue.active && this.bulkIssue.data);
    }

    applyBulkIssueDataToForm() {
        if (!this.isBulkIssueActive()) {
            return;
        }
        const { name, phone, gadudNumber } = this.bulkIssue.data;
        const nameInput = document.getElementById('newName');
        const phoneInput = document.getElementById('newPhone');
        const gadudSelect = document.getElementById('newGadudNumber');

        if (nameInput) nameInput.value = name || '';
        if (phoneInput) phoneInput.value = phone || '';
        if (gadudSelect) gadudSelect.value = gadudNumber || '';
    }

    updateBulkIssueUI() {
        const controls = document.getElementById('bulkIssueControls');
        const statusText = document.getElementById('bulkIssueStatus');
        if (!controls) {
            return;
        }

        if (!this.currentUser || !this.currentUser.isAdmin) {
            controls.style.display = 'none';
            return;
        }

        controls.style.display = 'block';
        if (statusText) {
            if (this.isBulkIssueActive()) {
                statusText.textContent = `פעיל (${this.bulkIssue.data.name || ''})`;
                controls.classList.add('bulk-issue--active');
            } else {
                statusText.textContent = 'כבוי';
                controls.classList.remove('bulk-issue--active');
            }
        }
    }

    clearBulkIssueState() {
        this.bulkIssue.active = false;
        this.bulkIssue.data = null;
        this.updateBulkIssueUI();
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
        if (this.isBulkIssueActive()) {
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

    // רינדור טבלה
    renderTable() {
        const tbody = document.getElementById('fuelCardsBody');
        tbody.innerHTML = '';
        
        // עדכון כותרות הטבלה
        this.updateTableHeaders();
        
        // קבל כרטיסים מסוננים לפי הרשאות וחיפוש
        const filteredCards = this.getFilteredAndSearchedCards();
        
        // בדיקה אם יש חיפוש פעיל
        const searchInput = document.getElementById('searchInput');
        const hasSearch = searchInput && searchInput.value.trim();
        
        // עדכון סטטיסטיקות
        this.updateStats(filteredCards);
        
        // הצג/הסתר הודעת תוצאות חיפוש
        const searchResultsInfo = document.getElementById('searchResultsInfo');
        const searchResultsCount = document.getElementById('searchResultsCount');
        if (hasSearch && filteredCards.length > 0) {
            if (searchResultsInfo) searchResultsInfo.style.display = 'block';
            if (searchResultsCount) searchResultsCount.textContent = filteredCards.length;
        } else {
            if (searchResultsInfo) searchResultsInfo.style.display = 'none';
        }
        
        // הצג/הסתר empty state
        const emptyState = document.getElementById('tableEmptyState');
        const table = document.getElementById('fuelCardsTable');
        if (filteredCards.length === 0) {
            if (emptyState) emptyState.style.display = 'block';
            if (table) table.style.display = 'none';
            if (searchResultsInfo) searchResultsInfo.style.display = 'none';
        } else {
            if (emptyState) emptyState.style.display = 'none';
            if (table) table.style.display = 'table';
        }
        
        filteredCards.forEach(card => {
            const row = document.createElement('tr');
            
            // הוספת מחלקת צבע לפי סטטוס
            // ניפוק/עדכון גדודי - צהוב (אם יש נתונים גדודיים)
            if (card.gadudName || card.gadudId) {
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
            this.tableColumns.forEach(column => {
                // בדוק אם המשתמש יכול לראות את העמודה
                if (this.canViewColumn(column)) {
                    let cellValue = this.getCellValue(card, column);
                    // אם זו עמודת כמות דלק שנשאר, הוסף אפשרות לחיצה לזיכוי גדודי
                    if (column.id === 'remainingFuel') {
                        const isClickable = card.gadudName || card.gadudId; // רק אם יש נתונים גדודיים
                        const clickableClass = isClickable ? 'clickable-remaining-fuel' : '';
                        const cursorStyle = isClickable ? 'cursor: pointer;' : '';
                        const title = isClickable ? 'לחץ לזיכוי גדודי (איפוס ל-0)' : '';
                        rowContent += `<td class="${clickableClass}" style="${cursorStyle}" title="${title}" ${isClickable ? `onclick="window.fuelCardManager.showGadudCreditConfirmation('${card.cardNumber}', '')"` : ''}>${cellValue}</td>`;
                    } else {
                        rowContent += `<td>${cellValue}</td>`;
                    }
                }
            });
            
            row.innerHTML = rowContent;
            tbody.appendChild(row);
        });
    }
    
    // סינון וחיפוש כרטיסים
    getFilteredAndSearchedCards() {
        let cards = this.getFilteredCards();
        
        // סינון לפי סטטוס
        const statusFilter = document.getElementById('statusFilter');
        if (statusFilter && statusFilter.value === 'not_returned') {
            // הצג רק כרטיסים שלא זוכו (לא ירוקים)
            cards = cards.filter(card => {
                return card.status !== 'returned' && card.status !== 'final_return';
            });
        }
        // אם statusFilter.value === 'all' - הצג הכל (אין צורך לסנן)
        
        // חיפוש
        const searchInput = document.getElementById('searchInput');
        if (searchInput && searchInput.value.trim()) {
            const searchTerm = searchInput.value.trim().toLowerCase();
            cards = cards.filter(card => {
                const cardNumber = (card.cardNumber || '').toString().toLowerCase();
                const name = (card.name || '').toLowerCase();
                const phone = (card.phone || '').toLowerCase();
                return cardNumber.includes(searchTerm) || 
                       name.includes(searchTerm) || 
                       phone.includes(searchTerm);
            });
        }
        
        return cards;
    }
    
    // סינון טבלה לפי חיפוש
    filterTable() {
        this.renderTable();
    }
    
    // עדכון סטטיסטיקות
    updateStats(cards) {
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

    // קבלת ערך תא עם הגנה מפני XSS
    getCellValue(card, column) {
        let value = '';
        switch(column.id) {
            case 'cardNumber':
                value = card.cardNumber || '';
                break;
            case 'name':
                value = card.name || '';
                break;
            case 'phone':
                value = card.phone || '';
                break;
            case 'amount':
                value = card.amount || '';
                break;
            case 'fuelType':
                value = card.fuelType || '';
                break;
            case 'gadudNumber':
                value = card.gadudNumber || '';
                break;
            case 'status':
                value = this.getStatusText(card.status);
                break;
            case 'issueDate':
                value = card.issueDate || card.date || '';
                break;
            case 'currentHolder':
                value = card.currentHolderName || 'לא זמין';
                break;
            case 'cardChain':
                value = this.getCardChainText(card.cardChain);
                break;
            case 'gadudName':
                value = card.gadudName || '';
                break;
            case 'gadudId':
                value = card.gadudId || '';
                break;
            case 'remainingFuel':
                value = (card.remainingFuel !== undefined && card.remainingFuel !== null) ? card.remainingFuel : (card.amount || '');
                break;
            default:
                // עמודות מותאמות אישית
                value = card[column.id] || '';
        }
        
        // הגנה מפני XSS - escape HTML
        return this.escapeHtml(value.toString());
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
            
            // הצג loading state
            this.showLoadingState();
            
            // בדיקה ש-Firebase נטען
            if (!window.firebaseCollection || !window.db) {
                console.log('Firebase עדיין לא נטען, מחכה...');
                await new Promise(resolve => setTimeout(resolve, 1000));
                if (!window.firebaseCollection || !window.db) {
                    console.log('Firebase לא נטען, עובר ל-localStorage');
                    this.fuelCards = this.loadData();
                    this.hideLoadingState();
                    this.renderTable();
                    return;
                }
            }
            
            // ניסיון התחברות אנונימית לפני טעינת נתונים
            await this.attemptAnonymousAuth();
            
            const querySnapshot = await window.firebaseGetDocs(window.firebaseCollection(window.db, 'fuelCards'));
            this.fuelCards = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                data.id = doc.id; // הוסף את ה-ID של המסמך
                this.fuelCards.push(data);
            });
            console.log('כרטיסים נטענו מ-Firebase:', this.fuelCards.length);
            this.hideLoadingState();
            this.renderTable();
        } catch (error) {
            console.error('שגיאה בטעינת נתונים מ-Firebase:', error);
            console.log('עובר ל-localStorage');
            this.fuelCards = this.loadData();
            this.hideLoadingState();
            this.renderTable();
        }
    }
    
    // הצגת loading state
    showLoadingState() {
        const tbody = document.getElementById('fuelCardsBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="100%" style="text-align: center; padding: 40px; color: #666;">טוען נתונים...</td></tr>';
        }
    }
    
    // הסתרת loading state
    hideLoadingState() {
        // renderTable ידאג לניקוי
    }

    // שמירת נתונים ל-Firebase - יעיל (מעדכן רק מה שהשתנה)
    async saveDataToFirebase() {
        try {
            console.log('שומר נתונים ל-Firebase...');
            
            // ניסיון התחברות אנונימית לפני שמירה
            await this.attemptAnonymousAuth();
            
            // טען את כל הכרטיסים הקיימים ב-Firebase
            const querySnapshot = await window.firebaseGetDocs(window.firebaseCollection(window.db, 'fuelCards'));
            
            // צור מפה של cardNumber -> Firebase document ID
            const firebaseCardsMap = new Map();
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                firebaseCardsMap.set(data.cardNumber, { id: doc.id, data: data });
            });
            
            // צור מפה של cardNumber -> כרטיס מקומי
            const localCardsMap = new Map();
            this.fuelCards.forEach(card => {
                localCardsMap.set(card.cardNumber, card);
            });
            
            // פעולות לעדכון
            const addPromises = [];
            const updatePromises = [];
            const deletePromises = [];
            
            // עבור על כל הכרטיסים המקומיים
            for (const card of this.fuelCards) {
                const firebaseCard = firebaseCardsMap.get(card.cardNumber);
                
                if (firebaseCard) {
                    // כרטיס קיים - בדוק אם השתנה
                    const hasChanged = JSON.stringify(card) !== JSON.stringify(firebaseCard.data);
                    if (hasChanged) {
                        // עדכן רק אם השתנה
                        updatePromises.push(
                            window.firebaseUpdateDoc(
                                window.firebaseDoc(window.db, 'fuelCards', firebaseCard.id),
                                card
                            )
                        );
                    }
                } else {
                    // כרטיס חדש - הוסף
                    addPromises.push(
                        window.firebaseAddDoc(
                            window.firebaseCollection(window.db, 'fuelCards'),
                            card
                        )
                    );
                }
            }
            
            // מצא כרטיסים שנמחקו (יש ב-Firebase אבל לא מקומיים)
            for (const [cardNumber, firebaseCard] of firebaseCardsMap.entries()) {
                if (!localCardsMap.has(cardNumber)) {
                    deletePromises.push(
                        window.firebaseDeleteDoc(
                            window.firebaseDoc(window.db, 'fuelCards', firebaseCard.id)
                        )
                    );
                }
            }
            
            // בצע את כל הפעולות
            await Promise.all([...addPromises, ...updatePromises, ...deletePromises]);
            
            const stats = {
                added: addPromises.length,
                updated: updatePromises.length,
                deleted: deletePromises.length
            };
            
            console.log(`נתונים נשמרו ל-Firebase בהצלחה: ${stats.added} נוספו, ${stats.updated} עודכנו, ${stats.deleted} נמחקו`);
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
                { id: 'gadudNumber', name: 'מספר גדוד', type: 'select', editable: true, department: 'all', options: ['650', '703', '651', '791', '652', '638', '653', '674'] },
                { id: 'issueDate', name: 'תאריך ניפוק', type: 'date', editable: true, department: 'all' },
                { id: 'creditDate', name: 'תאריך זיכוי', type: 'date', editable: true, department: 'all' },
                { id: 'status', name: 'סטטוס', type: 'text', editable: false, department: 'all' },
                { id: 'gadudName', name: 'שם (ניפוק גדודי)', type: 'text', editable: true, department: 'all' },
                { id: 'gadudId', name: 'מספר אישי (ניפוק גדודי)', type: 'text', editable: true, department: 'all' },
                { id: 'remainingFuel', name: 'כמות דלק שנשאר (ניפוק גדודי)', type: 'number', editable: true, department: 'all' },
                { id: 'gadudIssueDate', name: 'תאריך ניפוק גדודי', type: 'date', editable: true, department: 'all' },
                { id: 'gadudCreditDate', name: 'תאריך זיכוי גדודי', type: 'date', editable: true, department: 'all' }
            ];
            this.saveTableColumns(defaultColumns);
            return defaultColumns;
        }
        
        // אם יש עמודות קיימות, נבדוק אם צריך להוסיף את העמודות החדשות
        const existingColumns = JSON.parse(columns);
        const newColumns = [
            { id: 'gadudNumber', name: 'מספר גדוד', type: 'select', editable: true, department: 'all', options: ['650', '703', '651', '791', '652', '638', '653', '674'] },
            { id: 'issueDate', name: 'תאריך ניפוק', type: 'date', editable: true, department: 'all' },
            { id: 'creditDate', name: 'תאריך זיכוי', type: 'date', editable: true, department: 'all' },
            { id: 'gadudName', name: 'שם (ניפוק גדודי)', type: 'text', editable: true, department: 'all' },
            { id: 'gadudId', name: 'מספר אישי (ניפוק גדודי)', type: 'text', editable: true, department: 'all' },
            { id: 'remainingFuel', name: 'כמות דלק שנשאר (ניפוק גדודי)', type: 'number', editable: true, department: 'all' },
            { id: 'gadudIssueDate', name: 'תאריך ניפוק גדודי', type: 'date', editable: true, department: 'all' },
            { id: 'gadudCreditDate', name: 'תאריך זיכוי גדודי', type: 'date', editable: true, department: 'all' }
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
        
        // הוספת כותרות
        excelData.push([
            'מספר כרטיס',
            'שם',
            'טלפון',
            'כמות (ליטר)',
            'סוג דלק',
            'מספר גדוד',
            'סטטוס',
            'תאריך ניפוק',
            'משתמש',
            'שם (ניפוק גדודי)',
            'מספר אישי (ניפוק גדודי)',
            'כמות דלק שנשאר (ניפוק גדודי)'
        ]);
        
        // הוספת הנתונים
        filteredCards.forEach(card => {
            const userInfo = this.getUserInfo(card).replace(/<br>/g, ' | ');
            const gadudNumber = card.gadudNumber || '';
            const gadudName = card.gadudName || '';
            const gadudId = card.gadudId || '';
            const remainingFuel = card.remainingFuel || card.amount || '';
            
            excelData.push([
                card.cardNumber,
                card.name,
                card.phone,
                card.amount,
                card.fuelType,
                gadudNumber,
                this.getStatusText(card.status),
                card.issueDate || card.date || '',
                userInfo,
                gadudName,
                gadudId,
                remainingFuel
            ]);
        });
        
        // יצירת workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(excelData);
        
        // הגדרת רוחב עמודות
        const colWidths = [
            { wch: 12 },  // מספר כרטיס
            { wch: 20 },  // שם
            { wch: 15 },  // טלפון
            { wch: 12 },  // כמות
            { wch: 12 },  // סוג דלק
            { wch: 12 },  // מספר גדוד
            { wch: 12 },  // סטטוס
            { wch: 18 },  // תאריך ניפוק
            { wch: 20 },  // משתמש
            { wch: 20 },  // שם גדודי
            { wch: 20 },  // מספר אישי גדודי
            { wch: 25 }   // כמות דלק שנשאר
        ];
        ws['!cols'] = colWidths;
        
        // הוספת גיליון ל-workbook
        XLSX.utils.book_append_sheet(wb, ws, 'כרטיסי דלק');
        
        // הורדת הקובץ
        const fileName = `fuel_cards_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        this.showStatus('קובץ Excel הורד בהצלחה', 'success');
    }

    // הוספת נתונים גדודיים לכרטיס
    async addGadudData(cardNumber, gadudName, gadudId, remainingFuel, gadudIssueDate) {
        // בדיקת הרשאות - צריך משתמש מחובר
        if (!this.currentUser) {
            this.showStatus('נדרשת התחברות', 'error');
            return;
        }

        const cardIndex = this.fuelCards.findIndex(card => card.cardNumber === parseInt(cardNumber));
        
        if (cardIndex === -1) {
            this.showStatus('כרטיס לא נמצא במערכת', 'error');
            return;
        }

        // בדיקה שהכרטיס לא הוחזר לגמרי (זיכוי סופי)
        const card = this.fuelCards[cardIndex];
        if (card.status === 'returned' || card.status === 'final_return') {
            this.showStatus('לא ניתן לבצע פעולות גדודיות על כרטיס שהוחזר לגמרי (זיכוי סופי)', 'error');
            return;
        }

        // בדיקה שהכרטיס שייך לגדוד של המשתמש (רק למשתמשים רגילים, מנהל יכול הכל)
        if (!this.currentUser.isAdmin && card.gadudNumber !== this.currentUser.gadud) {
            this.showStatus('אין לך הרשאה לערוך כרטיסים של גדודים אחרים', 'error');
            return;
        }

        this.fuelCards[cardIndex].gadudName = gadudName;
        this.fuelCards[cardIndex].gadudId = gadudId;
        if (typeof remainingFuel !== 'undefined') {
            this.fuelCards[cardIndex].remainingFuel = remainingFuel;
        }
        this.fuelCards[cardIndex].gadudIssueDate = gadudIssueDate || this.formatDateTime();
        this.fuelCards[cardIndex].date = this.formatDateTime();

        await this.saveDataToFirebase();
        this.renderTable();
        this.showStatus('נתונים גדודיים נוספו בהצלחה', 'success');
    }

    // עדכון נתונים גדודיים לכרטיס
    async updateGadudData(cardNumber, gadudName, gadudId, remainingFuel) {
        // בדיקת הרשאות - צריך משתמש מחובר
        if (!this.currentUser) {
            this.showStatus('נדרשת התחברות', 'error');
            return;
        }

        const cardIndex = this.fuelCards.findIndex(card => card.cardNumber === parseInt(cardNumber));
        
        if (cardIndex === -1) {
            this.showStatus('כרטיס לא נמצא במערכת', 'error');
            return;
        }

        // בדיקה שהכרטיס לא הוחזר לגמרי (זיכוי סופי)
        const card = this.fuelCards[cardIndex];
        if (card.status === 'returned' || card.status === 'final_return') {
            this.showStatus('לא ניתן לבצע פעולות גדודיות על כרטיס שהוחזר לגמרי (זיכוי סופי)', 'error');
            return;
        }

        // בדיקה שהכרטיס שייך לגדוד של המשתמש (רק למשתמשים רגילים, מנהל יכול הכל)
        if (!this.currentUser.isAdmin && card.gadudNumber !== this.currentUser.gadud) {
            this.showStatus('אין לך הרשאה לערוך כרטיסים של גדודים אחרים', 'error');
            return;
        }

        this.fuelCards[cardIndex].gadudName = gadudName;
        this.fuelCards[cardIndex].gadudId = gadudId;
        this.fuelCards[cardIndex].remainingFuel = remainingFuel;
        this.fuelCards[cardIndex].date = this.formatDateTime();

        await this.saveDataToFirebase();
        this.renderTable();
        this.showStatus('נתונים גדודיים עודכנו בהצלחה', 'success');
    }

    // מחיקת נתונים גדודיים מכרטיס (זיכוי גדודי)
    async clearGadudData(cardNumber, gadudCreditDate) {
        // בדיקת הרשאות - צריך משתמש מחובר
        if (!this.currentUser) {
            this.showStatus('נדרשת התחברות', 'error');
            return;
        }

        const cardIndex = this.fuelCards.findIndex(card => card.cardNumber === parseInt(cardNumber));
        
        if (cardIndex === -1) {
            this.showStatus('כרטיס לא נמצא במערכת', 'error');
            return;
        }

        // בדיקה שהכרטיס לא הוחזר לגמרי (זיכוי סופי)
        const card = this.fuelCards[cardIndex];
        if (card.status === 'returned' || card.status === 'final_return') {
            this.showStatus('לא ניתן לבצע פעולות גדודיות על כרטיס שהוחזר לגמרי (זיכוי סופי)', 'error');
            return;
        }

        // בדיקה שהכרטיס שייך לגדוד של המשתמש (רק למשתמשים רגילים, מנהל יכול הכל)
        if (!this.currentUser.isAdmin && card.gadudNumber !== this.currentUser.gadud) {
            this.showStatus('אין לך הרשאה לערוך כרטיסים של גדודים אחרים', 'error');
            return;
        }
        
        this.fuelCards[cardIndex].gadudName = '';
        this.fuelCards[cardIndex].gadudId = '';
        this.fuelCards[cardIndex].remainingFuel = 0;
        this.fuelCards[cardIndex].gadudCreditDate = gadudCreditDate || this.formatDateTime();
        this.fuelCards[cardIndex].date = this.formatDateTime();

        await this.saveDataToFirebase();
        this.renderTable();
        this.showStatus('נתונים גדודיים נמחקו בהצלחה (זיכוי גדודי)', 'success');
    }

    // הצגת חלונית אישור לזיכוי גדודי
    showGadudCreditConfirmation(cardNumber, gadudCreditDate) {
        // הסתר את הממשק הראשי
        document.querySelector('.container').style.display = 'none';
        
        // צור/הצג חלונית אישור
        let confirmationDialog = document.getElementById('gadudCreditConfirmationDialog');
        if (!confirmationDialog) {
            confirmationDialog = this.createGadudCreditConfirmationDialog();
            document.body.appendChild(confirmationDialog);
        }
        
        // שמור את הפרטים לחלונית
        confirmationDialog.setAttribute('data-card-number', cardNumber);
        confirmationDialog.setAttribute('data-credit-date', gadudCreditDate);
        confirmationDialog.style.display = 'block';
    }

    createGadudCreditConfirmationDialog() {
        const dialog = document.createElement('div');
        dialog.id = 'gadudCreditConfirmationDialog';
        dialog.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
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
                    max-width: 600px;
                ">
                    <h2 style="color: #2c3e50; margin-bottom: 30px; font-size: 1.5em;">אישור זיכוי גדודי</h2>
                    <div style="
                        background: #fff3cd;
                        border: 2px solid #ffc107;
                        border-radius: 10px;
                        padding: 25px;
                        margin-bottom: 30px;
                        text-align: right;
                        direction: rtl;
                    ">
                        <p style="
                            color: #856404;
                            font-size: 1.1em;
                            line-height: 1.8;
                            margin: 0;
                            font-weight: 500;
                        ">
                            אני מאשר כי בדקתי ווידאתי שאכן הכרטיס נוצל עד תום והוא ריק לגמרי מדלק (או באמצעות האתר הייעודי לכך או באמצעות קבלות).
                        </p>
                    </div>
                    <div style="display: flex; gap: 15px; justify-content: center;">
                        <button onclick="window.fuelCardManager.confirmGadudCredit()" style="
                            background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
                            color: white;
                            border: none;
                            padding: 15px 30px;
                            border-radius: 25px;
                            font-size: 16px;
                            cursor: pointer;
                            font-weight: 600;
                            min-width: 120px;
                        ">מאשר</button>
                        <button onclick="window.fuelCardManager.cancelGadudCredit()" style="
                            background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
                            color: white;
                            border: none;
                            padding: 15px 30px;
                            border-radius: 25px;
                            font-size: 16px;
                            cursor: pointer;
                            font-weight: 600;
                            min-width: 120px;
                        ">לא מאשר</button>
                    </div>
                </div>
            </div>
        `;
        return dialog;
    }

    confirmGadudCredit() {
        const dialog = document.getElementById('gadudCreditConfirmationDialog');
        if (!dialog) return;
        
        const cardNumber = dialog.getAttribute('data-card-number');
        const gadudCreditDate = dialog.getAttribute('data-credit-date');
        
        // סגור את החלונית
        dialog.style.display = 'none';
        document.querySelector('.container').style.display = 'block';
        
        // ביצוע הזיכוי
        this.clearGadudData(cardNumber, gadudCreditDate);
        hideTypingForm();
        clearGadudReturnForm();
    }

    cancelGadudCredit() {
        const dialog = document.getElementById('gadudCreditConfirmationDialog');
        if (!dialog) return;
        
        // סגור את החלונית
        dialog.style.display = 'none';
        document.querySelector('.container').style.display = 'block';
        
        // הצג הודעה
        this.showStatus('זיכוי גדודי בוטל', 'error');
    }

    // מערכת התחברות והרשאות
    getCurrentUser() {
        return JSON.parse(localStorage.getItem('currentUser') || 'null');
    }

    setCurrentUser(user) {
        localStorage.setItem('currentUser', JSON.stringify(user));
        this.currentUser = user;
    }

    async logout() {
        // התנתקות מ-Firebase Authentication
        if (window.auth && window.signOut) {
            try {
                await window.signOut(window.auth);
                console.log('Firebase Authentication sign out successful');
            } catch (authError) {
                console.error('Firebase Authentication sign out error:', authError);
            }
        }
        
        localStorage.removeItem('currentUser');
        this.currentUser = null;
        this.clearBulkIssueState();
        this.showSplashScreen();
        setTimeout(() => {
            this.hideSplashScreen();
            this.showLoginForm();
        }, 2000);
    }

    checkLogin() {
        // הצגת מסך פתיחה תחילה
        this.showSplashScreen();
        
        // אחרי 6 שניות, בדוק התחברות
        setTimeout(() => {
            this.hideSplashScreen();
            if (!this.currentUser) {
                this.showLoginForm();
            } else {
                this.showMainInterface();
            }
        }, 6000);
    }

    // הצגת מסך פתיחה
    showSplashScreen() {
        const splashScreen = document.getElementById('splashScreen');
        const mainContainer = document.getElementById('mainContainer');
        
        if (splashScreen) {
            splashScreen.style.display = 'flex';
        }
        if (mainContainer) {
            mainContainer.style.display = 'none';
        }
    }

    // הסתרת מסך פתיחה
    hideSplashScreen() {
        const splashScreen = document.getElementById('splashScreen');
        const mainContainer = document.getElementById('mainContainer');
        
        if (splashScreen) {
            splashScreen.classList.add('fade-out');
            
            // אחרי האנימציה, הסתר את מסך הפתיחה והצג את הממשק הראשי
            setTimeout(() => {
                splashScreen.style.display = 'none';
                if (mainContainer) {
                    mainContainer.style.display = 'block';
                }
            }, 600); // זמן האנימציה
        }
    }

    showLoginForm() {
        // הסתר את הממשק הראשי
        const mainContainer = document.getElementById('mainContainer');
        if (mainContainer) {
            mainContainer.style.display = 'none';
        }
        
        // הצג טופס התחברות
        document.getElementById('loginForm').style.display = 'block';
    }

    showMainInterface() {
        // הסתר טופס התחברות
        document.getElementById('loginForm').style.display = 'none';
        
        // הצג את הממשק הראשי
        const mainContainer = document.getElementById('mainContainer');
        if (mainContainer) {
            mainContainer.style.display = 'block';
        }
        
        // עדכן את הממשק לפי הרשאות המשתמש
        this.updateInterfaceByPermissions();
    }

    async login() {
        try {
            const name = document.getElementById('loginName').value.trim();
            const gadud = document.getElementById('loginGadud').value;
            
            // בדיקת אבטחה
            this.securityCheck('login', { name, gadud });
            
            if (!name || !gadud) {
                this.showLoginStatus('יש למלא את כל השדות', 'error');
                return;
            }
            
            // בדיקת משתמשים מורשים - סיסמאות ייחודיות לכל גדוד
            let isAuthorized = false;
            let isAdmin = false;
            let validatedGadud = gadud;
            
            // הגדרת סיסמאות ייחודיות לכל גדוד
            const gadudPasswords = {
                '650': '9526',        // מפקדת אגד 650 - נשאר כפי שנדרש
                '703': 'Zt7$Qp!9',    // גדוד 703
                '651': 'Lm3@Rg#5',    // גדוד 651
                '791': 'Vy8%Tc^2',    // יחידה 791
                '652': 'Hd4&Ns*7',    // גדוד 652
                '638': 'Pf1)Wb=6',    // גדוד 638
                '653': 'Qk5+Xe?8',    // גדוד 653
                '674': 'Jr9!Lu$4'     // גדוד 674
            };
            
            // בדיקת סיסמה לפי הגדוד שנבחר
            if (gadudPasswords[gadud] && name === gadudPasswords[gadud]) {
                isAuthorized = true;
                validatedGadud = gadud;
            }
            // משתמש מורשה: 9526 עם מנהל מערכת
            else if (name === '9526' && (gadud === 'admin' || gadud === 'מנהל מערכת')) {
                isAuthorized = true;
                isAdmin = true;
                validatedGadud = 'admin';
            }
            
            if (!isAuthorized) {
                this.showLoginStatus('סיסמה סודית שגויה או גדוד לא מורשה', 'error');
                return;
            }
            
            // ולידציה מחמירה - רק אם המשתמש מורשה
            let validatedName;
            try {
                validatedName = this.validateInput(name, 'name');
            } catch (e) {
                // אם ולידציה נכשלה, אבל המשתמש מורשה, נשתמש בשם המקורי
                validatedName = name;
            }
            
            // התחברות ל-Firebase Authentication (Anonymous)
            let authUser = null;
            if (window.auth && window.signInAnonymously) {
                try {
                    // בדיקה אם המשתמש כבר מחובר
                    if (window.auth.currentUser) {
                        authUser = window.auth.currentUser;
                        console.log('משתמש כבר מחובר:', authUser.uid);
                    } else {
                        const userCredential = await window.signInAnonymously(window.auth);
                        authUser = userCredential.user;
                        console.log('Firebase Authentication successful:', authUser.uid);
                    }
                } catch (authError) {
                    console.warn('Firebase Authentication error (המערכת תמשיך לעבוד):', authError);
                    // אם Authentication נכשל, נמשיך עם ההתחברות הרגילה
                    // לא נציג שגיאה למשתמש כי הכללים מאפשרים גישה גם בלי authentication
                }
            }
            
            const user = {
                name: validatedName,
                gadud: validatedGadud,
                isAdmin: isAdmin,
                loginTime: new Date().toLocaleString('he-IL'),
                sessionId: this.generateSessionId(),
                authUid: authUser ? authUser.uid : null
            };
            
            this.setCurrentUser(user);
            this.showMainInterface();
            this.showStatus(`ברוך הבא ${user.name}!`, 'success');
            
            // לוג התחברות (ללא שגיאה)
            console.log('User Login:', { 
                user: user.name, 
                gadud: user.gadud, 
                timestamp: user.loginTime,
                authUid: user.authUid
            });
            
        } catch (error) {
            this.logError('Login Failed', error);
            this.showLoginStatus('שגיאה בהתחברות: ' + error.message, 'error');
        }
    }

    // יצירת מזהה session ייחודי
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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
        this.updateBulkIssueUI();
        
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

        // מצא את כל ה-control-card divs של ניפוק/עדכון/החזרת כרטיס
        const controlCards = document.querySelectorAll('.control-card');
        const adminControlCards = [];
        
        controlCards.forEach(card => {
            const h3 = card.querySelector('h3');
            if (h3) {
                const title = h3.textContent.trim();
                if (title === 'ניפוק כרטיס חדש' || title === 'עדכון כרטיס' || title === 'החזרת כרטיס') {
                    adminControlCards.push(card);
                }
            }
        });

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
            // הצג את כל הכרטיסים
            adminControlCards.forEach(card => {
                card.style.display = 'block';
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
            // הסתר את כל הכרטיסים של ניפוק/עדכון/החזרת כרטיס
            adminControlCards.forEach(card => {
                card.style.display = 'none';
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
        const mainContainer = document.getElementById('mainContainer');
        if (mainContainer) {
            mainContainer.style.display = 'none';
        }
        
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
                            <option value="703">703</option>
                            <option value="651">651</option>
                            <option value="791">791</option>
                            <option value="652">652</option>
                            <option value="638">638</option>
                            <option value="653">653</option>
                            <option value="674">674</option>
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
        const mainContainer = document.getElementById('mainContainer');
        if (mainContainer) {
            mainContainer.style.display = 'block';
        }
        
        // המשך עם יצירת הכרטיס
        this.addNewCard(command);
    }

    cancelGadudSelection() {
        const gadudForm = document.getElementById('gadudSelectionForm');
        gadudForm.style.display = 'none';
        const mainContainer = document.getElementById('mainContainer');
        if (mainContainer) {
            mainContainer.style.display = 'block';
        }
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
            this.showSplashScreen();
            setTimeout(() => {
                this.hideSplashScreen();
                this.showLoginForm();
            }, 2000);
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
            this.showSplashScreen();
            setTimeout(() => {
                this.hideSplashScreen();
                this.showLoginForm();
            }, 2000);
            
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

// אתחול המערכת - רק אחרי ש-DOM מוכן
console.log('מתחיל לטעון את המערכת...');
let fuelCardManager;

async function initializeSystem() {
    try {
        // חכה ש-DOM מוכן
        if (document.readyState === 'loading') {
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve);
            });
        }
        
        fuelCardManager = new FuelCardManager();
        await fuelCardManager.initialize();
        window.fuelCardManager = fuelCardManager;
        console.log('המערכת נטענה בהצלחה!');
    } catch (error) {
        console.error('שגיאה באתחול המערכת:', error);
    }
}

// התחל את האתחול
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSystem);
} else {
    initializeSystem();
}

// פונקציות גלובליות
function startRecording(action) {
    if (window.fuelCardManager && window.fuelCardManager.isInitialized) {
        window.fuelCardManager.startRecording(action);
    } else {
        console.log('המערכת עדיין לא מוכנה, מחכה...');
        setTimeout(() => startRecording(action), 1000);
    }
}

function downloadExcel() {
    if (window.fuelCardManager && window.fuelCardManager.isInitialized) {
        window.fuelCardManager.downloadExcel();
    } else {
        console.log('המערכת עדיין לא מוכנה, מחכה...');
        setTimeout(() => downloadExcel(), 1000);
    }
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

    if (action === 'new' && window.fuelCardManager && window.fuelCardManager.isBulkIssueActive()) {
        window.fuelCardManager.applyBulkIssueDataToForm();
    }
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
    try {
        console.log('שולח טופס ניפוק כרטיס חדש');
        
        // בדיקה שהמערכת מוכנה
        if (!window.fuelCardManager || !window.fuelCardManager.isInitialized) {
            console.error('המערכת לא מוכנה');
            return;
        }
        
        const cardNumber = document.getElementById('newCardNumber').value;
        const name = document.getElementById('newName').value;
        const phone = document.getElementById('newPhone').value;
        const amount = document.getElementById('newAmount').value;
        const fuelType = document.getElementById('newFuelType').value;
        const gadudNumber = document.getElementById('newGadudNumber').value;
        const issueDateInput = document.getElementById('newIssueDate').value;
        const issueDate = window.fuelCardManager.formatDateTime(issueDateInput);
        
        // בדיקת שדות חובה
        if (!cardNumber || !name || !phone || !amount || !fuelType) {
            window.fuelCardManager.showStatus('יש למלא את כל השדות החובה', 'error');
            return;
        }

        // יצירת פקודה
        const command = {
            type: 'new',
            cardNumber: cardNumber,
            name: name,
            phone: phone,
            amount: amount,
            fuelType: fuelType,
            gadudNumber: gadudNumber || '',
            issueDate: issueDate
        };
        
        console.log('פקודה נוצרה:', command);
        
        // ביצוע הפעולה
        window.fuelCardManager.addNewCard(command);
        hideTypingForm();
        clearNewCardForm();
        
    } catch (error) {
        console.error('שגיאה בשליחת טופס:', error);
        if (window.fuelCardManager) {
            window.fuelCardManager.logError('Submit New Card', error);
            window.fuelCardManager.showStatus('שגיאה בשליחת הטופס: ' + error.message, 'error');
        }
    }
}

// שליחת טופס עדכון כרטיס
function submitUpdateCard() {
    try {
        console.log('שולח טופס עדכון כרטיס');
        
        // בדיקה שהמערכת מוכנה
        if (!window.fuelCardManager || !window.fuelCardManager.isInitialized) {
            console.error('המערכת לא מוכנה');
            return;
        }
        
        const cardNumber = document.getElementById('updateCardNumber').value;
        const amount = document.getElementById('updateAmount').value;
        
        // בדיקת שדות חובה
        if (!cardNumber || !amount) {
            window.fuelCardManager.showStatus('יש למלא את כל השדות', 'error');
            return;
        }

        // יצירת פקודה
        const command = {
            type: 'update',
            cardNumber: cardNumber,
            amount: amount
        };
        
        console.log('פקודת עדכון נוצרה:', command);
        
        // ביצוע הפעולה
        window.fuelCardManager.updateCard(command);
        hideTypingForm();
        clearUpdateCardForm();
        
    } catch (error) {
        console.error('שגיאה בשליחת טופס עדכון:', error);
        if (window.fuelCardManager) {
            window.fuelCardManager.logError('Submit Update Card', error);
            window.fuelCardManager.showStatus('שגיאה בשליחת הטופס: ' + error.message, 'error');
        }
    }
}

// שליחת טופס החזרת כרטיס
function submitReturnCard() {
    try {
        console.log('שולח טופס החזרת כרטיס');
        
        // בדיקה שהמערכת מוכנה
        if (!window.fuelCardManager || !window.fuelCardManager.isInitialized) {
            console.error('המערכת לא מוכנה');
            return;
        }
        
        const cardNumber = document.getElementById('returnCardNumber').value;
        const creditDateInput = document.getElementById('returnCreditDate').value;
        const creditDate = window.fuelCardManager.formatDateTime(creditDateInput);
        
        // בדיקת שדה חובה
        if (!cardNumber) {
            window.fuelCardManager.showStatus('יש למלא מספר כרטיס', 'error');
            return;
        }

        // יצירת פקודה
        const command = {
            type: 'return',
            cardNumber: cardNumber,
            creditDate: creditDate
        };
        
        console.log('פקודת החזרה נוצרה:', command);
        
        // ביצוע הפעולה
        window.fuelCardManager.returnCard(command);
        hideTypingForm();
        clearReturnCardForm();
        
    } catch (error) {
        console.error('שגיאה בשליחת טופס החזרה:', error);
        if (window.fuelCardManager) {
            window.fuelCardManager.logError('Submit Return Card', error);
            window.fuelCardManager.showStatus('שגיאה בשליחת הטופס: ' + error.message, 'error');
        }
    }
}

// ניקוי טופס ניפוק כרטיס חדש
function clearNewCardForm() {
    try {
        const fields = ['newCardNumber', 'newName', 'newPhone', 'newAmount', 'newFuelType', 'newGadudNumber', 'newIssueDate'];
        fields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = '';
            }
        });
        resetFuelTypeSelector('newFuelType');
        resetAmountSelector('newAmount');
        if (window.fuelCardManager && window.fuelCardManager.isBulkIssueActive()) {
            window.fuelCardManager.applyBulkIssueDataToForm();
        }
    } catch (error) {
        console.error('שגיאה בניקוי טופס:', error);
    }
}

// ניקוי טופס עדכון כרטיס
function clearUpdateCardForm() {
    try {
        const fields = ['updateCardNumber', 'updateAmount'];
        fields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = '';
            }
        });
    } catch (error) {
        console.error('שגיאה בניקוי טופס עדכון:', error);
    }
}

// ניקוי טופס החזרת כרטיס
function clearReturnCardForm() {
    try {
        const fields = ['returnCardNumber', 'returnCreditDate'];
        fields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = '';
            }
        });
    } catch (error) {
        console.error('שגיאה בניקוי טופס החזרה:', error);
    }
}

// שליחת טופס ניפוק גדודי
function submitGadudNew() {
    try {
        console.log('שולח טופס ניפוק גדודי');
        
        // בדיקה שהמערכת מוכנה
        if (!window.fuelCardManager || !window.fuelCardManager.isInitialized) {
            console.error('המערכת לא מוכנה');
            return;
        }
        
        const cardNumber = document.getElementById('gadudCardNumber').value;
        const gadudName = document.getElementById('gadudName').value;
        const gadudIssueDateInput = document.getElementById('gadudIssueDate').value;
        const gadudIssueDate = window.fuelCardManager.formatDateTime(gadudIssueDateInput);
        
        // בדיקת שדות חובה
        if (!cardNumber || !gadudName) {
            window.fuelCardManager.showStatus('יש למלא את כל השדות', 'error');
            return;
        }

        // ולידציה של מספר רכב (7 או 8 ספרות)
        let validatedCardNumber;
        try {
            validatedCardNumber = window.fuelCardManager.validateInput(cardNumber, 'cardNumber');
        } catch (validationError) {
            window.fuelCardManager.showStatus(validationError.message, 'error');
            return;
        }
        
        // ביצוע הפעולה
        window.fuelCardManager.addGadudData(validatedCardNumber, gadudName, '', undefined, gadudIssueDate);
        hideTypingForm();
        clearGadudNewForm();
        
    } catch (error) {
        console.error('שגיאה בשליחת טופס ניפוק גדודי:', error);
        if (window.fuelCardManager) {
            window.fuelCardManager.logError('Submit Gadud New', error);
            window.fuelCardManager.showStatus('שגיאה בשליחת הטופס: ' + error.message, 'error');
        }
    }
}

// שליחת טופס עדכון גדודי
function submitGadudUpdate() {
    try {
        console.log('שולח טופס עדכון גדודי');
        
        // בדיקה שהמערכת מוכנה
        if (!window.fuelCardManager || !window.fuelCardManager.isInitialized) {
            console.error('המערכת לא מוכנה');
            return;
        }
        
        const cardNumber = document.getElementById('gadudUpdateCardNumber').value;
        const gadudName = document.getElementById('gadudUpdateName').value;
        const gadudId = document.getElementById('gadudUpdateId').value;
        const remainingFuel = document.getElementById('gadudUpdateRemainingFuel').value;
        
        // בדיקת שדות חובה
        if (!cardNumber || !gadudName || !gadudId || !remainingFuel) {
            window.fuelCardManager.showStatus('יש למלא את כל השדות', 'error');
            return;
        }

        // ולידציה של מספר רכב (7 או 8 ספרות)
        let validatedCardNumber;
        try {
            validatedCardNumber = window.fuelCardManager.validateInput(cardNumber, 'cardNumber');
        } catch (validationError) {
            window.fuelCardManager.showStatus(validationError.message, 'error');
            return;
        }
        
        // ביצוע הפעולה
        window.fuelCardManager.updateGadudData(validatedCardNumber, gadudName, gadudId, parseInt(remainingFuel, 10));
        hideTypingForm();
        clearGadudUpdateForm();
        
    } catch (error) {
        console.error('שגיאה בשליחת טופס עדכון גדודי:', error);
        if (window.fuelCardManager) {
            window.fuelCardManager.logError('Submit Gadud Update', error);
            window.fuelCardManager.showStatus('שגיאה בשליחת הטופס: ' + error.message, 'error');
        }
    }
}

// שליחת טופס זיכוי גדודי
function submitGadudReturn() {
    try {
        console.log('שולח טופס זיכוי גדודי');
        
        // בדיקה שהמערכת מוכנה
        if (!window.fuelCardManager || !window.fuelCardManager.isInitialized) {
            console.error('המערכת לא מוכנה');
            return;
        }
        
        const cardNumber = document.getElementById('gadudReturnCardNumber').value;
        const gadudCreditDateInput = document.getElementById('gadudCreditDate').value;
        const gadudCreditDate = window.fuelCardManager.formatDateTime(gadudCreditDateInput);
        
        // בדיקת שדה חובה
        if (!cardNumber) {
            window.fuelCardManager.showStatus('יש למלא מספר כרטיס', 'error');
            return;
        }

        // ולידציה של מספר רכב (7 או 8 ספרות)
        let validatedCardNumber;
        try {
            validatedCardNumber = window.fuelCardManager.validateInput(cardNumber, 'cardNumber');
        } catch (validationError) {
            window.fuelCardManager.showStatus(validationError.message, 'error');
            return;
        }
        
        // הצגת חלונית אישור לפני ביצוע הזיכוי
        window.fuelCardManager.showGadudCreditConfirmation(validatedCardNumber, gadudCreditDate);
        
    } catch (error) {
        console.error('שגיאה בשליחת טופס זיכוי גדודי:', error);
        if (window.fuelCardManager) {
            window.fuelCardManager.logError('Submit Gadud Return', error);
            window.fuelCardManager.showStatus('שגיאה בשליחת הטופס: ' + error.message, 'error');
        }
    }
}

// ניקוי טופס ניפוק גדודי
function clearGadudNewForm() {
    try {
        const fields = ['gadudCardNumber', 'gadudName', 'gadudIssueDate'];
        fields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = '';
            }
        });
    } catch (error) {
        console.error('שגיאה בניקוי טופס ניפוק גדודי:', error);
    }
}

// ניקוי טופס עדכון גדודי
function clearGadudUpdateForm() {
    try {
        const fields = ['gadudUpdateCardNumber', 'gadudUpdateName', 'gadudUpdateId', 'gadudUpdateRemainingFuel'];
        fields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = '';
            }
        });
    } catch (error) {
        console.error('שגיאה בניקוי טופס עדכון גדודי:', error);
    }
}

// ניקוי טופס זיכוי גדודי
function clearGadudReturnForm() {
    try {
        const fields = ['gadudReturnCardNumber', 'gadudCreditDate'];
        fields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = '';
            }
        });
    } catch (error) {
        console.error('שגיאה בניקוי טופס זיכוי גדודי:', error);
    }
}

// הצגת הוראות קוליות
function showVoiceInstructions(action) {
    try {
        const instructionsDiv = document.getElementById('voiceInstructions');
        const instructionText = document.getElementById('instructionText');
        
        if (!instructionsDiv || !instructionText) {
            console.error('אלמנטים לא נמצאו');
            return;
        }
        
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
                    "ניפוק גדודי כרטיס [מספר] [שם] [כמות דלק שנשאר]"
                </div>
                <div class="instruction-content">
                    <strong>דוגמה:</strong><br>
                    "ניפוק גדודי כרטיס 123 יוסי כהן 30"
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
        
    } catch (error) {
        console.error('שגיאה בהצגת הוראות:', error);
    }
}

// הסתרת הוראות
function hideInstructions() {
    try {
        const instructionsDiv = document.getElementById('voiceInstructions');
        if (instructionsDiv) {
            instructionsDiv.style.display = 'none';
        }
    } catch (error) {
        console.error('שגיאה בהסתרת הוראות:', error);
    }
}

window.selectFuelType = function(inputId, value, button) {
    try {
        const selector = button ? button.closest('[data-fuel-selector]') : document.querySelector(`[data-fuel-selector="${inputId}"]`);
        const input = document.getElementById(inputId);
        if (!selector || !input) {
            return;
        }

        const buttons = selector.querySelectorAll('[data-fuel-value]');
        buttons.forEach(btn => btn.classList.remove('active'));
        if (button) {
            button.classList.add('active');
        } else {
            const targetButton = selector.querySelector(`[data-fuel-value="${value}"]`);
            if (targetButton) {
                targetButton.classList.add('active');
            }
        }

        const customWrapper = selector.querySelector('.fuel-type-custom');
        if (value === 'other') {
            if (customWrapper) {
                customWrapper.classList.add('visible');
                input.value = '';
                input.focus();
            }
        } else {
            if (customWrapper) {
                customWrapper.classList.remove('visible');
            }
            input.value = value;
        }
    } catch (error) {
        console.error('שגיאה בבחירת סוג דלק:', error);
    }
};

window.handleCustomFuelInput = function(inputId) {
    try {
        const selector = document.querySelector(`[data-fuel-selector="${inputId}"]`);
        if (!selector) {
            return;
        }
        const buttons = selector.querySelectorAll('[data-fuel-value]');
        const otherButton = selector.querySelector('[data-fuel-value="other"]');
        buttons.forEach(btn => btn.classList.remove('active'));
        if (otherButton) {
            otherButton.classList.add('active');
        }
    } catch (error) {
        console.error('שגיאה בעדכון סוג דלק מותאם:', error);
    }
};

window.resetFuelTypeSelector = function(inputId) {
    try {
        const selector = document.querySelector(`[data-fuel-selector="${inputId}"]`);
        const input = document.getElementById(inputId);
        if (!selector || !input) {
            return;
        }

        selector.querySelectorAll('[data-fuel-value]').forEach(btn => btn.classList.remove('active'));
        const customWrapper = selector.querySelector('.fuel-type-custom');
        if (customWrapper) {
            customWrapper.classList.remove('visible');
        }
        input.value = '';
    } catch (error) {
        console.error('שגיאה באיפוס בורר סוג דלק:', error);
    }
};

window.selectAmount = function(inputId, value, button) {
    try {
        const selector = button ? button.closest('[data-amount-selector]') : document.querySelector(`[data-amount-selector="${inputId}"]`);
        const input = document.getElementById(inputId);
        if (!selector || !input) {
            return;
        }

        const buttons = selector.querySelectorAll('[data-amount-value]');
        buttons.forEach(btn => btn.classList.remove('active'));
        if (button) {
            button.classList.add('active');
        } else {
            const targetButton = selector.querySelector(`[data-amount-value="${value}"]`);
            if (targetButton) {
                targetButton.classList.add('active');
            }
        }

        const customWrapper = selector.querySelector('.amount-custom');
        if (value === 'other') {
            if (customWrapper) {
                customWrapper.classList.add('visible');
                input.value = '';
                input.focus();
            }
        } else {
            if (customWrapper) {
                customWrapper.classList.remove('visible');
            }
            input.value = value;
        }
    } catch (error) {
        console.error('שגיאה בבחירת כמות דלק:', error);
    }
};

window.handleCustomAmountInput = function(inputId) {
    try {
        const selector = document.querySelector(`[data-amount-selector="${inputId}"]`);
        if (!selector) {
            return;
        }

        const buttons = selector.querySelectorAll('[data-amount-value]');
        const otherButton = selector.querySelector('[data-amount-value="other"]');
        buttons.forEach(btn => btn.classList.remove('active'));
        if (otherButton) {
            otherButton.classList.add('active');
        }
    } catch (error) {
        console.error('שגיאה בעדכון כמות מותאמת:', error);
    }
};

window.resetAmountSelector = function(inputId) {
    try {
        const selector = document.querySelector(`[data-amount-selector="${inputId}"]`);
        const input = document.getElementById(inputId);
        if (!selector || !input) {
            return;
        }

        selector.querySelectorAll('[data-amount-value]').forEach(btn => btn.classList.remove('active'));
        const customWrapper = selector.querySelector('.amount-custom');
        if (customWrapper) {
            customWrapper.classList.remove('visible');
        }
        input.value = '';
    } catch (error) {
        console.error('שגיאה באיפוס בורר כמות:', error);
    }
};

function activateBulkIssue() {
    try {
        if (!window.fuelCardManager || !window.fuelCardManager.currentUser || !window.fuelCardManager.currentUser.isAdmin) {
            if (window.fuelCardManager) {
                window.fuelCardManager.showStatus('מצב מקבץ זמין רק למנהל מערכת', 'error');
            }
            return;
        }

        const name = document.getElementById('newName').value.trim();
        const phone = document.getElementById('newPhone').value.trim();
        const gadudNumber = document.getElementById('newGadudNumber').value;

        if (!name || !phone || !gadudNumber) {
            window.fuelCardManager.showStatus('יש למלא שם, טלפון ומספר גדוד לפני הפעלת מקבץ', 'error');
            return;
        }

        window.fuelCardManager.enableBulkIssue({ name, phone, gadudNumber });
    } catch (error) {
        console.error('שגיאה בהפעלת מקבץ:', error);
    }
}

function deactivateBulkIssue() {
    try {
        if (!window.fuelCardManager || !window.fuelCardManager.currentUser || !window.fuelCardManager.currentUser.isAdmin) {
            return;
        }
        window.fuelCardManager.disableBulkIssue();
        clearNewCardForm();
    } catch (error) {
        console.error('שגיאה בביטול מקבץ:', error);
    }
}

// הוספת תמיכה במקלדת לטופסים ו-keyboard shortcuts
document.addEventListener('DOMContentLoaded', function() {
    try {
        console.log('מתחיל להגדיר תמיכה במקלדת...');
        
        // Keyboard shortcuts גלובליים
        document.addEventListener('keydown', function(e) {
            // Ctrl+F / Cmd+F - חיפוש
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                const searchInput = document.getElementById('searchInput');
                if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                }
            }
            
            // Esc - סגירת טופסים
            if (e.key === 'Escape') {
                const visibleForm = document.querySelector('.typing-form[style*="block"]');
                if (visibleForm) {
                    hideTypingForm();
                }
                const voiceInstructions = document.getElementById('voiceInstructions');
                if (voiceInstructions && voiceInstructions.style.display === 'block') {
                    hideInstructions();
                }
            }
        });
        
        // תמיכה במקלדת לטופס ניפוק כרטיס חדש
        const newCardInputs = ['newCardNumber', 'newName', 'newPhone', 'newAmount', 'newFuelType', 'newGadudNumber'];
        newCardInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('keydown', function(e) {
                    try {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            submitNewCard();
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            hideTypingForm();
                        }
                    } catch (error) {
                        console.error('שגיאה בטיפול במקלדת:', error);
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
                    try {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            submitUpdateCard();
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            hideTypingForm();
                        }
                    } catch (error) {
                        console.error('שגיאה בטיפול במקלדת:', error);
                    }
                });
            }
        });
        
        // תמיכה במקלדת לטופס החזרת כרטיס
        const returnCardInput = document.getElementById('returnCardNumber');
        if (returnCardInput) {
            returnCardInput.addEventListener('keydown', function(e) {
                try {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        submitReturnCard();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        hideTypingForm();
                    }
                } catch (error) {
                    console.error('שגיאה בטיפול במקלדת:', error);
                }
            });
        }
        
        // תמיכה במקלדת לטופסי גדוד
        const gadudInputs = ['gadudCardNumber', 'gadudName'];
        gadudInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('keydown', function(e) {
                    try {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            submitGadudNew();
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            hideTypingForm();
                        }
                    } catch (error) {
                        console.error('שגיאה בטיפול במקלדת:', error);
                    }
                });
            }
        });
        
        console.log('תמיכה במקלדת הופעלה בהצלחה');
        
    } catch (error) {
        console.error('שגיאה בהגדרת תמיכה במקלדת:', error);
    }
});