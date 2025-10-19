// מערכת ניהול כרטיסי דלק עם הקלטה קולית ומערכת הרשאות
class FuelCardManager {
    constructor() {
        console.log('מתחיל את מערכת ניהול כרטיסי הדלק...');
        this.recognition = null;
        this.isRecording = false;
        this.fuelCards = this.loadData();
        this.currentUser = this.getCurrentUser();
        this.users = this.loadUsers();
        console.log('כרטיסים נטענו:', this.fuelCards.length);
        console.log('משתמש נוכחי:', this.currentUser);
        this.initSpeechRecognition();
        this.checkLogin();
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
        // בדיקת הרשאות
        if (!this.currentUser || !this.currentUser.permissions.includes('add')) {
            this.showStatus('אין לך הרשאה להוסיף כרטיסים', 'error');
            return;
        }
        
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
            date: new Date().toLocaleString('he-IL'),
            createdBy: this.currentUser.id
        };
        
        this.fuelCards.push(newCard);
        this.saveData();
        this.renderTable();
        this.showStatus('כרטיס חדש נוסף בהצלחה', 'success');
    }

    // עדכון כרטיס קיים
    updateCard(command) {
        // בדיקת הרשאות
        if (!this.currentUser || !this.currentUser.permissions.includes('edit')) {
            this.showStatus('אין לך הרשאה לעדכן כרטיסים', 'error');
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
        this.fuelCards[cardIndex].updatedBy = this.currentUser.id;
        
        this.saveData();
        this.renderTable();
        this.showStatus('כרטיס עודכן בהצלחה', 'success');
    }

    // החזרת כרטיס
    returnCard(command) {
        // בדיקת הרשאות
        if (!this.currentUser || !this.currentUser.permissions.includes('edit')) {
            this.showStatus('אין לך הרשאה להחזיר כרטיסים', 'error');
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
        this.fuelCards[cardIndex].returnedBy = this.currentUser.id;
        
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
                <td>${this.getUserInfo(card)}</td>
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

    // קבלת מידע על המשתמש
    getUserInfo(card) {
        let info = '';
        if (card.createdBy) {
            const user = this.users.find(u => u.id === card.createdBy);
            if (user) {
                info += `נוצר: ${user.name}`;
            }
        }
        if (card.updatedBy) {
            const user = this.users.find(u => u.id === card.updatedBy);
            if (user) {
                info += info ? `<br>עודכן: ${user.name}` : `עודכן: ${user.name}`;
            }
        }
        if (card.returnedBy) {
            const user = this.users.find(u => u.id === card.returnedBy);
            if (user) {
                info += info ? `<br>הוחזר: ${user.name}` : `הוחזר: ${user.name}`;
            }
        }
        return info || 'לא זמין';
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

    // מערכת משתמשים והרשאות
    loadUsers() {
        const users = localStorage.getItem('fuelCardUsers');
        if (!users) {
            // יצירת משתמש מנהל ברירת מחדל
            const defaultUsers = [
                {
                    id: 'admin',
                    username: 'admin',
                    password: 'admin123',
                    role: 'admin',
                    name: 'מנהל המערכת',
                    permissions: ['view', 'add', 'edit', 'delete', 'manage_users']
                }
            ];
            this.saveUsers(defaultUsers);
            return defaultUsers;
        }
        return JSON.parse(users);
    }

    saveUsers(users) {
        localStorage.setItem('fuelCardUsers', JSON.stringify(users));
    }

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
        
        // צור/הצג טופס התחברות
        let loginForm = document.getElementById('loginForm');
        if (!loginForm) {
            loginForm = this.createLoginForm();
            document.body.appendChild(loginForm);
        }
        loginForm.style.display = 'block';
    }

    showMainInterface() {
        // הסתר טופס התחברות
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.style.display = 'none';
        }
        
        // הצג את הממשק הראשי
        document.querySelector('.container').style.display = 'block';
        
        // עדכן את הממשק לפי הרשאות המשתמש
        this.updateInterfaceByPermissions();
    }

    createLoginForm() {
        const form = document.createElement('div');
        form.id = 'loginForm';
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
                    min-width: 400px;
                ">
                    <h2 style="color: #2c3e50; margin-bottom: 30px;">התחברות למערכת</h2>
                    <div style="margin-bottom: 20px;">
                        <input type="text" id="loginUsername" placeholder="שם משתמש" style="
                            width: 100%;
                            padding: 12px;
                            border: 2px solid #ddd;
                            border-radius: 8px;
                            font-size: 16px;
                            margin-bottom: 15px;
                        ">
                    </div>
                    <div style="margin-bottom: 30px;">
                        <input type="password" id="loginPassword" placeholder="סיסמה" style="
                            width: 100%;
                            padding: 12px;
                            border: 2px solid #ddd;
                            border-radius: 8px;
                            font-size: 16px;
                        ">
                    </div>
                    <button onclick="fuelCardManager.login()" style="
                        background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
                        color: white;
                        border: none;
                        padding: 15px 30px;
                        border-radius: 25px;
                        font-size: 16px;
                        cursor: pointer;
                        margin: 10px;
                        width: 100%;
                    ">התחבר</button>
                    <div id="loginStatus" style="margin-top: 20px; padding: 10px; border-radius: 8px; display: none;"></div>
                </div>
            </div>
        `;
        return form;
    }

    login() {
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        
        const user = this.users.find(u => u.username === username && u.password === password);
        
        if (user) {
            this.setCurrentUser(user);
            this.showMainInterface();
            this.showStatus(`ברוך הבא ${user.name}!`, 'success');
        } else {
            this.showLoginStatus('שם משתמש או סיסמה שגויים', 'error');
        }
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

        // הסתר/הצג כפתורים לפי הרשאות
        const recordButtons = document.querySelectorAll('.record-btn');
        const typeButtons = document.querySelectorAll('.type-btn');
        const downloadButton = document.querySelector('.download-btn');
        
        const canAdd = user.permissions.includes('add');
        const canEdit = user.permissions.includes('edit');
        const canView = user.permissions.includes('view');
        const canManage = user.permissions.includes('manage_users');

        // עדכון כפתורי הקלטה
        recordButtons.forEach(btn => {
            const action = btn.onclick.toString().includes('new') ? 'add' : 
                          btn.onclick.toString().includes('update') ? 'edit' : 'edit';
            btn.style.display = (action === 'add' && canAdd) || (action === 'edit' && canEdit) ? 'inline-block' : 'none';
        });

        // עדכון כפתורי הקלדה
        typeButtons.forEach(btn => {
            const action = btn.onclick.toString().includes('new') ? 'add' : 
                          btn.onclick.toString().includes('update') ? 'edit' : 'edit';
            btn.style.display = (action === 'add' && canAdd) || (action === 'edit' && canEdit) ? 'inline-block' : 'none';
        });

        // כפתור הורדה
        if (downloadButton) {
            downloadButton.style.display = canView ? 'inline-block' : 'none';
        }

        // הוספת כפתור יציאה
        this.addLogoutButton();
        
        // הוספת פאנל מנהל אם יש הרשאה
        if (canManage) {
            this.addAdminPanel();
        }
    }

    addLogoutButton() {
        // בדוק אם כבר קיים
        if (document.getElementById('logoutBtn')) return;

        const header = document.querySelector('.header');
        const logoutBtn = document.createElement('button');
        logoutBtn.id = 'logoutBtn';
        logoutBtn.innerHTML = `יציאה (${this.currentUser.name})`;
        logoutBtn.style.cssText = `
            position: absolute;
            top: 20px;
            left: 20px;
            background: rgba(255,255,255,0.2);
            color: white;
            border: 1px solid rgba(255,255,255,0.3);
            padding: 8px 15px;
            border-radius: 20px;
            cursor: pointer;
            font-size: 14px;
        `;
        logoutBtn.onclick = () => this.logout();
        header.style.position = 'relative';
        header.appendChild(logoutBtn);
    }

    addAdminPanel() {
        // בדוק אם כבר קיים
        if (document.getElementById('adminPanel')) return;

        const controls = document.querySelector('.controls');
        const adminCard = document.createElement('div');
        adminCard.id = 'adminPanel';
        adminCard.className = 'control-card';
        adminCard.innerHTML = `
            <h3>פאנל מנהל</h3>
            <button class="type-btn" onclick="fuelCardManager.showUserManagement()">
                ניהול משתמשים
            </button>
            <button class="type-btn" onclick="fuelCardManager.showAllData()">
                כל הנתונים
            </button>
        `;
        controls.appendChild(adminCard);
    }

    // ניהול משתמשים
    showUserManagement() {
        // הסתר את הממשק הראשי
        document.querySelector('.container').style.display = 'none';
        
        // צור/הצג פאנל ניהול משתמשים
        let userPanel = document.getElementById('userManagementPanel');
        if (!userPanel) {
            userPanel = this.createUserManagementPanel();
            document.body.appendChild(userPanel);
        }
        userPanel.style.display = 'block';
    }

    createUserManagementPanel() {
        const panel = document.createElement('div');
        panel.id = 'userManagementPanel';
        panel.innerHTML = `
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
                padding: 20px;
            ">
                <div style="
                    background: white;
                    padding: 30px;
                    border-radius: 15px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                    max-width: 800px;
                    width: 100%;
                    max-height: 90vh;
                    overflow-y: auto;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
                        <h2 style="color: #2c3e50; margin: 0;">ניהול משתמשים</h2>
                        <button onclick="fuelCardManager.hideUserManagement()" style="
                            background: #e74c3c;
                            color: white;
                            border: none;
                            padding: 8px 15px;
                            border-radius: 20px;
                            cursor: pointer;
                        ">סגור</button>
                    </div>
                    
                    <div style="margin-bottom: 30px;">
                        <h3 style="color: #2c3e50; margin-bottom: 15px;">הוספת משתמש חדש</h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                            <input type="text" id="newUserName" placeholder="שם משתמש" style="padding: 10px; border: 2px solid #ddd; border-radius: 8px;">
                            <input type="text" id="newUserPassword" placeholder="סיסמה" style="padding: 10px; border: 2px solid #ddd; border-radius: 8px;">
                            <input type="text" id="newUserFullName" placeholder="שם מלא" style="padding: 10px; border: 2px solid #ddd; border-radius: 8px;">
                            <select id="newUserRole" style="padding: 10px; border: 2px solid #ddd; border-radius: 8px;">
                                <option value="viewer">צופה (רק צפייה)</option>
                                <option value="worker">עובד (הוספה ועדכון)</option>
                                <option value="admin">מנהל (הכל)</option>
                            </select>
                        </div>
                        <button onclick="fuelCardManager.addNewUser()" style="
                            background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
                            color: white;
                            border: none;
                            padding: 12px 25px;
                            border-radius: 20px;
                            cursor: pointer;
                        ">הוסף משתמש</button>
                    </div>
                    
                    <div>
                        <h3 style="color: #2c3e50; margin-bottom: 15px;">רשימת משתמשים</h3>
                        <div id="usersList" style="max-height: 300px; overflow-y: auto;">
                            ${this.renderUsersList()}
                        </div>
                    </div>
                    
                    <div id="userManagementStatus" style="margin-top: 20px; padding: 10px; border-radius: 8px; display: none;"></div>
                </div>
            </div>
        `;
        return panel;
    }

    renderUsersList() {
        return this.users.map(user => `
            <div style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px;
                border: 1px solid #ddd;
                border-radius: 8px;
                margin-bottom: 10px;
                background: #f8f9fa;
            ">
                <div>
                    <strong>${user.name}</strong> (${user.username})<br>
                    <small style="color: #666;">תפקיד: ${this.getRoleText(user.role)}</small>
                </div>
                <div>
                    <button onclick="fuelCardManager.editUser('${user.id}')" style="
                        background: #3498db;
                        color: white;
                        border: none;
                        padding: 5px 10px;
                        border-radius: 15px;
                        cursor: pointer;
                        margin-left: 5px;
                        font-size: 12px;
                    ">ערוך</button>
                    ${user.id !== 'admin' ? `
                        <button onclick="fuelCardManager.deleteUser('${user.id}')" style="
                            background: #e74c3c;
                            color: white;
                            border: none;
                            padding: 5px 10px;
                            border-radius: 15px;
                            cursor: pointer;
                            margin-left: 5px;
                            font-size: 12px;
                        ">מחק</button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    getRoleText(role) {
        switch(role) {
            case 'admin': return 'מנהל';
            case 'worker': return 'עובד';
            case 'viewer': return 'צופה';
            default: return role;
        }
    }

    addNewUser() {
        const username = document.getElementById('newUserName').value;
        const password = document.getElementById('newUserPassword').value;
        const fullName = document.getElementById('newUserFullName').value;
        const role = document.getElementById('newUserRole').value;
        
        if (!username || !password || !fullName) {
            this.showUserManagementStatus('יש למלא את כל השדות', 'error');
            return;
        }
        
        // בדוק אם שם משתמש כבר קיים
        if (this.users.find(u => u.username === username)) {
            this.showUserManagementStatus('שם משתמש כבר קיים', 'error');
            return;
        }
        
        // הגדר הרשאות לפי תפקיד
        let permissions = [];
        switch(role) {
            case 'admin':
                permissions = ['view', 'add', 'edit', 'delete', 'manage_users'];
                break;
            case 'worker':
                permissions = ['view', 'add', 'edit'];
                break;
            case 'viewer':
                permissions = ['view'];
                break;
        }
        
        const newUser = {
            id: Date.now().toString(),
            username: username,
            password: password,
            role: role,
            name: fullName,
            permissions: permissions
        };
        
        this.users.push(newUser);
        this.saveUsers(this.users);
        
        // עדכן את הרשימה
        document.getElementById('usersList').innerHTML = this.renderUsersList();
        
        // נקה את הטופס
        document.getElementById('newUserName').value = '';
        document.getElementById('newUserPassword').value = '';
        document.getElementById('newUserFullName').value = '';
        document.getElementById('newUserRole').value = 'viewer';
        
        this.showUserManagementStatus('משתמש נוסף בהצלחה', 'success');
    }

    editUser(userId) {
        const user = this.users.find(u => u.id === userId);
        if (!user) return;
        
        const newPassword = prompt('הכנס סיסמה חדשה (השאר ריק אם לא רוצה לשנות):');
        if (newPassword !== null) {
            if (newPassword) {
                user.password = newPassword;
            }
            
            const newRole = prompt('הכנס תפקיד חדש (admin/worker/viewer):', user.role);
            if (newRole && ['admin', 'worker', 'viewer'].includes(newRole)) {
                user.role = newRole;
                
                // עדכן הרשאות
                let permissions = [];
                switch(newRole) {
                    case 'admin':
                        permissions = ['view', 'add', 'edit', 'delete', 'manage_users'];
                        break;
                    case 'worker':
                        permissions = ['view', 'add', 'edit'];
                        break;
                    case 'viewer':
                        permissions = ['view'];
                        break;
                }
                user.permissions = permissions;
            }
            
            this.saveUsers(this.users);
            document.getElementById('usersList').innerHTML = this.renderUsersList();
            this.showUserManagementStatus('משתמש עודכן בהצלחה', 'success');
        }
    }

    deleteUser(userId) {
        if (confirm('האם אתה בטוח שברצונך למחוק את המשתמש?')) {
            this.users = this.users.filter(u => u.id !== userId);
            this.saveUsers(this.users);
            document.getElementById('usersList').innerHTML = this.renderUsersList();
            this.showUserManagementStatus('משתמש נמחק בהצלחה', 'success');
        }
    }

    hideUserManagement() {
        document.getElementById('userManagementPanel').style.display = 'none';
        document.querySelector('.container').style.display = 'block';
    }

    showUserManagementStatus(message, type) {
        const statusDiv = document.getElementById('userManagementStatus');
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';
        
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }

    showAllData() {
        // הצג את כל הנתונים ללא הגבלות
        this.renderTable();
        this.showStatus('מוצגים כל הנתונים במערכת', 'success');
    }

    // הורדת Excel
    downloadExcel() {
        // בדיקת הרשאות
        if (!this.currentUser || !this.currentUser.permissions.includes('view')) {
            this.showStatus('אין לך הרשאה להוריד נתונים', 'error');
            return;
        }
        
        if (this.fuelCards.length === 0) {
            this.showStatus('אין נתונים להורדה', 'error');
            return;
        }
        
        // יצירת CSV
        let csv = 'מספר כרטיס,שם,טלפון,כמות (ליטר),סוג דלק,סטטוס,תאריך,משתמש\n';
        
        this.fuelCards.forEach(card => {
            const userInfo = this.getUserInfo(card).replace(/<br>/g, ' | ');
            csv += `${card.cardNumber},${card.name},${card.phone},${card.amount},${card.fuelType},${this.getStatusText(card.status)},${card.date},${userInfo}\n`;
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