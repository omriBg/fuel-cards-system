// מערכת ניהול כרטיסי דלק עם Firebase Firestore
class FuelCardManager {
    constructor() {
        console.log('מתחיל את מערכת ניהול כרטיסי הדלק עם Firebase...');
        this.recognition = null;
        this.isRecording = false;
        this.fuelCards = [];
        this.tableColumns = this.loadTableColumns();
        this.currentUser = this.getCurrentUser();
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
        console.log('עמודות טבלה:', this.tableColumns);
        console.log('משתמש נוכחי:', this.currentUser);
        this.initSpeechRecognition();
        this.checkLogin();
        // המתן ש-Firebase יהיה מוכן לפני התחברות
        this.waitForFirebaseAndInit();
        // עדכן את פקדי המיון והסינון אחרי טעינת הדף
        setTimeout(() => {
            this.updateAdminSortingControls();
        }, 1000);
        console.log('המערכת מוכנה לשימוש!');
        
        // הגדרת event listeners לכפתורי סגירת modal שגיאות
        this.setupStatusModalListeners();
        
        // Fallback: סגור את ה-splash screen אחרי 3 שניות אם הוא עדיין מוצג
        setTimeout(() => {
            const splashScreen = document.getElementById('splashScreen');
            if (splashScreen && splashScreen.style.display !== 'none') {
                splashScreen.classList.add('fade-out');
                setTimeout(() => {
                    splashScreen.style.display = 'none';
                }, 600);
            }
        }, 3000);
    }

