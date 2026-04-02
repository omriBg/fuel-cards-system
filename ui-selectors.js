// UI-only helpers for fuel type / amount selector buttons.
// These functions are referenced from `index.html` via inline onclick handlers.

window.selectFuelType = function (inputId, value, button) {
    try {
        const selector = button ? button.closest('[data-fuel-selector]') : document.querySelector(`[data-fuel-selector="${inputId}"]`);
        const input = document.getElementById(inputId);
        if (!selector || !input) {
            return;
        }

        const buttons = selector.querySelectorAll('[data-fuel-value]');
        buttons.forEach(btn => btn.classList.remove('active'));
        if (button) {
            button.classList.add('active');
        } else {
            const targetButton = selector.querySelector(`[data-fuel-value="${value}"]`);
            if (targetButton) {
                targetButton.classList.add('active');
            }
        }

        const customWrapper = selector.querySelector('.fuel-type-custom');
        if (value === 'other') {
            if (customWrapper) {
                customWrapper.classList.add('visible');
                input.value = '';
                input.focus();
            }
        } else {
            if (customWrapper) {
                customWrapper.classList.remove('visible');
            }
            input.value = value;
        }
    } catch (error) {
        console.error('שגיאה בבחירת סוג דלק:', error);
    }
};

window.handleCustomFuelInput = function (inputId) {
    try {
        const selector = document.querySelector(`[data-fuel-selector="${inputId}"]`);
        if (!selector) {
            return;
        }
        const buttons = selector.querySelectorAll('[data-fuel-value]');
        const otherButton = selector.querySelector('[data-fuel-value="other"]');
        buttons.forEach(btn => btn.classList.remove('active'));
        if (otherButton) {
            otherButton.classList.add('active');
        }
    } catch (error) {
        console.error('שגיאה בעדכון סוג דלק מותאם:', error);
    }
};

window.resetFuelTypeSelector = function (inputId) {
    try {
        const selector = document.querySelector(`[data-fuel-selector="${inputId}"]`);
        const input = document.getElementById(inputId);
        if (!selector || !input) {
            return;
        }

        selector.querySelectorAll('[data-fuel-value]').forEach(btn => btn.classList.remove('active'));
        const customWrapper = selector.querySelector('.fuel-type-custom');
        if (customWrapper) {
            customWrapper.classList.remove('visible');
        }
        input.value = '';
    } catch (error) {
        console.error('שגיאה באיפוס בורר דלק:', error);
    }
};

window.selectAmount = function (inputId, value, button) {
    try {
        const selector = button ? button.closest('[data-amount-selector]') : document.querySelector(`[data-amount-selector="${inputId}"]`);
        const input = document.getElementById(inputId);
        if (!selector || !input) {
            return;
        }

        const buttons = selector.querySelectorAll('[data-amount-value]');
        buttons.forEach(btn => btn.classList.remove('active'));
        if (button) {
            button.classList.add('active');
        } else {
            const targetButton = selector.querySelector(`[data-amount-value="${value}"]`);
            if (targetButton) {
                targetButton.classList.add('active');
            }
        }

        const customWrapper = selector.querySelector('.amount-custom');
        if (value === 'other') {
            if (customWrapper) {
                customWrapper.classList.add('visible');
                input.value = '';
                input.focus();
            }
        } else {
            if (customWrapper) {
                customWrapper.classList.remove('visible');
            }
            input.value = value;
        }
    } catch (error) {
        console.error('שגיאה בבחירת כמות דלק:', error);
    }
};

window.handleCustomAmountInput = function (inputId) {
    try {
        const selector = document.querySelector(`[data-amount-selector="${inputId}"]`);
        if (!selector) {
            return;
        }

        const buttons = selector.querySelectorAll('[data-amount-value]');
        const otherButton = selector.querySelector('[data-amount-value="other"]');
        buttons.forEach(btn => btn.classList.remove('active'));
        if (otherButton) {
            otherButton.classList.add('active');
        }
    } catch (error) {
        console.error('שגיאה בעדכון כמות מותאמת:', error);
    }
};

window.resetAmountSelector = function (inputId) {
    try {
        const selector = document.querySelector(`[data-amount-selector="${inputId}"]`);
        const input = document.getElementById(inputId);
        if (!selector || !input) {
            return;
        }

        selector.querySelectorAll('[data-amount-value]').forEach(btn => btn.classList.remove('active'));
        const customWrapper = selector.querySelector('.amount-custom');
        if (customWrapper) {
            customWrapper.classList.remove('visible');
        }
        input.value = '';
    } catch (error) {
        console.error('שגיאה באיפוס בורר כמות:', error);
    }
};

