// Pure-ish selection logic for fuel cards:
// filtering by status/gadud/fuelType/date, search, and sorting.
// No DOM access here; the manager passes values + helpers.
(function () {
    'use strict';

    window.CardsSelectors = window.CardsSelectors || {};

    function normalizeString(value) {
        if (value === undefined || value === null) return '';
        return value.toString().trim();
    }

    function safeLower(value) {
        const s = normalizeString(value);
        return s.toLowerCase();
    }

    function sortCards(cards, sortOption, helpers) {
        const compareDates = helpers && helpers.compareDates ? helpers.compareDates : null;

        const sortedCards = [...cards];
        sortedCards.sort((a, b) => {
            switch (sortOption) {
                case 'date_asc':
                    return compareDates(a.issueDate || a.date || '', b.issueDate || b.date || '');
                case 'date_desc':
                    return compareDates(b.issueDate || b.date || '', a.issueDate || a.date || '');
                case 'credit_date_asc':
                    return compareDates(a.creditDate || '', b.creditDate || '');
                case 'credit_date_desc':
                    return compareDates(b.creditDate || '', a.creditDate || '');
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

    function filterAndSearchCards(cards, params, helpers) {
        const isValidCard = helpers && helpers.isValidCard ? helpers.isValidCard : (() => true);
        const getRemainingFuelValue = helpers && helpers.getRemainingFuelValue ? helpers.getRemainingFuelValue : (() => null);
        const parseDateString = helpers && helpers.parseDateString ? helpers.parseDateString : (() => null);

        let result = cards.filter(card => isValidCard(card));

        // Status filtering
        if (params.statusFilterValue && params.statusFilterValue !== 'all') {
            if (params.statusFilterValue === 'returned') {
                result = result.filter(card => card.status === 'returned' || card.status === 'final_return');
            } else if (params.statusFilterValue === 'not_returned') {
                result = result.filter(card => card.status !== 'returned' && card.status !== 'final_return');
            } else if (params.statusFilterValue === 'gadud_credited') {
                result = result.filter(card => {
                    const remaining = getRemainingFuelValue(card);
                    return remaining !== null && remaining === 0;
                });
            } else if (params.statusFilterValue === 'gadud_not_credited') {
                result = result.filter(card => {
                    const remaining = getRemainingFuelValue(card);
                    return remaining !== null && remaining !== 0;
                });
            }
        }

        // Gadud filtering
        if (params.gadudFilterValue && params.gadudFilterValue !== 'all') {
            if (params.gadudFilterValue === 'no_gadud') {
                result = result.filter(card => !card.gadudNumber || card.gadudNumber === '');
            } else {
                result = result.filter(card => card.gadudNumber === params.gadudFilterValue);
            }
        }

        // Fuel type filtering
        if (params.fuelTypeFilterValue && params.fuelTypeFilterValue !== 'all') {
            const wantedFuel = params.fuelTypeFilterValue;
            result = result.filter(card => {
                const fuel = normalizeString(card.fuelType);
                return fuel === wantedFuel;
            });
        }

        // Date filtering (year/month)
        const filterByYear = params.yearFilterValue && params.yearFilterValue !== 'all';
        const filterByMonth = params.monthFilterValue && params.monthFilterValue !== 'all';
        if (filterByYear || filterByMonth) {
            result = result.filter(card => {
                const dateStr = card.issueDate || card.date || card.creditDate;
                const d = parseDateString(dateStr);
                if (!d) return false;
                const year = d.getFullYear().toString();
                const month = (d.getMonth() + 1).toString(); // 1-12
                if (filterByYear && params.yearFilterValue !== year) return false;
                if (filterByMonth && params.monthFilterValue !== month) return false;
                return true;
            });
        }

        // Search
        if (params.searchTerm) {
            const term = safeLower(params.searchTerm);
            if (term) {
                result = result.filter(card => {
                    const cardNumber = safeLower(card.cardNumber);
                    const name = safeLower(card.name);
                    const phone = safeLower(card.phone);
                    return cardNumber.includes(term) || name.includes(term) || phone.includes(term);
                });
            }
        }

        // Sorting
        if (params.sortByValue && params.sortByValue !== 'none') {
            return sortCards(result, params.sortByValue, {
                compareDates: helpers && helpers.compareDates ? helpers.compareDates : (() => 0)
            });
        }

        return result;
    }

    window.CardsSelectors.filterAndSearchCards = filterAndSearchCards;
})();

