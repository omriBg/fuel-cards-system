

(async () => {
  const cardNumbers = [2600233, 636832254, 836831256];
  if (!window.db || !window.firebaseGetDocs || !window.firebaseDeleteDoc || !window.firebaseDoc || !window.firebaseQuery || !window.firebaseWhere || !window.firebaseCollection) {
    console.error('Firebase לא זמין. וודא שאתה בדף האתר והתחברת.');
    return;
  }
  const q = window.firebaseQuery(
    window.firebaseCollection(window.db, 'fuelCards'),
    window.firebaseWhere('cardNumber', 'in', cardNumbers)
  );
  const snap = await window.firebaseGetDocs(q);
  for (const doc of snap.docs) {
    await window.firebaseDeleteDoc(window.firebaseDoc(window.db, 'fuelCards', doc.id));
    console.log('נמחק כרטיס:', doc.data().cardNumber);
  }
  console.log('סיימתי. נמחקו', snap.docs.length, 'כרטיסים מהמסד.');
  if (window.fuelCardManager && typeof window.fuelCardManager.loadDataFromFirebase === 'function') {
    await window.fuelCardManager.loadDataFromFirebase();
    console.log('טעינת הרשימה מחדש הושלמה.');
  }
})();
