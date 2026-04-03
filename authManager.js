class AuthManager {
    constructor(controller) {
        this.controller = controller;
        this._authStateListenerBound = false;
    }

    getCurrentUser() {
        return JSON.parse(localStorage.getItem('currentUser') || 'null');
    }

    setCurrentUser(user) {
        localStorage.setItem('currentUser', JSON.stringify(user));
        this.controller.currentUser = user;
    }

    checkLogin() {
        if (!this.controller.currentUser || !window.auth || !window.auth.currentUser) {
            this.controller.uiManager.showLoginForm();
        } else {
            this.controller.uiManager.showMainInterface();
        }
    }

    async waitForFirebaseAndInit() {
        let attempts = 0;
        const maxAttempts = 20;
        while (attempts < maxAttempts) {
            if (window.firebaseReady && window.auth && window.onAuthStateChanged) {
                this.setupAuthStateListener();
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
            attempts++;
        }
        this.setupAuthStateListener();
    }

    setupAuthStateListener() {
        if (this._authStateListenerBound) return;
        this._authStateListenerBound = true;

        window.onAuthStateChanged(window.auth, async (user) => {
            if (!user) {
                localStorage.removeItem('currentUser');
                this.controller.currentUser = null;
                this.controller.uiManager.showLoginForm();
                return;
            }

            const email = user.email || '';
            const adminEmail = 'admin@fuelcards-system.com';
            const isAdmin = email === adminEmail;
            const gadudMap = {
                '650@fuelcards-system.com': '650',
                '703@fuelcards-system.com': '703',
                '651@fuelcards-system.com': '651',
                '791@fuelcards-system.com': '791',
                '652@fuelcards-system.com': '652',
                '638@fuelcards-system.com': '638',
                '653@fuelcards-system.com': '653',
                '674@fuelcards-system.com': '674'
            };
            const gadud = isAdmin ? 'admin' : (gadudMap[email] || '');
            if (!gadud) {
                await window.signOut(window.auth);
                localStorage.removeItem('currentUser');
                this.controller.currentUser = null;
                this.controller.uiManager.showLoginForm();
                return;
            }

            this.setCurrentUser({
                name: email,
                gadud,
                isAdmin,
                loginTime: new Date().toLocaleString('he-IL')
            });
            this.controller.uiManager.showMainInterface();
            setTimeout(() => this.controller.loadDataFromFirebase(), 100);
        });
    }

    async login() {
        const nameInput = document.getElementById('loginName');
        const gadudInput = document.getElementById('loginGadud');
        const name = nameInput ? nameInput.value.trim() : '';
        const gadud = gadudInput ? gadudInput.value : '';

        if (!name || !gadud) {
            this.controller.uiManager.showLoginStatus('יש למלא את כל השדות', 'error');
            return;
        }

        const password = name;
        const adminEmail = 'admin@fuelcards-system.com';
        const gadudEmails = {
            '650': '650@fuelcards-system.com',
            '703': '703@fuelcards-system.com',
            '651': '651@fuelcards-system.com',
            '791': '791@fuelcards-system.com',
            '652': '652@fuelcards-system.com',
            '638': '638@fuelcards-system.com',
            '653': '653@fuelcards-system.com',
            '674': '674@fuelcards-system.com'
        };
        const email = (gadud === 'admin' || gadud === 'מנהל מערכת') ? adminEmail : gadudEmails[gadud];
        if (!email) {
            this.controller.uiManager.showLoginStatus('סיסמה סודית שגויה או גדוד לא מורשה', 'error');
            return;
        }

        try {
            if (!window.signInWithEmailAndPassword) {
                this.controller.uiManager.showLoginStatus('שגיאה: Firebase Auth לא זמין', 'error');
                return;
            }
            await window.signInWithEmailAndPassword(window.auth, email, password);
            this.controller.showStatus('התחברות הצליחה', 'success');
        } catch (error) {
            console.error('❌ שגיאה בהתחברות:', error);
            this.controller.uiManager.showLoginStatus('סיסמה סודית שגויה או גדוד לא מורשה', 'error');
        }
    }

    async logout() {
        try {
            if (window.auth && window.auth.currentUser && window.signOut) {
                await window.signOut(window.auth);
            }
        } catch (error) {
            console.error('❌ שגיאה בהתנתקות מ-Firebase Authentication:', error);
        }

        localStorage.removeItem('currentUser');
        this.controller.currentUser = null;
        this.controller.uiManager.showLoginForm();
    }
}

window.AuthManager = AuthManager;
