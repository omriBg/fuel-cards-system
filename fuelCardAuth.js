(function () {
    'use strict';

    function getContainer() {
        return document.querySelector('.container') || document.getElementById('mainContainer');
    }

    function getGadudFromEmail(mail) {
        const map = {
            '650@fuelcards-system.com': '650',
            '703@fuelcards-system.com': '703',
            '651@fuelcards-system.com': '651',
            '791@fuelcards-system.com': '791',
            '652@fuelcards-system.com': '652',
            '638@fuelcards-system.com': '638',
            '653@fuelcards-system.com': '653',
            '674@fuelcards-system.com': '674'
        };
        return map[mail] || '';
    }

    window.FuelCardAuth = {
        getCurrentUser() {
            return JSON.parse(localStorage.getItem('currentUser') || 'null');
        },

        setCurrentUser(manager, user) {
            localStorage.setItem('currentUser', JSON.stringify(user));
            manager.currentUser = user;
        },

        async waitForFirebaseAndInit(manager) {
            let attempts = 0;
            const maxAttempts = 20;
            while (attempts < maxAttempts) {
                if (window.firebaseReady && window.auth && window.onAuthStateChanged) {
                    console.log('✅ Firebase מוכן, מגדיר מאזין Authentication...');
                    this.setupAuthStateListener(manager);
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 500));
                attempts++;
            }
            console.error('❌ Firebase לא נטען אחרי 10 שניות - מנסה בכל זאת...');
            this.setupAuthStateListener(manager);
        },

        setupAuthStateListener(manager) {
            if (manager._authStateListenerBound) return;
            manager._authStateListenerBound = true;

            window.onAuthStateChanged(window.auth, async (user) => {
                if (!user) {
                    localStorage.removeItem('currentUser');
                    manager.currentUser = null;
                    this.showLoginForm(manager);
                    return;
                }

                const email = user.email || '';
                const isAdmin = email === 'admin@fuelcards-system.com';
                const gadud = isAdmin ? 'admin' : getGadudFromEmail(email);
                if (!gadud) {
                    await window.signOut(window.auth);
                    localStorage.removeItem('currentUser');
                    manager.currentUser = null;
                    this.showLoginForm(manager);
                    return;
                }

                const userObj = {
                    name: email,
                    gadud,
                    isAdmin,
                    loginTime: new Date().toLocaleString('he-IL')
                };
                this.setCurrentUser(manager, userObj);
                this.showMainInterface(manager);
                setTimeout(() => manager.loadDataFromFirebase(), 100);
            });
        },

        async logout(manager) {
            try {
                if (window.auth && window.auth.currentUser && window.signOut) {
                    await window.signOut(window.auth);
                    console.log('✅ התנתקות מ-Firebase Authentication הצליחה');
                }
            } catch (error) {
                console.error('❌ שגיאה בהתנתקות מ-Firebase Authentication:', error);
            }

            localStorage.removeItem('currentUser');
            manager.currentUser = null;
            manager.clearBulkIssueState();
            this.showLoginForm(manager);
        },

        checkLogin(manager) {
            if (!manager.currentUser || !window.auth || !window.auth.currentUser) {
                this.showLoginForm(manager);
            } else {
                this.showMainInterface(manager);
            }
        },

        showLoginForm() {
            const splashScreen = document.getElementById('splashScreen');
            if (splashScreen) {
                splashScreen.classList.add('fade-out');
                setTimeout(() => {
                    splashScreen.style.display = 'none';
                }, 600);
            }

            const container = getContainer();
            if (container) container.style.display = 'none';

            const loginForm = document.getElementById('loginForm');
            if (loginForm) loginForm.style.display = 'block';
        },

        showMainInterface(manager) {
            const splashScreen = document.getElementById('splashScreen');
            if (splashScreen) {
                splashScreen.classList.add('fade-out');
                setTimeout(() => {
                    splashScreen.style.display = 'none';
                }, 600);
            }

            const loginForm = document.getElementById('loginForm');
            if (loginForm) loginForm.style.display = 'none';

            const container = getContainer();
            if (container) container.style.display = 'block';
            manager.updateInterfaceByPermissions();
        },

        async login(manager) {
            const name = document.getElementById('loginName').value.trim();
            const gadud = document.getElementById('loginGadud').value;
            if (!name || !gadud) {
                manager.showLoginStatus('יש למלא את כל השדות', 'error');
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
                manager.showLoginStatus('סיסמה סודית שגויה או גדוד לא מורשה', 'error');
                return;
            }

            try {
                if (!window.signInWithEmailAndPassword) {
                    manager.showLoginStatus('שגיאה: Firebase Auth לא זמין', 'error');
                    return;
                }
                await window.signInWithEmailAndPassword(window.auth, email, password);
                manager.showStatus('התחברות הצליחה', 'success');
            } catch (error) {
                console.error('❌ שגיאה בהתחברות:', error);
                manager.showLoginStatus('סיסמה סודית שגויה או גדוד לא מורשה', 'error');
            }
        }
    };
})();
