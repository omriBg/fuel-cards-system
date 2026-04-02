// Cell/UI formatting helpers used by FuelCardManager.
// No DOM access besides using provided values; can safely be reused/tested.
(function () {
    'use strict';

    window.FuelCardsCellsUI = window.FuelCardsCellsUI || {};

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/`/g, '&#96;')
            .replace(/=/g, '&#61;')
            .replace(/\//g, '&#47;');
    }

    function getStatusText(status) {
        if (status === undefined || status === null) {
            return '';
        }
        switch (status) {
            case 'new':
                return 'חדש';
            case 'updated':
                return 'עודכן';
            case 'returned':
                return 'הוחזר';
            default:
                return status || '';
        }
    }

    function getCardChainText(cardChain) {
        if (!cardChain || cardChain.length === 0) return 'אין היסטוריה';

        // cardChain is rendered as HTML by the table (uses `<br>`),
        // so we escape each text piece to avoid XSS.
        return cardChain.map(link => {
            const action = escapeHtml(link.action);
            const amount = escapeHtml(link.amount);
            const date = escapeHtml(link.date);
            return `${action}: ${amount} ליטר (${date})`;
        }).join('<br>');
    }

    function getRemainingFuelValue(card) {
        if (!card) return null;
        const value = (card.remainingFuel !== undefined && card.remainingFuel !== null)
            ? card.remainingFuel
            : card.amount;

        const n = Number(value);
        if (!Number.isFinite(n)) return null;
        return n;
    }

    function getCellValue(card, column) {
        if (!card || !column) return '';

        const cleanValue = (value) => {
            if (value === undefined || value === null) return '';
            return value;
        };

        switch (column.id) {
            case 'cardNumber':
                return cleanValue(card.cardNumber);
            case 'name':
                return cleanValue(card.name);
            case 'phone':
                return cleanValue(card.phone);
            case 'amount':
                return cleanValue(card.amount);
            case 'fuelType':
                return cleanValue(card.fuelType);
            case 'gadudNumber':
                return cleanValue(card.gadudNumber);
            case 'status':
                return getStatusText(card.status || '');
            case 'issueDate':
                return cleanValue(card.issueDate || card.date);
            case 'creditDate':
                return cleanValue(card.creditDate);
            case 'gadudIssueDate':
                return cleanValue(card.gadudIssueDate);
            case 'gadudCreditDate':
                return cleanValue(card.gadudCreditDate);
            case 'currentHolder':
                return cleanValue(card.currentHolderName) || 'לא זמין';
            case 'cardChain':
                return getCardChainText(card.cardChain);
            case 'gadudName':
                return cleanValue(card.gadudName);
            case 'gadudVehicleNumber':
                return cleanValue(card.gadudVehicleNumber);
            case 'remainingFuel':
                return (card.remainingFuel !== undefined && card.remainingFuel !== null)
                    ? card.remainingFuel
                    : cleanValue(card.amount);
            default:
                // Custom columns
                return cleanValue(card[column.id]);
        }
    }

    window.FuelCardsCellsUI.escapeHtml = escapeHtml;
    window.FuelCardsCellsUI.getStatusText = getStatusText;
    window.FuelCardsCellsUI.getCardChainText = getCardChainText;
    window.FuelCardsCellsUI.getRemainingFuelValue = getRemainingFuelValue;
    window.FuelCardsCellsUI.getCellValue = getCellValue;
})();

