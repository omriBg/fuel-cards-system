// Firebase Configuration
// המפתחות שלך מ-Firebase Console

const firebaseConfig = {
    apiKey: "AIzaSyDmO6XVUQmoNb-LrNP8q78qTPKrZReAJ9U",
    authDomain: "fuel-cards-system.firebaseapp.com",
    projectId: "fuel-cards-system",
    storageBucket: "fuel-cards-system.firebasestorage.app",
    messagingSenderId: "586818138233",
    appId: "1:586818138233:web:2fe1beba05a9687d1564a8",
    measurementId: "G-YZDDD2T89J"
};

// Initialize Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Export for use in main script
window.db = db;
window.firebaseCollection = collection;
window.firebaseAddDoc = addDoc;
window.firebaseGetDocs = getDocs;
window.firebaseUpdateDoc = updateDoc;
window.firebaseDeleteDoc = deleteDoc;
window.firebaseDoc = doc;
window.firebaseQuery = query;
window.firebaseWhere = where;
window.firebaseOrderBy = orderBy;