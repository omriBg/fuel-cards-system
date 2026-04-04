// Firestore data-access layer for fuel cards.
// Must be loaded before `script-firebase.js`.
(function () {
    'use strict';

    window.FuelCardsService = window.FuelCardsService || {};

    function assertFirebaseReady() {
        if (!window.db) throw new Error('Firebase not initialized (window.db missing).');
        if (!window.firebaseCollection || !window.firebaseGetDocs || !window.firebaseAddDoc || !window.firebaseUpdateDoc || !window.firebaseDeleteDoc) {
            throw new Error('Firebase SDK not ready (missing window.firebase* exports).');
        }
    }

    function getFuelCardsCollection() {
        return window.firebaseCollection(window.db, 'fuelCards');
    }

    window.FuelCardsService.getAllFuelCards = async function () {
        assertFirebaseReady();
        const querySnapshot = await window.firebaseGetDocs(getFuelCardsCollection());
        const cards = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data() || {};
            data.id = doc.id; // expose document id to caller
            cards.push(data);
        });
        return cards;
    };

    window.FuelCardsService.getFuelCardsForUser = async function (user) {
        assertFirebaseReady();
        const isAdmin = !!(user && user.isAdmin);
        const userGadud = user && user.gadud ? String(user.gadud) : '';
        const collectionRef = getFuelCardsCollection();
        const docsQuery = (!isAdmin && userGadud && window.firebaseQuery && window.firebaseWhere)
            ? window.firebaseQuery(collectionRef, window.firebaseWhere('gadudNumber', '==', userGadud))
            : collectionRef;
        const querySnapshot = await window.firebaseGetDocs(docsQuery);
        const cards = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data() || {};
            data.id = doc.id;
            cards.push(data);
        });
        return cards;
    };

    window.FuelCardsService.addCard = async function (card) {
        assertFirebaseReady();
        if (!card) throw new Error('card missing');

        const docRef = await window.firebaseAddDoc(getFuelCardsCollection(), card);
        card.id = docRef.id;
        return docRef.id;
    };

    window.FuelCardsService.updateCard = async function (card) {
        assertFirebaseReady();
        if (!card) throw new Error('card missing');

        if (!card.id) {
            if (!window.firebaseQuery || !window.firebaseWhere || !window.firebaseGetDocs) {
                throw new Error('Firebase query helpers not ready.');
            }

            const querySnapshot = await window.firebaseGetDocs(
                window.firebaseQuery(
                    getFuelCardsCollection(),
                    window.firebaseWhere('cardNumber', '==', card.cardNumber)
                )
            );

            if (querySnapshot.empty) {
                throw new Error('כרטיס לא נמצא ב-Firebase');
            }

            card.id = querySnapshot.docs[0].id;
        }

        const cardRef = window.firebaseDoc(window.db, 'fuelCards', card.id);
        const { id, ...cardData } = card;
        await window.firebaseUpdateDoc(cardRef, cardData);
        return card.id;
    };

    window.FuelCardsService.deleteCard = async function (cardId) {
        assertFirebaseReady();
        if (!cardId) throw new Error('cardId חסר');
        const cardRef = window.firebaseDoc(window.db, 'fuelCards', cardId);
        await window.firebaseDeleteDoc(cardRef);
    };

    
   
})();

