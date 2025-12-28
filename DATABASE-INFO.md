# 🗄️ מידע על מסד הנתונים

## מה זה בשורה 234?

```javascript
}  // סיום של פונקציית בדיקת אבטחה (validateSecurity)
```

זה **סיום של פונקציה** שבודקת אבטחה לפני שמירת נתונים. היא בודקת שאין נתונים חשודים או מזיקים.

---

## 📍 איפה המסד נתונים?

המסד נתונים נמצא **בענן של Google** - **Firebase Firestore**.

### פרטי המסד נתונים:
- **שם הפרויקט**: `fuel-cards-system`
- **סוג**: Firebase Firestore (NoSQL Database)
- **מיקום**: בענן של Google Cloud
- **אוסף (Collection)**: `fuelCards`

---

## 🔍 איך לגשת למסד הנתונים?

### דרך 1: Firebase Console (הכי קל)
1. היכנס ל: **https://console.firebase.google.com**
2. בחר את הפרויקט: **fuel-cards-system**
3. בתפריט השמאלי: **Firestore Database**
4. תראה את כל הכרטיסים ב-**Collection** בשם `fuelCards`

### דרך 2: דרך הקוד
הקוד משתמש במסד הנתונים כאן:
- **טעינת נתונים**: שורה 1043 - `loadDataFromFirebase()`
- **שמירת נתונים**: שורה 1077 - `saveDataToFirebase()`
- **הוספת כרטיס**: שורה 1089 - `firebaseAddDoc()`
- **מחיקת כרטיס**: שורה 1083 - `firebaseDeleteDoc()`

---

## 📊 איך המסד נתונים עובד?

### 1. מבנה הנתונים:
```
fuelCards (Collection)
  ├── document1 (כרטיס)
  │   ├── cardNumber: 12345
  │   ├── name: "יוסי כהן"
  │   ├── phone: "0501234567"
  │   ├── amount: 50
  │   ├── fuelType: "דיזל"
  │   ├── gadudNumber: "650"
  │   └── date: "2025-01-XX"
  ├── document2 (כרטיס)
  └── ...
```

### 2. פעולות:
- **הוספת כרטיס חדש** → נוצר מסמך חדש ב-`fuelCards`
- **עדכון כרטיס** → מעדכן מסמך קיים
- **החזרת כרטיס** → מעדכן את ה-`amount` ל-0
- **מחיקת כרטיס** → מוחק את המסמך

---

## 🔧 איפה בקוד משתמשים במסד הנתונים?

### 1. אתחול Firebase (index.html, שורות 984-1014):
```javascript
const firebaseConfig = {
    apiKey: "AIzaSyDmO6XVUQmoNb-LrNP8q78qTPKrZReAJ9U",
    authDomain: "fuel-cards-system.firebaseapp.com",
    projectId: "fuel-cards-system",
    // ...
};

const db = getFirestore(app);
```

### 2. טעינת נתונים (script.js, שורה 1043):
```javascript
async loadDataFromFirebase() {
    // קורא את כל הכרטיסים מ-Firebase
    const querySnapshot = await window.firebaseGetDocs(
        window.firebaseCollection(window.db, 'fuelCards')
    );
    // ...
}
```

### 3. שמירת נתונים (script.js, שורה 1077):
```javascript
async saveDataToFirebase() {
    // מוחק את כל הכרטיסים הישנים
    // ושומר את כל הכרטיסים החדשים
    await window.firebaseAddDoc(
        window.firebaseCollection(window.db, 'fuelCards'), 
        card
    );
}
```

### 4. הוספת כרטיס חדש (script.js, שורה 1089):
```javascript
// כשהוא מוסיף כרטיס חדש, הוא שומר אותו ל-Firebase
await window.firebaseAddDoc(
    window.firebaseCollection(window.db, 'fuelCards'), 
    card
);
```

---

## 🎯 איפה הנתונים בפועל?

הנתונים **לא נמצאים במחשב שלך** - הם **בענן**!

### מיקום פיזי:
- **שרתים של Google** ברחבי העולם
- **CDN** (Content Delivery Network) - מהיר מאוד
- **גיבויים אוטומטיים** - הנתונים בטוחים

### איך זה עובד:
1. אתה מוסיף כרטיס במחשב שלך
2. הקוד שולח את הנתונים ל-Firebase בענן
3. Firebase שומר את הנתונים
4. כל מי שפותח את האתר רואה את הנתונים המעודכנים

---

## 🔐 אבטחה

המסד נתונים מוגן על ידי:
1. **Firebase Security Rules** - קובעים מי יכול לקרוא/לכתוב
2. **API Keys** - מפתחות אבטחה
3. **Authentication** - מערכת התחברות (אם מופעלת)

---

## 📱 איך לראות את הנתונים?

### דרך 1: דרך האתר
- פתח את האתר
- תראה את כל הכרטיסים בטבלה

### דרך 2: דרך Firebase Console
1. **https://console.firebase.google.com**
2. בחר פרויקט: **fuel-cards-system**
3. **Firestore Database**
4. לחץ על **fuelCards** Collection
5. תראה את כל הכרטיסים!

---

## 🛠️ איך לשנות/לעדכן נתונים?

### דרך האתר:
- לחץ על כרטיס בטבלה
- ערוך את הנתונים
- לחץ שמירה

### דרך Firebase Console:
1. פתח את הכרטיס
2. לחץ על העריכה (Edit)
3. שנה את הנתונים
4. שמור

---

## ❓ שאלות נפוצות

### Q: האם הנתונים נשמרים גם במחשב שלי?
**A:** לא, רק בענן. אבל יש גם גיבוי ב-`localStorage` של הדפדפן (אם Firebase לא עובד).

### Q: האם הנתונים בטוחים?
**A:** כן! Firebase מספקים:
- גיבויים אוטומטיים
- אבטחה ברמה גבוהה
- שרתים של Google

### Q: כמה זה עולה?
**A:** **חינמי** לחלוטין! Firebase נותן:
- 1GB אחסון (חינמי)
- 50,000 קריאות/יום (חינמי)
- 20,000 כתיבות/יום (חינמי)

### Q: איך אני יודע אם המסד נתונים עובד?
**A:** 
- פתח את הקונסול בדפדפן (F12)
- חפש הודעות כמו: "טוען נתונים מ-Firebase..."
- אם אין שגיאות - זה עובד! ✅

---

## 🔗 קישורים שימושיים

- **Firebase Console**: https://console.firebase.google.com
- **Firestore Documentation**: https://firebase.google.com/docs/firestore
- **Firebase Pricing**: https://firebase.google.com/pricing

---

**הערה**: כל הנתונים שלך נמצאים ב-Firebase של Google, מוגנים ובטוחים! 🔒














