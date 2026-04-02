const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// הערה: כרגע הערכים כאן בקוד ה-Backend (לא ב-Client).
// מומלץ להעביר ל-Secret Manager/Functions config לפני שימוש בפרודקשן אמיתי.
const GADUD_PASSWORDS = {
  '650': '9526',
  '703': 'Zt7$Qp!9',
  '651': 'Lm3@Rg#5',
  '791': 'Vy8%Tc^2',
  '652': 'Hd4&Ns*7',
  '638': 'Pf1)Wb=6',
  '653': 'Qk5+Xe?8',
  '674': 'Jr9!Lu$4'
};

const ADMIN_PASSWORD = '9526';

// Callable: verifies "loginName" (password) + "loginGadud"
// and returns a Custom Token with claims:
// - token.admin: boolean
// - token.gadudNumber: string
exports.verifyGadudPassword = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated (anonymous is fine).');
  }

  const gadud = String(data?.gadud || '').trim();
  // בקוד הלקוח "name" הוא בפועל הסיסמה (ולא שם תצוגה).
  const password = String(data?.name || data?.password || '').trim();

  if (!gadud || !password) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing gadud or password.');
  }

  let isAdmin = false;
  let gadudNumber = '';

  // מנהל מערכת: בלקוח זה נשלח כאשר gadud === "admin" (או "מנהל מערכת")
  if (gadud === 'admin' || gadud === 'מנהל מערכת') {
    if (password !== ADMIN_PASSWORD) {
      throw new functions.https.HttpsError('permission-denied', 'Invalid admin credentials.');
    }
    isAdmin = true;
    gadudNumber = 'admin';
  } else {
    if (!Object.prototype.hasOwnProperty.call(GADUD_PASSWORDS, gadud)) {
      throw new functions.https.HttpsError('permission-denied', 'Invalid gadud.');
    }
    if (GADUD_PASSWORDS[gadud] !== password) {
      throw new functions.https.HttpsError('permission-denied', 'Invalid gadud password.');
    }
    isAdmin = false;
    gadudNumber = gadud;
  }

  const uid = context.auth.uid;
  const customClaims = {
    admin: isAdmin,
    gadudNumber: gadudNumber
  };

  const customToken = await admin.auth().createCustomToken(uid, customClaims);

  // user object לצורך ה-UI בלבד (localStorage).
  // שמים שם=הסיסמה שהוזנה כמו שהאפליקציה עושה כיום.
  return {
    customToken,
    user: {
      name: password,
      gadud: gadudNumber,
      isAdmin
    }
  };
});

