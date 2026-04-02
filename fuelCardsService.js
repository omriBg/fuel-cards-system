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

    // Adds a new card document and updates the passed object with `card.id`.
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

    window.FuelCardsService.deleteAllFuelCards = async function () {
        assertFirebaseReady();
        const querySnapshot = await window.firebaseGetDocs(getFuelCardsCollection());
        const deletePromises = querySnapshot.docs.map((doc) => window.firebaseDeleteDoc(window.firebaseDoc(window.db, 'fuelCards', doc.id)));
        await Promise.all(deletePromises);
    };

    // Deprecated: backfill all cards by deleting then inserting.
    window.FuelCardsService.saveDataToFirebase = async function (cards) {
        assertFirebaseReady();
        if (!Array.isArray(cards)) throw new Error('cards must be an array');

        const querySnapshot = await window.firebaseGetDocs(getFuelCardsCollection());
        const deletePromises = querySnapshot.docs.map((doc) => window.firebaseDeleteDoc(window.firebaseDoc(window.db, 'fuelCards', doc.id)));
        await Promise.all(deletePromises);

        const addPromises = cards.map((card) => window.firebaseAddDoc(getFuelCardsCollection(), card));
        await Promise.all(addPromises);
    };
})();

