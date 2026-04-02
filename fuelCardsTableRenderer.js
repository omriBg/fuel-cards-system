// Table rendering helpers for fuel cards.
// Keeps `FuelCardManager` smaller by moving row class + cell HTML building out.
(function () {
    'use strict';

    window.FuelCardsTableRenderer = window.FuelCardsTableRenderer || {};

    window.FuelCardsTableRenderer.getRowClasses = function (card) {
        const classes = [];
        if (card && card.gadudName) {
            classes.push('row-gadud');
        } else if (card && card.status === 'new') {
            classes.push('row-new');
        } else if (card && (card.status === 'returned' || card.status === 'final_return')) {
            classes.push('row-returned');
        }
        return classes;
    };

    window.FuelCardsTableRenderer.buildRowContent = function (params) {
        const card = params && params.card;
        const tableColumns = params && Array.isArray(params.tableColumns) ? params.tableColumns : [];
        const canViewColumn = params && typeof params.canViewColumn === 'function' ? params.canViewColumn : (() => true);
        const getCellValue = params && typeof params.getCellValue === 'function' ? params.getCellValue : (() => '');
        const escapeHtml = params && typeof params.escapeHtml === 'function' ? params.escapeHtml : ((v) => String(v));

        let rowContent = '';
        let hasAnyContent = false;

        tableColumns.forEach(column => {
            if (!canViewColumn(column)) return;

            let cellValue = getCellValue(card, column);
            if (cellValue === undefined || cellValue === null) {
                cellValue = '';
            }

            cellValue = String(cellValue);

            const safeCellValue = column.id === 'cardChain'
                ? cellValue
                : escapeHtml(cellValue);

            if (cellValue.trim() !== '') {
                hasAnyContent = true;
            }

            if (column.id === 'remainingFuel') {
                const cardNumberRaw = card ? card.cardNumber : null;
                const cardNumberNum = typeof cardNumberRaw === 'string'
                    ? parseInt(cardNumberRaw, 10)
                    : Number(cardNumberRaw);
                const safeCardNumber = Number.isFinite(cardNumberNum) ? String(cardNumberNum) : '';

                const isClickable = !!card.gadudName && safeCardNumber !== '';
                const clickableClass = isClickable ? 'clickable-remaining-fuel' : '';
                const cursorStyle = isClickable ? 'cursor: pointer;' : '';
                const title = isClickable ? 'לחץ לזיכוי גדודי (איפוס ל-0)' : '';

                const actionAttrs = isClickable
                    ? `data-action="showGadudCreditConfirmation" data-card-number="${safeCardNumber}"`
                    : '';

                rowContent += `<td class="${clickableClass}" style="${cursorStyle}" title="${title}" ${actionAttrs}>${safeCellValue}</td>`;
            } else {
                rowContent += `<td>${safeCellValue}</td>`;
            }
        });

        return { rowContent, hasAnyContent };
    };
})();