    // הגדרת event listeners לכפתורי סגירת modal
    setupStatusModalListeners() {
        // המתן עד שה-DOM נטען
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.attachModalListeners());
        } else {
            this.attachModalListeners();
        }
    }

    attachModalListeners() {
        const modal = document.getElementById('statusModal');
        if (!modal) return;

        // סגירה בלחיצה על הרקע
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeStatusModal();
            }
        });

        // סגירה בלחיצה על כפתור X
        const closeBtn = modal.querySelector('.status-modal__close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeStatusModal();
            });
        }

        // סגירה בלחיצה על כפתור "הבנתי"
        const actionBtn = modal.querySelector('.status-modal__action');
        if (actionBtn) {
            actionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeStatusModal();
            });
        }

        // סגירה בלחיצה על Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('status-modal--visible')) {
                this.closeStatusModal();
            }
        });
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

    // טעינת נתונים מ-Firebase
    async loadDataFromFirebase() {
        try {
            // בדוק אם Firebase זמין
            if (!window.db || !window.firebaseGetDocs) {
                console.warn('Firebase לא זמין - ממתין...');
                setTimeout(() => this.loadDataFromFirebase(), 1000);
                return;
            }
            
            // בדוק אם יש Authentication (אם נדרש)
            if (window.auth && !window.auth.currentUser) {
                console.warn('⚠️ ממתין להתחברות ל-Firebase Authentication...');
                // נסה שוב אחרי שנייה
                setTimeout(() => this.loadDataFromFirebase(), 1000);
                return;
            }
            
            console.log('טוען נתונים מ-Firebase...');
            
            // הצג loading state
            this.showLoadingState();
            
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
            // עדכן את הפקדים אחרי טעינת הנתונים
            if (this.currentUser && this.currentUser.isAdmin) {
                this.updateAdminSortingControls();
            }
        } catch (error) {
            console.error('שגיאה בטעינת נתונים מ-Firebase:', error);
            this.hideLoadingState();
            
            // אם זו שגיאת permission, זה אומר ש-Authentication לא מופעל
            if (error.code === 'permission-denied') {
                console.error('⚠️ שגיאת הרשאות - ודא ש-Anonymous Authentication מופעל ב-Firebase Console');
                this.showStatus('שגיאה: אין הרשאות לגשת לנתונים. אנא ודא ש-Anonymous Authentication מופעל ב-Firebase Console.', 'error');
                // נסה שוב אחרי 2 שניות
                setTimeout(() => this.loadDataFromFirebase(), 2000);
            } else {
                this.showStatus('שגיאה בטעינת נתונים', 'error');
            }
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

    // ============================================
    // Firebase Authentication
    // ============================================
    // המתן ש-Firebase יהיה מוכן ואז התחל את התהליך
    async waitForFirebaseAndInit() {
        // המתן ש-Firebase יהיה מוכן
        let attempts = 0;
        const maxAttempts = 20; // מקסימום 10 שניות
        
        while (attempts < maxAttempts) {
            if (window.firebaseReady && window.auth && window.signInAnonymously) {
                console.log('✅ Firebase מוכן, מתחיל תהליך Authentication...');
                await this.initFirebaseAuth();
                // המתן ש-Authentication יתחבר ואז טען נתונים
                setTimeout(() => {
                    this.loadDataFromFirebase();
                }, 1000);
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        
        console.error('❌ Firebase לא נטען אחרי 10 שניות - מנסה בכל זאת...');
        // נסה בכל זאת
        await this.initFirebaseAuth();
        setTimeout(() => {
            this.loadDataFromFirebase();
        }, 1000);
    }
    
    // התחברות אוטומטית ל-Firebase Anonymous Authentication
    // זה מאפשר גישה מאובטחת למסד הנתונים
    async initFirebaseAuth() {
        try {
            // המתן קצת כדי לוודא ש-Firebase נטען
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // בדוק אם Firebase Authentication זמין
            if (!window.auth) {
                console.warn('⚠️ Firebase Auth לא זמין - ממתין...');
                // נסה שוב אחרי שנייה
                setTimeout(() => this.initFirebaseAuth(), 1000);
                return;
            }
            
            if (!window.signInAnonymously) {
                console.warn('⚠️ signInAnonymously לא זמין - ממתין...');
                setTimeout(() => this.initFirebaseAuth(), 1000);
                return;
            }
            
            // בדוק אם כבר יש משתמש מחובר
            if (window.auth.currentUser) {
                console.log('✅ משתמש כבר מחובר ל-Firebase Authentication:', window.auth.currentUser.uid);
                return;
            }
            
            // התחברות אוטומטית עם Anonymous Authentication
            console.log('🔄 מנסה להתחבר ל-Firebase Authentication...');
            const userCredential = await window.signInAnonymously(window.auth);
            console.log('✅ התחברות ל-Firebase Authentication הצליחה:', userCredential.user.uid);
        } catch (error) {
            console.error('❌ שגיאה בהתחברות ל-Firebase Authentication:', error);
            // אם זו שגיאת permission, זה אומר ש-Anonymous Authentication לא מופעל
            if (error.code === 'auth/operation-not-allowed') {
                console.error('⚠️ Anonymous Authentication לא מופעל ב-Firebase Console!');
                console.error('⚠️ אנא הפעל Anonymous Authentication ב-Firebase Console → Authentication → Sign-in method');
            }
            // נסה שוב אחרי 2 שניות
            setTimeout(() => this.initFirebaseAuth(), 2000);
        }
    }

    // ============================================
    // פונקציות יעילות ל-Firebase (תיקון קריטי!)
    // ============================================
    // במקום למחוק ולהחזיר הכל, משתמשים בפעולות ספציפיות
    // זה חוסך 99.95% מהשימוש ב-writes!

    // הוספת כרטיס חדש ל-Firebase (רק 1 write!)
    async addCardToFirebase(card) {
        try {
            if (!window.db || !window.firebaseAddDoc) {
                console.warn('Firebase לא זמין, מדלג על שמירה');
                return;
            }
            
            const docRef = await window.firebaseAddDoc(
                window.firebaseCollection(window.db, 'fuelCards'), 
                card
            );
            
            // שמור את ה-ID של המסמך בכרטיס המקומי
            if (card) {
                card.id = docRef.id;
            }
            
            console.log('כרטיס נוסף ל-Firebase:', docRef.id);
            return docRef.id;
        } catch (error) {
            console.error('שגיאה בהוספת כרטיס ל-Firebase:', error);
            this.showStatus('שגיאה בשמירת כרטיס', 'error');
            throw error;
        }
    }

    // עדכון כרטיס קיים ב-Firebase (רק 1 write!)
    async updateCardInFirebase(card) {
        try {
            if (!window.db || !window.firebaseUpdateDoc) {
                console.warn('Firebase לא זמין, מדלג על עדכון');
                return;
            }
            
            if (!card.id) {
                console.error('כרטיס ללא ID - לא ניתן לעדכן');
                // נסה למצוא את ה-ID לפי cardNumber
                const querySnapshot = await window.firebaseGetDocs(
                    window.firebaseQuery(
                        window.firebaseCollection(window.db, 'fuelCards'),
                        window.firebaseWhere('cardNumber', '==', card.cardNumber)
                    )
                );
                
                if (querySnapshot.empty) {
                    throw new Error('כרטיס לא נמצא ב-Firebase');
                }
                
                card.id = querySnapshot.docs[0].id;
            }
            
            const cardRef = window.firebaseDoc(window.db, 'fuelCards', card.id);
            
            // הסר את ה-id מהאובייקט לפני השמירה (Firestore לא צריך אותו)
            const { id, ...cardData } = card;
            
            await window.firebaseUpdateDoc(cardRef, cardData);
            console.log('כרטיס עודכן ב-Firebase:', card.id);
        } catch (error) {
            console.error('שגיאה בעדכון כרטיס ב-Firebase:', error);
            this.showStatus('שגיאה בעדכון כרטיס', 'error');
            throw error;
        }
    }

    // מחיקת כרטיס מ-Firebase (רק 1 write!)
    async deleteCardFromFirebase(cardId) {
        try {
            if (!window.db || !window.firebaseDeleteDoc) {
                console.warn('Firebase לא זמין, מדלג על מחיקה');
                return;
            }
            
            if (!cardId) {
                throw new Error('cardId חסר');
            }
            
            const cardRef = window.firebaseDoc(window.db, 'fuelCards', cardId);
            await window.firebaseDeleteDoc(cardRef);
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
            if (!window.db || !window.firebaseGetDocs) {
                console.warn('Firebase לא זמין, מדלג על מחיקה');
                return;
            }
            
            const querySnapshot = await window.firebaseGetDocs(
                window.firebaseCollection(window.db, 'fuelCards')
            );
            
            const deletePromises = querySnapshot.docs.map(doc => 
                window.firebaseDeleteDoc(window.firebaseDoc(window.db, 'fuelCards', doc.id))
            );
            
            await Promise.all(deletePromises);
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
            if (!window.db || !window.firebaseGetDocs) {
                console.warn('Firebase לא זמין');
                return;
            }
            
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
            
            console.log('נתונים נשמרו ל-Firebase בהצלחה (שיטה לא יעילה)');
        } catch (error) {
            console.error('שגיאה בשמירת נתונים ל-Firebase:', error);
            this.showStatus('שגיאה בשמירת נתונים', 'error');
        }
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
            };
            
            this.recognition.onerror = (event) => {
                console.error('שגיאה בהקלטה:', event.error);
                this.showStatus('שגיאה בהקלטה: ' + event.error, 'error');
                this.isRecording = false;
            };
            
            this.recognition.onend = () => {
                console.log('ההקלטה הסתיימה');
                this.isRecording = false;
            };
        } else {
            console.log('הדפדפן לא תומך בהקלטה קולית');
            this.showStatus('הדפדפן לא תומך בהקלטה קולית', 'error');
        }
    }

    // התחלת הקלטה
    startRecording(action) {
        if (!this.recognition) {
            this.showStatus('הדפדפן לא תומך בהקלטה קולית', 'error');
            return;
        }
        
        if (this.isRecording) {
            this.showStatus('הקלטה כבר פעילה', 'error');
            return;
        }
        
        this.isRecording = true;
        this.recognition.start();
        this.showVoiceInstructions(action);
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
        
        // בדיקת סוג הפקודה
        if (text.includes('כרטיס') && (text.includes('חדש') || text.includes('ניפוק'))) {
            return this.parseNewCard(transcript);
        } else if (text.includes('עדכון')) {
            return this.parseUpdateCard(transcript);
        } else if (text.includes('החזרה') || text.includes('החזר')) {
            return this.parseReturnCard(transcript);
        } else {
            throw new Error('לא הצלחתי לזהות את סוג הפקודה');
        }
    }

    // חילוץ פרטים לכרטיס חדש
    parseNewCard(transcript) {
        console.log('מנתח ניפוק כרטיס חדש:', transcript);
        
        // נסה עם פסיקים קודם
        if (transcript.includes(',')) {
            return this.parseWithCommas(transcript);
        } else {
            return this.parseWithoutCommas(transcript);
        }
    }

    // חילוץ פרטים עם פסיקים
    parseWithCommas(text) {
        const parts = text.split(',').map(part => part.trim());
        console.log('חלקים מחולקים:', parts);
        
        if (parts.length < 5) {
            throw new Error('לא מספיק פרטים. נסה: "כרטיס 123, שם, טלפון, כמות ליטר, סוג דלק"');
        }
        
        const cardNumber = this.extractCardNumber(parts[0]);
        const name = parts[1].trim();
        const phone = parts[2].trim();
        const amount = this.extractAmount(parts[3]);
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
        const words = text.split(' ');
        console.log('מילים:', words);
        
        const cardNumber = this.extractCardNumber(text);
        const amount = this.extractAmount(text);
        const phone = this.extractPhone(text);
        
        // מצא את המיקום של "כרטיס" והתחל משם
        const cardIndex = words.findIndex(word => word.includes('כרטיס'));
        if (cardIndex === -1) {
            throw new Error('לא נמצא "כרטיס" בפקודה');
        }
        
        // חילוץ שם (אחרי מספר הכרטיס)
        const nameStart = cardIndex + 2; // אחרי "כרטיס" ומספר
        const nameEnd = words.findIndex((word, index) => 
            index >= nameStart && this.isPhoneNumber(word)
        );
        
        if (nameEnd === -1) {
            throw new Error('לא הצלחתי לזהות את השם');
        }
        
        const name = words.slice(nameStart, nameEnd).join(' ');
        
        // חילוץ סוג דלק (המילה האחרונה)
        const fuelType = words[words.length - 1];
        
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

    // חילוץ מספר כרטיס
    extractCardNumber(text) {
        const match = text.match(/\d+/);
        if (!match) {
            throw new Error('לא נמצא מספר כרטיס');
        }
        return parseInt(match[0]);
    }

    // חילוץ כמות
    extractAmount(text) {
        const match = text.match(/(\d+)\s*ליטר/);
        if (!match) {
            throw new Error('לא נמצאה כמות ליטר');
        }
        return parseInt(match[1]);
    }

    // חילוץ טלפון
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

        // בדיקת תקינות סוג דלק
        if (command.fuelType) {
            const allowedFuels = ['בנזין', 'סולר', 'דיזל', 'גז', 'חשמל', 'היברידי'];
            const fuel = command.fuelType.toString().trim();
            if (!allowedFuels.includes(fuel)) {
                this.showStatus('סוג דלק לא תקין - בחר: בנזין, סולר, דיזל, גז, חשמל, היברידי', 'error');
                return;
            }
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
        
        const issueDate = command.issueDate || this.formatDateTime();

        const newCard = {
            cardNumber: command.cardNumber,
            name: command.name,
            phone: command.phone,
            amount: command.amount,
            fuelType: command.fuelType,
            gadudNumber: command.gadudNumber || '',
            issueDate: issueDate,
            status: 'new',
            date: issueDate,
            // שרשרת העברת כרטיס
            cardChain: [{
                action: 'ניפוק ראשוני',
                amount: command.amount,
                date: issueDate,
                status: 'active'
            }],
            currentHolder: 'system',
            currentHolderName: 'מערכת'
        };
        
        this.fuelCards.push(newCard);
        // שמירה יעילה - רק 1 write במקום 2,000!
        await this.addCardToFirebase(newCard);
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
        this.fuelCards[cardIndex].date = this.formatDateTime();
        
        // הוסף לשרשרת העברת כרטיס
        this.fuelCards[cardIndex].cardChain.push({
            action: 'עדכון כמות',
            amount: command.amount,
            date: this.formatDateTime(),
            status: 'active'
        });
        
        // שמירה יעילה - רק 1 write במקום 2,000!
        await this.updateCardInFirebase(this.fuelCards[cardIndex]);
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

        const card = this.fuelCards[cardIndex];

        // דרישה: ניתן להחזיר רק אחרי זיכוי גדודי מלא → remainingFuel חייב להיות 0
        // אם יש נתונים גדודיים (gadudName או gadudNumber), חייבים לוודא:
        // 1. שזיכוי גדודי בוצע (gadudCreditDate קיים)
        // 2. שהכמות שנותרה היא בדיוק 0
        if (card.gadudName || card.gadudNumber) {
            // בדיקה אם יש כמות שנותרה שלא 0
            const remaining = card.remainingFuel !== undefined && card.remainingFuel !== null 
                ? Number(card.remainingFuel) 
                : null;
            
            // אם יש כמות שנותרה והיא לא 0 - לא ניתן להחזיר
            if (remaining !== null && (Number.isNaN(remaining) || remaining !== 0)) {
                this.showStatus('לא ניתן להחזיר כרטיס לפני זיכוי גדודי מלא (כמות שנותרה חייבת להיות 0)', 'error');
                return;
            }
            
            // בדיקה אם זיכוי גדודי בוצע (gadudCreditDate קיים)
            if (!card.gadudCreditDate) {
                this.showStatus('לא ניתן להחזיר כרטיס לפני ביצוע זיכוי גדודי (חובה לתעד תאריך זיכוי גדודי)', 'error');
                return;
            }
        }
        
        card.status = 'returned';
        card.date = this.formatDateTime();
        // שמירת תאריך זיכוי
        const creditDate = command.creditDate || this.formatDateTime();
        card.creditDate = creditDate;
        
        // הוסף לשרשרת העברת כרטיס
        card.cardChain.push({
            action: 'החזרת כרטיס',
            amount: card.amount,
            date: this.formatDateTime(),
            status: 'returned'
        });
        
        // שמירה יעילה - רק 1 write במקום 2,000!
        await this.updateCardInFirebase(card);
        this.renderTable();
        this.showStatus('כרטיס הוחזר בהצלחה', 'success');
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
            case 'issueDate':
                return card.issueDate || card.date || '';
            case 'creditDate':
                return card.creditDate || '';
            case 'gadudIssueDate':
                return card.gadudIssueDate || '';
            case 'gadudCreditDate':
                return card.gadudCreditDate || '';
            case 'currentHolder':
                return card.currentHolderName || 'לא זמין';
            case 'cardChain':
                return this.getCardChainText(card.cardChain);
            case 'gadudName':
                return card.gadudName || '';
            case 'remainingFuel':
                return (card.remainingFuel !== undefined && card.remainingFuel !== null) ? card.remainingFuel : (card.amount || '');
            default:
                // עמודות מותאמות אישית
                return card[column.id] || '';
        }
    }

    // קבלת טקסט שרשרת הכרטיס
    getCardChainText(cardChain) {
        if (!cardChain || cardChain.length === 0) return 'אין היסטוריה';
        
        return cardChain.map(link => 
            `${link.action}: ${link.amount} ליטר (${link.date})`
        ).join('<br>');
    }

    // קבלת טקסט סטטוס
    getStatusText(status) {
        switch(status) {
            case 'new': return 'חדש';
            case 'updated': return 'עודכן';
            case 'returned': return 'הוחזר';
            default: return status;
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
            this.tableColumns.forEach(column => {
                // בדוק אם המשתמש יכול לראות את העמודה
                if (this.canViewColumn(column)) {
                    let cellValue = this.getCellValue(card, column);
                    // אם זו עמודת כמות דלק שנשאר, הוסף אפשרות לחיצה לזיכוי גדודי
                    if (column.id === 'remainingFuel') {
                        const isClickable = card.gadudName; // רק אם יש נתונים גדודיים
                        const clickableClass = isClickable ? 'clickable-remaining-fuel' : '';
                        const cursorStyle = isClickable ? 'cursor: pointer;' : '';
                        const title = isClickable ? 'לחץ לזיכוי גדודי (איפוס ל-0)' : '';
                        rowContent += `<td class="${clickableClass}" style="${cursorStyle}" title="${title}" ${isClickable ? `onclick="fuelCardManager.showGadudCreditConfirmation('${card.cardNumber}', '')"` : ''}>${cellValue}</td>`;
                    } else {
                        rowContent += `<td>${cellValue}</td>`;
                    }
                }
            });
            
            row.innerHTML = rowContent;
            tbody.appendChild(row);
        });
        
        // עדכן את פקדי המיון והסינון אחרי רינדור הטבלה
        if (this.currentUser && this.currentUser.isAdmin) {
            this.updateAdminSortingControls();
        }
    }
    
    // סינון וחיפוש כרטיסים
    getFilteredAndSearchedCards() {
        let cards = this.getFilteredCards();
        
        // סינון לפי סטטוס (עדכון לתמיכה בכל האפשרויות)
        const statusFilter = document.getElementById('statusFilter');
        if (statusFilter && statusFilter.value !== 'all') {
            if (statusFilter.value === 'not_credited') {
                // הצג רק כרטיסים שלא זוכו (לא ירוקים)
                cards = cards.filter(card => {
                    return card.status !== 'returned' && card.status !== 'final_return';
                });
            } else if (statusFilter.value === 'credited') {
                // הצג רק כרטיסים שזוכו
                cards = cards.filter(card => {
                    return card.status === 'returned' || card.status === 'final_return';
                });
            } else if (statusFilter.value === 'new') {
                cards = cards.filter(card => card.status === 'new');
            } else if (statusFilter.value === 'updated') {
                cards = cards.filter(card => card.status === 'updated');
            } else if (statusFilter.value === 'returned') {
                cards = cards.filter(card => card.status === 'returned' || card.status === 'final_return');
            }
        }
        
        // סינון לפי גדוד (רק למנהל)
        const gadudFilter = document.getElementById('gadudFilter');
        if (gadudFilter && this.currentUser && this.currentUser.isAdmin && gadudFilter.value !== 'all') {
            if (gadudFilter.value === 'no_gadud') {
                cards = cards.filter(card => !card.gadudNumber || card.gadudNumber === '');
            } else {
                cards = cards.filter(card => card.gadudNumber === gadudFilter.value);
            }
        }
        
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
        
        // מיון (רק למנהל)
        const sortBy = document.getElementById('sortBy');
        if (sortBy && this.currentUser && this.currentUser.isAdmin && sortBy.value !== 'none') {
            cards = this.sortCards(cards, sortBy.value);
        }
        
        return cards;
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
        
        if (sortBy) sortBy.value = 'none';
        if (statusFilter) statusFilter.value = 'all';
        if (gadudFilter) gadudFilter.value = 'all';
        
        this.renderTable();
    }
    
    // סינון טבלה לפי חיפוש
    filterTable() {
        this.renderTable();
    }
    
    // עדכון תצוגת מספר כרטיסים מסוננים
    updateFilteredCardsCount(filteredCards) {
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

        // ודא שהתיבה מוצגת לפני החלת מחלקות האנימציה
        modal.style.display = 'flex';

        modal.setAttribute('data-status-type', statusType);
        modal.classList.remove('status-modal--hidden');
        modal.classList.add('status-modal--visible');
        modal.setAttribute('aria-hidden', 'false');

        if (this.statusModalTimeout) {
            clearTimeout(this.statusModalTimeout);
        }

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

        // בטל כל timeout פעיל
        if (this.statusModalTimeout) {
            clearTimeout(this.statusModalTimeout);
            this.statusModalTimeout = null;
        }

        // הסתר את ה-modal - מספר דרכים כדי לוודא שזה עובד
        modal.classList.remove('status-modal--visible');
        modal.classList.add('status-modal--hidden');
        modal.setAttribute('aria-hidden', 'true');
        
        // גם דרך style.display למקרה שה-CSS לא עובד - השתמש ב-none במקום empty
        modal.style.display = 'none';
        
        // נקה את התוכן
        const messageEl = document.getElementById('statusModalMessage');
        if (messageEl) {
            messageEl.textContent = '';
        }
        
        // הסתר גם את הרקע אם קיים
        const backdrop = modal.querySelector('div[style*="position: fixed"]');
        if (backdrop) {
            backdrop.style.display = 'none';
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
        this.showStatus('מצב מקבץ הופעל - ניתן לנפק מספר כרטיסים לאותו גורם', 'success');
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
        // בדיקת הרשאות - צריך משתמש מחובר
        if (!this.currentUser) {
            this.showStatus('נדרשת התחברות', 'error');
            return;
        }

        const cardIndex = this.fuelCards.findIndex(card => card.cardNumber === cardNumber);
        
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
        if (typeof remainingFuel !== 'undefined') {
            this.fuelCards[cardIndex].remainingFuel = remainingFuel;
        }
        this.fuelCards[cardIndex].gadudIssueDate = gadudIssueDate || this.formatDateTime();
        this.fuelCards[cardIndex].date = this.formatDateTime();

        // שמירה יעילה - רק 1 write במקום 2,000!
        await this.updateCardInFirebase(this.fuelCards[cardIndex]);
        this.renderTable();
        this.showStatus('נתונים גדודיים נוספו בהצלחה', 'success');
    }

    // עדכון נתונים גדודיים לכרטיס
    async updateGadudData(cardNumber, gadudName, remainingFuel) {
        // בדיקת הרשאות - צריך משתמש מחובר
        if (!this.currentUser) {
            this.showStatus('נדרשת התחברות', 'error');
            return;
        }

        const cardIndex = this.fuelCards.findIndex(card => card.cardNumber === cardNumber);
        
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
        this.fuelCards[cardIndex].remainingFuel = remainingFuel;
        this.fuelCards[cardIndex].date = this.formatDateTime();

        // שמירה יעילה - רק 1 write במקום 2,000!
        await this.updateCardInFirebase(this.fuelCards[cardIndex]);
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

        // המרת מספר כרטיס למספר כדי להבטיח השוואה נכונה (טיפול בבעיית טיפוסים)
        const cardNum = typeof cardNumber === 'string' ? parseInt(cardNumber, 10) : cardNumber;
        const cardIndex = this.fuelCards.findIndex(card => {
            const cardCardNum = typeof card.cardNumber === 'string' ? parseInt(card.cardNumber, 10) : card.cardNumber;
            return cardCardNum === cardNum;
        });
        
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
        this.fuelCards[cardIndex].remainingFuel = 0;
        this.fuelCards[cardIndex].gadudCreditDate = gadudCreditDate || this.formatDateTime();
        this.fuelCards[cardIndex].date = this.formatDateTime();

        // שמירה יעילה - רק 1 write במקום 2,000!
        await this.updateCardInFirebase(this.fuelCards[cardIndex]);
        this.renderTable();
        this.showStatus('נתונים גדודיים נמחקו בהצלחה (זיכוי גדודי)', 'success');
    }

    // הצגת חלונית אישור לזיכוי גדודי
    showGadudCreditConfirmation(cardNumber, gadudCreditDate) {
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
                        <button onclick="fuelCardManager.confirmGadudCredit()" style="
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
                        <button onclick="fuelCardManager.cancelGadudCredit()" style="
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
        // הסתר גם את הרקע
        const backdrop = dialog.querySelector('div[style*="position: fixed"]');
        if (backdrop) {
            backdrop.style.display = 'none';
        }
        const container = document.querySelector('.container') || document.getElementById('mainContainer');
        if (container) container.style.display = 'block';
        
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
        return JSON.parse(localStorage.getItem('currentUser') || 'null');
    }

    setCurrentUser(user) {
        localStorage.setItem('currentUser', JSON.stringify(user));
        this.currentUser = user;
    }

    async logout() {
        // התנתקות מ-Firebase Authentication
        try {
            if (window.auth && window.auth.currentUser && window.signOut) {
                await window.signOut(window.auth);
                console.log('✅ התנתקות מ-Firebase Authentication הצליחה');
            }
        } catch (error) {
            console.error('❌ שגיאה בהתנתקות מ-Firebase Authentication:', error);
        }
        
        localStorage.removeItem('currentUser');
        this.currentUser = null;
        this.clearBulkIssueState();
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
        // הסתר את ה-splash screen
        const splashScreen = document.getElementById('splashScreen');
        if (splashScreen) {
            splashScreen.classList.add('fade-out');
            setTimeout(() => {
                splashScreen.style.display = 'none';
            }, 600);
        }
        
        // הסתר את הממשק הראשי
        const container = document.querySelector('.container') || document.getElementById('mainContainer');
        if (container) container.style.display = 'none';
        
        // הצג טופס התחברות
        const loginForm = document.getElementById('loginForm');
        if (loginForm) loginForm.style.display = 'block';
    }

    showMainInterface() {
        // הסתר את ה-splash screen
        const splashScreen = document.getElementById('splashScreen');
        if (splashScreen) {
            splashScreen.classList.add('fade-out');
            setTimeout(() => {
                splashScreen.style.display = 'none';
            }, 600);
        }
        
        // הסתר טופס התחברות
        const loginForm = document.getElementById('loginForm');
        if (loginForm) loginForm.style.display = 'none';
        
        // הצג את הממשק הראשי
        const container = document.querySelector('.container') || document.getElementById('mainContainer');
        if (container) container.style.display = 'block';
        
        // עדכן את הממשק לפי הרשאות המשתמש
        this.updateInterfaceByPermissions();
    }

    async login() {
        const name = document.getElementById('loginName').value.trim();
        const gadud = document.getElementById('loginGadud').value;
        
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
        
        // 🔒 התחברות ל-Firebase Authentication (רק אחרי שהסיסמה נכונה!)
        try {
            if (!window.auth || !window.signInAnonymously) {
                console.warn('⚠️ Firebase Authentication לא זמין - המשך ללא Authentication');
                // נסה שוב אחרי שנייה
                setTimeout(() => this.initFirebaseAuth(), 1000);
            } else if (!window.auth.currentUser) {
                // התחברות ל-Firebase Anonymous Authentication
                console.log('🔄 מנסה להתחבר ל-Firebase Authentication...');
                await window.signInAnonymously(window.auth);
                console.log('✅ התחברות ל-Firebase Authentication הצליחה');
            } else {
                console.log('✅ משתמש כבר מחובר ל-Firebase Authentication');
            }
        } catch (error) {
            console.error('❌ שגיאה בהתחברות ל-Firebase Authentication:', error);
            // אם זו שגיאת permission, זה אומר ש-Anonymous Authentication לא מופעל
            if (error.code === 'auth/operation-not-allowed') {
                console.error('⚠️ Anonymous Authentication לא מופעל ב-Firebase Console!');
                this.showStatus('שגיאה: Anonymous Authentication לא מופעל. אנא הפעל אותו ב-Firebase Console → Authentication → Sign-in method', 'error');
            } else {
                // נמשיך גם אם Authentication נכשל, אבל נזהיר
                this.showStatus('אזהרה: בעיה בהתחברות לאבטחה. חלק מהפונקציות עלולות לא לעבוד.', 'warning');
            }
        }
        
        const user = {
            name: name,
            gadud: validatedGadud,
            isAdmin: isAdmin,
            loginTime: new Date().toLocaleString('he-IL')
        };
        
        this.setCurrentUser(user);
        this.showMainInterface();
        // עדכן את פקדי המיון והסינון מיד אחרי התחברות
        setTimeout(() => {
            this.updateAdminSortingControls();
        }, 500);
        this.showStatus(`ברוך הבא!`, 'success');
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
        const editCardBtn = document.getElementById('editCardBtn');
        
        if (user.isAdmin) {
            userInfo.textContent = `${user.name} - מנהל מערכת`;
            if (adminPanelBtn) adminPanelBtn.style.display = 'inline-block';
            if (editCardBtn) {
                editCardBtn.style.display = 'inline-block';
                console.log('✅ כפתור עריכת כרטיס מוצג למנהל מערכת');
            } else {
                console.error('❌ כפתור עריכת כרטיס לא נמצא ב-DOM');
            }
        } else {
            userInfo.textContent = `${user.name} - גדוד ${user.gadud}`;
            if (adminPanelBtn) adminPanelBtn.style.display = 'none';
            if (editCardBtn) editCardBtn.style.display = 'none';
        }
        
        userInfoDiv.style.display = 'block';
        
        // עדכן את פקדי המיון והסינון
        this.updateAdminSortingControls();
        
        // הסתר/הצג כפתורים לפי הרשאות
        this.updateButtonVisibility();
        this.updateBulkIssueUI();
        
        // עדכן את הטבלה לפי הרשאות
        this.renderTable();
    }
    
    // עדכון פקדי מיון וסינון למנהל
    updateAdminSortingControls() {
        const adminSortingControls = document.getElementById('adminSortingControls');
        if (!adminSortingControls) {
            console.warn('adminSortingControls לא נמצא בדף - נסה שוב בעוד רגע');
            return;
        }
        
        // בדוק אם המשתמש הוא מנהל
        const isAdmin = this.currentUser && this.currentUser.isAdmin;
        
        if (isAdmin) {
            adminSortingControls.style.display = 'block';
            console.log('✅ פקדי מיון וסינון מוצגים למנהל מערכת');
        } else {
            adminSortingControls.style.display = 'none';
            if (this.currentUser) {
                console.log('❌ פקדי מיון וסינון מוסתרים - משתמש לא מנהל');
            } else {
                console.log('❌ פקדי מיון וסינון מוסתרים - אין משתמש מחובר');
            }
        }
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

        // כפתור זיכוי רצף - רק למנהל
        const batchCreditBtn = document.getElementById('batchCreditBtn');
        if (batchCreditBtn) {
            batchCreditBtn.style.display = user.isAdmin ? 'block' : 'none';
        }

        // כפתור החזרה רצף - רק למנהל
        const batchReturnBtn = document.getElementById('batchReturnBtn');
        if (batchReturnBtn) {
            batchReturnBtn.style.display = user.isAdmin ? 'block' : 'none';
        }

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
        const container = document.querySelector('.container') || document.getElementById('mainContainer');
        if (container) container.style.display = 'none';
        
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
        const container = document.querySelector('.container') || document.getElementById('mainContainer');
        if (container) container.style.display = 'block';
        
        // המשך עם יצירת הכרטיס
        this.addNewCard(command);
    }

    cancelGadudSelection() {
        const gadudForm = document.getElementById('gadudSelectionForm');
        gadudForm.style.display = 'none';
        const container = document.querySelector('.container') || document.getElementById('mainContainer');
        if (container) container.style.display = 'block';
        this.showStatus('ניפוק הכרטיס בוטל', 'error');
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

    // זיכוי רצף - פתיחת modal
    showBatchCreditModal() {
        if (!this.currentUser || !this.currentUser.isAdmin) {
            this.showStatus('אין לך הרשאה לבצע זיכוי רצף. רק מנהל מערכת יכול לבצע פעולה זו.', 'error');
            return;
        }

        const modal = document.getElementById('batchCreditModal');
        if (modal) {
            modal.style.display = 'block';
            // נקה את הבחירה הקודמת
            document.getElementById('batchCreditGadud').value = '';
            document.getElementById('batchCreditCardsList').innerHTML = '<p style="text-align: center; color: #666;">בחר גדוד כדי לראות כרטיסים</p>';
            document.getElementById('executeBatchCreditBtn').style.display = 'none';
        }
    }

    // זיכוי רצף - סגירת modal
    closeBatchCreditModal() {
        const modal = document.getElementById('batchCreditModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // זיכוי רצף - טעינת כרטיסים לפי גדוד
    loadCardsForBatchCredit() {
        const gadud = document.getElementById('batchCreditGadud').value;
        const cardsList = document.getElementById('batchCreditCardsList');
        const executeBtn = document.getElementById('executeBatchCreditBtn');

        if (!gadud) {
            cardsList.innerHTML = '<p style="text-align: center; color: #666;">בחר גדוד כדי לראות כרטיסים</p>';
            executeBtn.style.display = 'none';
            return;
        }

        // סנן כרטיסים: שייכים לגדוד, יש להם gadudCreditDate (זוכו גדודית), אבל לא הוחזרו לגמרי
        const eligibleCards = this.fuelCards.filter(card => {
            return card.gadudNumber === gadud && 
                   card.gadudCreditDate && 
                   card.status !== 'returned' && 
                   card.status !== 'final_return';
        });

        if (eligibleCards.length === 0) {
            cardsList.innerHTML = '<p style="text-align: center; color: #666;">לא נמצאו כרטיסים לזיכוי בגדוד זה</p>';
            executeBtn.style.display = 'none';
            return;
        }

        // צור רשימה עם checkboxes
        let html = '<div style="direction: rtl;">';
        html += `<h4 style="margin-bottom: 15px; color: #2c3e50;">נמצאו ${eligibleCards.length} כרטיסים לזיכוי:</h4>`;
        html += '<div style="max-height: 350px; overflow-y: auto;">';
        
        eligibleCards.forEach((card, index) => {
            const cardNum = typeof card.cardNumber === 'string' ? parseInt(card.cardNumber, 10) : card.cardNumber;
            html += `
                <div style="
                    padding: 12px;
                    margin-bottom: 8px;
                    border: 2px solid #ddd;
                    border-radius: 8px;
                    background: #f9f9f9;
                    display: flex;
                    align-items: center;
                    gap: 15px;
                ">
                    <input 
                        type="checkbox" 
                        id="batchCreditCard_${cardNum}" 
                        value="${cardNum}"
                        style="width: 20px; height: 20px; cursor: pointer;"
                        onchange="fuelCardManager.updateBatchCreditButton()"
                    >
                    <label for="batchCreditCard_${cardNum}" style="flex: 1; cursor: pointer; margin: 0;">
                        <strong>כרטיס ${cardNum}</strong> - ${card.name || 'ללא שם'} 
                        ${card.gadudName ? `(${card.gadudName})` : ''}
                        ${card.remainingFuel !== undefined ? `- נשאר: ${card.remainingFuel} ליטר` : ''}
                    </label>
                </div>
            `;
        });
        
        html += '</div></div>';
        cardsList.innerHTML = html;
        executeBtn.style.display = 'none';
    }

    // עדכון נראות כפתור ביצוע זיכוי
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

    // בחירת כל הכרטיסים
    selectAllBatchCredit() {
        const checkboxes = document.querySelectorAll('#batchCreditCardsList input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.checked = true;
        });
        this.updateBatchCreditButton();
    }

    // ביטול בחירת כל הכרטיסים
    deselectAllBatchCredit() {
        const checkboxes = document.querySelectorAll('#batchCreditCardsList input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.checked = false;
        });
        this.updateBatchCreditButton();
    }

    // ביצוע זיכוי על כל הכרטיסים שנבחרו
    async executeBatchCredit() {
        const checkboxes = document.querySelectorAll('#batchCreditCardsList input[type="checkbox"]:checked');
        
        if (checkboxes.length === 0) {
            this.showStatus('לא נבחרו כרטיסים לזיכוי', 'error');
            return;
        }

        // הצגת חלונית אישור
        const cardNumbers = Array.from(checkboxes).map(cb => parseInt(cb.value, 10));
        const confirmMessage = `האם אתה בטוח שברצונך לזכות ${cardNumbers.length} כרטיסים?\n\nכרטיסים: ${cardNumbers.join(', ')}`;
        
        if (!confirm(confirmMessage)) {
            return;
        }

        // ביצוע זיכוי על כל הכרטיסים
        this.showStatus(`מבצע זיכוי על ${cardNumbers.length} כרטיסים...`, 'processing');
        
        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        for (const cardNum of cardNumbers) {
            try {
                // מצא את הכרטיס
                const cardIndex = this.fuelCards.findIndex(card => {
                    const cardCardNum = typeof card.cardNumber === 'string' ? parseInt(card.cardNumber, 10) : card.cardNumber;
                    return cardCardNum === cardNum;
                });

                if (cardIndex === -1) {
                    errors.push(`כרטיס ${cardNum} לא נמצא`);
                    errorCount++;
                    continue;
                }

                const card = this.fuelCards[cardIndex];
                
                // בדיקה שהכרטיס לא הוחזר לגמרי
                if (card.status === 'returned' || card.status === 'final_return') {
                    errors.push(`כרטיס ${cardNum} כבר הוחזר לגמרי`);
                    errorCount++;
                    continue;
                }

                // עדכון הכרטיס - החזרה (זיכוי סופי)
                card.status = 'returned';
                card.date = this.formatDateTime();
                card.creditDate = this.formatDateTime();
                
                // הוסף לשרשרת העברת כרטיס
                if (!card.cardChain) {
                    card.cardChain = [];
                }
                card.cardChain.push({
                    action: 'החזרת כרטיס (זיכוי רצף)',
                    amount: card.amount,
                    date: this.formatDateTime(),
                    status: 'returned'
                });
                
                // שמירה ב-Firebase
                await this.updateCardInFirebase(card);
                successCount++;
            } catch (error) {
                console.error(`שגיאה בזיכוי כרטיס ${cardNum}:`, error);
                errors.push(`כרטיס ${cardNum}: ${error.message}`);
                errorCount++;
            }
        }

        // עדכון הטבלה
        this.renderTable();

        // סגירת ה-modal
        this.closeBatchCreditModal();

        // הצגת תוצאות
        if (errorCount === 0) {
            this.showStatus(`זיכוי הושלם בהצלחה! ${successCount} כרטיסים זוכו.`, 'success');
        } else {
            const errorMsg = `זיכוי הושלם חלקית: ${successCount} כרטיסים זוכו, ${errorCount} שגיאות.\n${errors.join('\n')}`;
            this.showStatus(errorMsg, 'error');
        }
    }

    // החזרה רצף - פתיחת modal
    showBatchReturnModal() {
        if (!this.currentUser || !this.currentUser.isAdmin) {
            this.showStatus('אין לך הרשאה לבצע החזרה רצף. רק מנהל מערכת יכול לבצע פעולה זו.', 'error');
            return;
        }

        const modal = document.getElementById('batchReturnModal');
        if (modal) {
            modal.style.display = 'block';
            // נקה את הבחירה הקודמת
            document.getElementById('batchReturnGadud').value = '';
            document.getElementById('batchReturnCardsList').innerHTML = '<p style="text-align: center; color: #666;">בחר גדוד כדי לראות כרטיסים</p>';
            document.getElementById('executeBatchReturnBtn').style.display = 'none';
        }
    }

    // החזרה רצף - סגירת modal
    closeBatchReturnModal() {
        const modal = document.getElementById('batchReturnModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // החזרה רצף - טעינת כרטיסים לפי גדוד
    loadCardsForBatchReturn() {
        const gadud = document.getElementById('batchReturnGadud').value;
        const cardsList = document.getElementById('batchReturnCardsList');
        const executeBtn = document.getElementById('executeBatchReturnBtn');

        if (!gadud) {
            cardsList.innerHTML = '<p style="text-align: center; color: #666;">בחר גדוד כדי לראות כרטיסים</p>';
            executeBtn.style.display = 'none';
            return;
        }

        // סנן כרטיסים: שייכים לגדוד, יש להם gadudCreditDate (זוכו גדודית), 
        // remainingFuel = 0 (אין דלק שנותר), ולא הוחזרו לגמרי
        const eligibleCards = this.fuelCards.filter(card => {
            const remaining = card.remainingFuel !== undefined && card.remainingFuel !== null 
                ? Number(card.remainingFuel) 
                : null;
            return card.gadudNumber === gadud && 
                   card.gadudCreditDate && 
                   (remaining === null || remaining === 0) &&
                   card.status !== 'returned' && 
                   card.status !== 'final_return';
        });

        if (eligibleCards.length === 0) {
            cardsList.innerHTML = '<p style="text-align: center; color: #666;">לא נמצאו כרטיסים להחזרה בגדוד זה (צריך זיכוי גדודי מלא - כמות שנותרה = 0)</p>';
            executeBtn.style.display = 'none';
            return;
        }

        // צור רשימה עם checkboxes
        let html = '<div style="direction: rtl;">';
        html += `<h4 style="margin-bottom: 15px; color: #2c3e50;">נמצאו ${eligibleCards.length} כרטיסים להחזרה:</h4>`;
        html += '<div style="max-height: 350px; overflow-y: auto;">';
        
        eligibleCards.forEach((card, index) => {
            const cardNum = typeof card.cardNumber === 'string' ? parseInt(card.cardNumber, 10) : card.cardNumber;
            const remaining = card.remainingFuel !== undefined && card.remainingFuel !== null 
                ? Number(card.remainingFuel) 
                : 0;
            html += `
                <div style="
                    padding: 12px;
                    margin-bottom: 8px;
                    border: 2px solid #ddd;
                    border-radius: 8px;
                    background: #f9f9f9;
                    display: flex;
                    align-items: center;
                    gap: 15px;
                ">
                    <input 
                        type="checkbox" 
                        id="batchReturnCard_${cardNum}" 
                        value="${cardNum}"
                        style="width: 20px; height: 20px; cursor: pointer;"
                        onchange="fuelCardManager.updateBatchReturnButton()"
                    >
                    <label for="batchReturnCard_${cardNum}" style="flex: 1; cursor: pointer; margin: 0;">
                        <strong>כרטיס ${cardNum}</strong> - ${card.name || 'ללא שם'} 
                        ${card.gadudName ? `(${card.gadudName})` : ''}
                        ${remaining === 0 ? '- כמות שנותרה: 0 ליטר ✓' : ''}
                        ${card.gadudCreditDate ? `- זיכוי גדודי: ${card.gadudCreditDate}` : ''}
                    </label>
                </div>
            `;
        });
        
        html += '</div></div>';
        cardsList.innerHTML = html;
        executeBtn.style.display = 'none';
    }

    // עדכון נראות כפתור ביצוע החזרה
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

    // בחירת כל הכרטיסים להחזרה
    selectAllBatchReturn() {
        const checkboxes = document.querySelectorAll('#batchReturnCardsList input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.checked = true;
        });
        this.updateBatchReturnButton();
    }

    // ביטול בחירת כל הכרטיסים להחזרה
    deselectAllBatchReturn() {
        const checkboxes = document.querySelectorAll('#batchReturnCardsList input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.checked = false;
        });
        this.updateBatchReturnButton();
    }

    // ביצוע החזרה על כל הכרטיסים שנבחרו
    async executeBatchReturn() {
        const checkboxes = document.querySelectorAll('#batchReturnCardsList input[type="checkbox"]:checked');
        
        if (checkboxes.length === 0) {
            this.showStatus('לא נבחרו כרטיסים להחזרה', 'error');
            return;
        }

        // הצגת חלונית אישור
        const cardNumbers = Array.from(checkboxes).map(cb => parseInt(cb.value, 10));
        const confirmMessage = `האם אתה בטוח שברצונך להחזיר ${cardNumbers.length} כרטיסים?\n\nכרטיסים: ${cardNumbers.join(', ')}`;
        
        if (!confirm(confirmMessage)) {
            return;
        }

        // ביצוע החזרה על כל הכרטיסים
        this.showStatus(`מבצע החזרה על ${cardNumbers.length} כרטיסים...`, 'processing');
        
        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        for (const cardNum of cardNumbers) {
            try {
                // מצא את הכרטיס
                const cardIndex = this.fuelCards.findIndex(card => {
                    const cardCardNum = typeof card.cardNumber === 'string' ? parseInt(card.cardNumber, 10) : card.cardNumber;
                    return cardCardNum === cardNum;
                });

                if (cardIndex === -1) {
                    errors.push(`כרטיס ${cardNum} לא נמצא`);
                    errorCount++;
                    continue;
                }

                const card = this.fuelCards[cardIndex];
                
                // בדיקה שהכרטיס לא הוחזר לגמרי
                if (card.status === 'returned' || card.status === 'final_return') {
                    errors.push(`כרטיס ${cardNum} כבר הוחזר לגמרי`);
                    errorCount++;
                    continue;
                }

                // בדיקה שיש זיכוי גדודי
                if (!card.gadudCreditDate) {
                    errors.push(`כרטיס ${cardNum} - לא ניתן להחזיר לפני ביצוע זיכוי גדודי`);
                    errorCount++;
                    continue;
                }

                // בדיקה שכמות שנותרה היא 0
                const remaining = card.remainingFuel !== undefined && card.remainingFuel !== null 
                    ? Number(card.remainingFuel) 
                    : null;
                if (remaining !== null && remaining !== 0) {
                    errors.push(`כרטיס ${cardNum} - לא ניתן להחזיר לפני זיכוי גדודי מלא (כמות שנותרה חייבת להיות 0)`);
                    errorCount++;
                    continue;
                }

                // עדכון הכרטיס - החזרה (זיכוי סופי)
                card.status = 'returned';
                card.date = this.formatDateTime();
                const creditDate = this.formatDateTime();
                card.creditDate = creditDate;
                
                // הוסף לשרשרת העברת כרטיס
                if (!card.cardChain) {
                    card.cardChain = [];
                }
                card.cardChain.push({
                    action: 'החזרת כרטיס (החזרה רצף)',
                    amount: card.amount,
                    date: this.formatDateTime(),
                    status: 'returned'
                });
                
                // שמירה ב-Firebase
                await this.updateCardInFirebase(card);
                successCount++;
            } catch (error) {
                console.error(`שגיאה בהחזרת כרטיס ${cardNum}:`, error);
                errors.push(`כרטיס ${cardNum}: ${error.message}`);
                errorCount++;
            }
        }

        // עדכון הטבלה
        this.renderTable();

        // סגירת ה-modal
        this.closeBatchReturnModal();

        // הצגת תוצאות
        if (errorCount === 0) {
            this.showStatus(`החזרה הושלמה בהצלחה! ${successCount} כרטיסים הוחזרו.`, 'success');
        } else {
            const errorMsg = `החזרה הושלמה חלקית: ${successCount} כרטיסים הוחזרו, ${errorCount} שגיאות.\n${errors.join('\n')}`;
            this.showStatus(errorMsg, 'error');
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
        // נקה את שדה הסיסמה
        const passwordInput = document.getElementById('editCardPassword');
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.focus();
        }
    }

    // יצירת חלונית אימות סיסמה
    createEditCardPasswordDialog() {
        const dialog = document.createElement('div');
        dialog.id = 'editCardPasswordDialog';
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
                    min-width: 400px;
                    direction: rtl;
                ">
                    <h2 style="color: #2c3e50; margin-bottom: 30px;">אימות סיסמה לעריכה</h2>
                    <div style="margin-bottom: 20px;">
                        <input type="password" id="editCardPassword" placeholder="הכנס סיסמה" style="
                            width: 100%;
                            padding: 12px;
                            border: 2px solid #ddd;
                            border-radius: 8px;
                            font-size: 16px;
                            margin-bottom: 15px;
                        " onkeypress="if(event.key === 'Enter') fuelCardManager.verifyEditCardPassword()">
                    </div>
                    <div style="display: flex; gap: 15px; justify-content: center;">
                        <button onclick="fuelCardManager.verifyEditCardPassword()" style="
                            background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
                            color: white;
                            border: none;
                            padding: 15px 30px;
                            border-radius: 25px;
                            font-size: 16px;
                            cursor: pointer;
                            font-weight: 600;
                        ">אישור</button>
                        <button onclick="fuelCardManager.cancelEditCardPassword()" style="
                            background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%);
                            color: white;
                            border: none;
                            padding: 15px 30px;
                            border-radius: 25px;
                            font-size: 16px;
                            cursor: pointer;
                            font-weight: 600;
                        ">ביטול</button>
                    </div>
                    <div id="editCardPasswordStatus" style="margin-top: 20px; padding: 10px; border-radius: 8px; display: none;"></div>
                </div>
            </div>
        `;
        return dialog;
    }

    // אימות סיסמה לעריכה
    verifyEditCardPassword() {
        const passwordInput = document.getElementById('editCardPassword');
        const statusDiv = document.getElementById('editCardPasswordStatus');
        
        if (!passwordInput) return;
        
        const password = passwordInput.value.trim();
        
        if (password !== 'omribg9526') {
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
        
        // סיסמה נכונה - סגור את חלונית הסיסמה והצג את טופס העריכה
        const passwordDialog = document.getElementById('editCardPasswordDialog');
        if (passwordDialog) {
            passwordDialog.style.display = 'none';
        }
        
        this.showEditCardFormDialog();
    }

    // ביטול אימות סיסמה
    cancelEditCardPassword() {
        const passwordDialog = document.getElementById('editCardPasswordDialog');
        if (passwordDialog) {
            passwordDialog.style.display = 'none';
            // הסתר גם את הרקע
            const backdrop = passwordDialog.querySelector('div[style*="position: fixed"]');
            if (backdrop) {
                backdrop.style.display = 'none';
            }
        }
        const container = document.querySelector('.container') || document.getElementById('mainContainer');
        if (container) container.style.display = 'block';
    }

    // הצגת טופס עריכת כרטיס
    showEditCardFormDialog() {
        // צור/הצג טופס עריכה
        let editForm = document.getElementById('editCardFormDialog');
        if (!editForm) {
            editForm = this.createEditCardFormDialog();
            document.body.appendChild(editForm);
        }
        
        // נקה את הטופס
        this.clearEditCardForm();
        
        editForm.style.display = 'block';
    }

    // יצירת טופס עריכת כרטיס
    createEditCardFormDialog() {
        const dialog = document.createElement('div');
        dialog.id = 'editCardFormDialog';
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
                overflow-y: auto;
                padding: 20px;
            ">
                <div style="
                    background: white;
                    padding: 40px;
                    border-radius: 15px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                    text-align: right;
                    min-width: 500px;
                    max-width: 800px;
                    width: 100%;
                    direction: rtl;
                ">
                    <h2 style="color: #2c3e50; margin-bottom: 30px; text-align: center;">עריכת כרטיס</h2>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #2c3e50;">מספר כרטיס (לחיפוש):</label>
                        <input type="number" id="editCardSearchNumber" placeholder="הכנס מספר כרטיס" style="
                            width: 100%;
                            padding: 12px;
                            border: 2px solid #ddd;
                            border-radius: 8px;
                            font-size: 16px;
                        " onkeypress="if(event.key === 'Enter') fuelCardManager.searchCardForEdit()">
                        <button onclick="fuelCardManager.searchCardForEdit()" style="
                            background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
                            color: white;
                            border: none;
                            padding: 10px 20px;
                            border-radius: 8px;
                            font-size: 14px;
                            cursor: pointer;
                            margin-top: 10px;
                            width: 100%;
                        ">חפש כרטיס</button>
                    </div>
                    
                    <div id="editCardFormFields" style="display: none;">
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #2c3e50;">מספר כרטיס:</label>
                            <input type="number" id="editCardNumber" style="
                                width: 100%;
                                padding: 12px;
                                border: 2px solid #ddd;
                                border-radius: 8px;
                                font-size: 16px;
                            ">
                        </div>
                        
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #2c3e50;">שם מלא:</label>
                            <input type="text" id="editName" placeholder="הכנס שם מלא" style="
                                width: 100%;
                                padding: 12px;
                                border: 2px solid #ddd;
                                border-radius: 8px;
                                font-size: 16px;
                            ">
                        </div>
                        
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #2c3e50;">מספר טלפון:</label>
                            <input type="tel" id="editPhone" placeholder="הכנס מספר טלפון" style="
                                width: 100%;
                                padding: 12px;
                                border: 2px solid #ddd;
                                border-radius: 8px;
                                font-size: 16px;
                            ">
                        </div>
                        
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #2c3e50;">סוג דלק:</label>
                            <div class="fuel-type-selector" data-fuel-selector="editFuelType">
                                <div class="fuel-type-buttons">
                                    <button type="button" class="fuel-type-option" data-fuel-value="בנזין" onclick="selectFuelType('editFuelType', 'בנזין', this)">בנזין</button>
                                    <button type="button" class="fuel-type-option" data-fuel-value="סולר" onclick="selectFuelType('editFuelType', 'סולר', this)">סולר</button>
                                    <button type="button" class="fuel-type-option" data-fuel-value="other" onclick="selectFuelType('editFuelType', 'other', this)">אחר</button>
                                </div>
                                <div class="fuel-type-custom">
                                    <input type="text" id="editFuelType" placeholder="הקלד סוג דלק" oninput="handleCustomFuelInput('editFuelType')">
                                </div>
                            </div>
                        </div>
                        
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #2c3e50;">מספר גדוד:</label>
                            <select id="editGadudNumber" style="
                                width: 100%;
                                padding: 12px;
                                border: 2px solid #ddd;
                                border-radius: 8px;
                                font-size: 16px;
                            ">
                                <option value="">בחר מספר גדוד</option>
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
                        
                        <div style="display: flex; gap: 15px; justify-content: center; margin-top: 30px;">
                            <button onclick="fuelCardManager.submitEditCard()" style="
                                background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
                                color: white;
                                border: none;
                                padding: 15px 30px;
                                border-radius: 25px;
                                font-size: 16px;
                                cursor: pointer;
                                font-weight: 600;
                            ">שמור שינויים</button>
                            <button onclick="fuelCardManager.cancelEditCard()" style="
                                background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%);
                                color: white;
                                border: none;
                                padding: 15px 30px;
                                border-radius: 25px;
                                font-size: 16px;
                                cursor: pointer;
                                font-weight: 600;
                            ">ביטול</button>
                        </div>
                    </div>
                    
                    <div id="editCardStatus" style="margin-top: 20px; padding: 10px; border-radius: 8px; display: none;"></div>
                </div>
            </div>
        `;
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
                if (fuelType === 'בנזין' || fuelType === 'סולר') {
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

    // ביטול עריכה
    cancelEditCard() {
        const editForm = document.getElementById('editCardFormDialog');
        if (editForm) {
            editForm.style.display = 'none';
            // גם הסתר את הרקע
            const backdrop = editForm.querySelector('div[style*="position: fixed"]');
            if (backdrop) {
                backdrop.style.display = 'none';
            }
        }
        const container = document.querySelector('.container') || document.getElementById('mainContainer');
        if (container) container.style.display = 'block';
        this.clearEditCardForm();
    }

    // ניקוי טופס עריכה
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
            resetFuelTypeSelector('editFuelType');
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

    isPhoneNumber(text) {
        return /0\d{2,3}-?\d{7}/.test(text);
    }
}

// אתחול המערכת
console.log('מתחיל לטעון את המערכת...');
const fuelCardManager = new FuelCardManager();
// הגדר גם ב-window כדי שה-onclick handlers יעבדו
window.fuelCardManager = fuelCardManager;

// פונקציות גלובליות
function startRecording(action) {
    fuelCardManager.startRecording(action);
}

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
    
    console.log('פקודה נוצרה:', command);
    
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
    const issueDateField = document.getElementById('newIssueDate');
    if (issueDateField) {
        issueDateField.value = '';
    }
    resetFuelTypeSelector('newFuelType');
    resetAmountSelector('newAmount');
    if (window.fuelCardManager && window.fuelCardManager.isBulkIssueActive()) {
        window.fuelCardManager.applyBulkIssueDataToForm();
    }
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
        console.error('שגיאה באיפוס בורר דלק:', error);
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
    const gadudCreditDateInput = document.getElementById('gadudCreditDate').value;
    const gadudCreditDate = fuelCardManager.formatDateTime(gadudCreditDateInput);
    
    // בדיקת שדה חובה
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
    
    // הצגת חלונית אישור לפני ביצוע הזיכוי
    fuelCardManager.showGadudCreditConfirmation(cardNum, gadudCreditDate);
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
    const creditDateField = document.getElementById('gadudCreditDate');
    if (creditDateField) {
        creditDateField.value = '';
    }
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
                "עדכון גדודי כרטיס [מספר] [שם] [כמות דלק שנשאר]"
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

// הורדת Excel
function downloadExcel() {
    fuelCardManager.downloadExcel();
}

// וידוא שהפונקציות זמינות
console.log('בודק זמינות פונקציות...');
console.log('showTypingForm:', typeof showTypingForm);
console.log('submitNewCard:', typeof submitNewCard);
console.log('startRecording:', typeof startRecording);
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
        const voiceInstructions = document.getElementById('voiceInstructions');
        if (voiceInstructions && voiceInstructions.style.display === 'block') {
            hideInstructions();
        }
    }
});
