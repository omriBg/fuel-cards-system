// UI helpers for fuel cards table header/stats.
// Loaded before `script-firebase.js`.
(function () {
    'use strict';

    window.FuelCardsTableUI = window.FuelCardsTableUI || {};

    window.FuelCardsTableUI.updateFilteredCardsCount = function (params) {
        const filteredCards = params && params.filteredCards ? params.filteredCards : [];
        const totalCards = params && Number.isFinite(params.totalCards) ? params.totalCards : 0;
        const isAdmin = !!(params && params.isAdmin);

        const countElement = document.getElementById('filteredCardsCount');
        if (!countElement) return;

        const filteredCount = filteredCards.length;

        if (isAdmin) {
            if (filteredCount === totalCards) {
                countElement.textContent = `סה"כ כרטיסים: ${totalCards}`;
            } else {
                countElement.textContent = `מוצגים ${filteredCount} מתוך ${totalCards} כרטיסים`;
            }
        } else {
            countElement.textContent = '';
        }
    };

    window.FuelCardsTableUI.updateStats = function (params) {
        const cards = params && Array.isArray(params.cards) ? params.cards : [];

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
    };

    window.FuelCardsTableUI.updateTableHeaders = function (params) {
        const tableColumns = params && Array.isArray(params.tableColumns) ? params.tableColumns : [];
        const canViewColumn = params && typeof params.canViewColumn === 'function' ? params.canViewColumn : (() => true);

        const thead = document.querySelector('#fuelCardsTable thead tr');
        if (!thead) return;

        thead.innerHTML = '';

        tableColumns.forEach(column => {
            if (canViewColumn(column)) {
                const th = document.createElement('th');
                th.textContent = column.name;
                thead.appendChild(th);
            }
        });
    };
})();

