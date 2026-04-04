(function () {
    'use strict';

    function getContainer() {
        return document.querySelector('.container') || document.getElementById('mainContainer');
    }

    window.FuelCardEditFlow = {
        showEditCardForm(manager) {
            if (!manager.currentUser || !manager.currentUser.isAdmin) {
                manager.showStatus('אין לך הרשאה לערוך כרטיסים', 'error');
                return;
            }
            this.showEditCardPasswordDialog(manager);
        },

        showEditCardPasswordDialog(manager) {
            const container = getContainer();
            if (container) container.style.display = 'none';

            let passwordDialog = document.getElementById('editCardPasswordDialog');
            if (!passwordDialog) {
                passwordDialog = this.createEditCardPasswordDialog();
                document.body.appendChild(passwordDialog);
            }

            passwordDialog.style.display = 'block';
            const pwdBackdrop = passwordDialog.querySelector('div[style*="position: fixed"]');
            if (pwdBackdrop) pwdBackdrop.style.display = 'flex';

            const passwordInput = document.getElementById('editCardPassword');
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.focus();
            }

            this.bindEditCardPasswordDialogEvents(manager, passwordDialog);
        },

        bindEditCardPasswordDialogEvents(manager, dialog) {
            if (!dialog) return;
            if (dialog.dataset.actionsBound === 'true') return;

            const confirmBtn = dialog.querySelector('[data-dialog-action="verifyEditCardPassword"]');
            const cancelBtn = dialog.querySelector('[data-dialog-action="cancelEditCardPassword"]');
            const passwordInput = dialog.querySelector('#editCardPassword');

            if (confirmBtn) {
                confirmBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.verifyEditCardPassword(manager);
                });
            }

            if (cancelBtn) {
                cancelBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.cancelEditCardPassword();
                });
            }

            if (passwordInput) {
                passwordInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.verifyEditCardPassword(manager);
                    }
                });
            }

            dialog.dataset.actionsBound = 'true';
        },

        createEditCardPasswordDialog() {
            const factory = window.FuelCardDialogs && window.FuelCardDialogs.createEditCardPasswordDialog;
            if (factory) return factory();

            const dialog = document.createElement('div');
            dialog.id = 'editCardPasswordDialog';
            dialog.innerHTML = '<div style="padding:20px; direction: rtl;">לא ניתן לטעון את חלון אימות הסיסמה.</div>';
            return dialog;
        },

        async verifyEditCardPassword(manager) {
            if (manager._verifyingEditPassword) return;
            manager._verifyingEditPassword = true;

            try {
                const passwordInput = document.getElementById('editCardPassword');
                const statusDiv = document.getElementById('editCardPasswordStatus');

                if (!passwordInput) {
                    return;
                }

                const password = passwordInput.value.trim();
                const userEmail = manager.currentUser && manager.currentUser.name ? String(manager.currentUser.name) : '';
                if (!manager.currentUser || !manager.currentUser.isAdmin) {
                    if (statusDiv) {
                        manager.setInlineStatus(statusDiv, 'אין לך הרשאה לערוך כרטיסים', 'error');
                    }
                    passwordInput.value = '';
                    passwordInput.focus();
                    return;
                }

                try {
                    if (!window.reauthenticateWithCredential || !window.EmailAuthProvider || !window.auth || !window.auth.currentUser) {
                        throw new Error('Firebase Auth לא זמין');
                    }

                    const credential = window.EmailAuthProvider.credential(userEmail, password);
                    await window.reauthenticateWithCredential(window.auth.currentUser, credential);
                } catch (error) {
                    console.error('שגיאה באימות סיסמה לעריכת כרטיס:', error);
                    if (statusDiv) {
                        manager.setInlineStatus(statusDiv, 'סיסמה שגויה', 'error');
                    }
                    passwordInput.value = '';
                    passwordInput.focus();
                    return;
                }

                const passwordDialog = document.getElementById('editCardPasswordDialog');
                if (passwordDialog) passwordDialog.style.display = 'none';

                try {
                    this.showEditCardFormDialog(manager);
                } catch (err) {
                    console.error('שגיאה בפתיחת טופס עריכה:', err);
                    const container = getContainer();
                    if (container) container.style.display = 'block';
                    manager.showStatus('שגיאה בפתיחת טופס עריכה. נסה לרענן את הדף.', 'error');
                }
            } finally {
                manager._verifyingEditPassword = false;
            }
        },

        cancelEditCardPassword() {
            const passwordDialog = document.getElementById('editCardPasswordDialog');
            if (passwordDialog) passwordDialog.style.display = 'none';
            const container = getContainer();
            if (container) container.style.display = 'block';
        },

        showEditCardFormDialog(manager) {
            const container = getContainer();
            let editForm = document.getElementById('editCardFormDialog');
            if (!editForm) {
                editForm = this.createEditCardFormDialog();
                document.body.appendChild(editForm);
            }

            this.clearEditCardForm(manager);
            editForm.style.display = 'block';
            const backdrop = editForm.querySelector('div[style*="position: fixed"]');
            if (backdrop) backdrop.style.display = 'flex';
            if (container) container.style.display = 'none';

            this.bindEditCardFormDialogEvents(manager, editForm);
        },

        bindEditCardFormDialogEvents(manager, dialog) {
            if (!dialog) return;
            if (dialog.dataset.actionsBound === 'true') return;

            const searchInput = dialog.querySelector('#editCardSearchNumber');
            const searchBtn = dialog.querySelector('[data-dialog-action="searchCardForEdit"]');
            const submitBtn = dialog.querySelector('[data-dialog-action="submitEditCard"]');
            const cancelBtn = dialog.querySelector('[data-dialog-action="cancelEditCard"]');

            if (searchBtn) searchBtn.addEventListener('click', (e) => { e.preventDefault(); this.searchCardForEdit(manager); });
            if (searchInput) searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.searchCardForEdit(manager); } });
            if (submitBtn) submitBtn.addEventListener('click', (e) => { e.preventDefault(); this.submitEditCard(manager); });
            if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); this.cancelEditCard(manager); });

            const fuelSelector = dialog.querySelector('[data-fuel-selector]');
            if (fuelSelector && fuelSelector.dataset && fuelSelector.dataset.fuelSelector) {
                const inputId = fuelSelector.dataset.fuelSelector;
                const fuelButtons = fuelSelector.querySelectorAll('[data-fuel-value]');
                fuelButtons.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        if (window.selectFuelType) window.selectFuelType(inputId, btn.dataset ? btn.dataset.fuelValue : undefined, btn);
                    });
                });
                const customInput = dialog.querySelector(`#${inputId}`);
                if (customInput) {
                    customInput.addEventListener('input', () => {
                        if (window.handleCustomFuelInput) window.handleCustomFuelInput(inputId);
                    });
                }
            }

            dialog.dataset.actionsBound = 'true';
        },

        createEditCardFormDialog() {
            const factory = window.FuelCardDialogs && window.FuelCardDialogs.createEditCardFormDialog;
            if (factory) return factory();
            const dialog = document.createElement('div');
            dialog.id = 'editCardFormDialog';
            dialog.innerHTML = '<div style="padding:20px; direction: rtl;">לא ניתן לטעון את טופס עריכת הכרטיס.</div>';
            return dialog;
        },

        searchCardForEdit(manager) {
            const searchInput = document.getElementById('editCardSearchNumber');
            const formFields = document.getElementById('editCardFormFields');
            const statusDiv = document.getElementById('editCardStatus');
            if (!searchInput || !formFields) return;

            const cardNumber = parseInt(searchInput.value.trim(), 10);
            if (!cardNumber) {
                if (statusDiv) manager.setInlineStatus(statusDiv, 'יש להכניס מספר כרטיס', 'error');
                return;
            }

            const card = manager.fuelCards.find(c => c.cardNumber === cardNumber);
            if (!card) {
                if (statusDiv) manager.setInlineStatus(statusDiv, 'כרטיס לא נמצא במערכת', 'error');
                formFields.style.display = 'none';
                return;
            }

            const cardNumberInput = document.getElementById('editCardNumber');
            const nameInput = document.getElementById('editName');
            const phoneInput = document.getElementById('editPhone');
            const fuelTypeInput = document.getElementById('editFuelType');
            const gadudSelect = document.getElementById('editGadudNumber');

            if (cardNumberInput) cardNumberInput.value = card.cardNumber || '';
            if (nameInput) nameInput.value = card.name || '';
            if (phoneInput) phoneInput.value = card.phone || '';
            if (fuelTypeInput) {
                fuelTypeInput.value = card.fuelType || '';
                if (card.fuelType) {
                    const fuelType = card.fuelType.trim();
                    if (window.selectFuelType) window.selectFuelType('editFuelType', ['בנזין', 'סולר', 'אוריאה'].includes(fuelType) ? fuelType : 'other');
                }
            }
            if (gadudSelect) gadudSelect.value = card.gadudNumber || '';

            formFields.setAttribute('data-original-card-number', cardNumber);
            formFields.style.display = 'block';
            if (statusDiv) manager.setInlineStatus(statusDiv, 'כרטיס נמצא - ניתן לערוך', 'success');
        },

        async submitEditCard(manager) {
            const formFields = document.getElementById('editCardFormFields');
            const statusDiv = document.getElementById('editCardStatus');
            if (!formFields || formFields.style.display === 'none') {
                if (statusDiv) manager.setInlineStatus(statusDiv, 'יש לחפש כרטיס קודם', 'error');
                return;
            }

            const originalCardNumber = parseInt(formFields.getAttribute('data-original-card-number'), 10);
            const newCardNumber = parseInt(document.getElementById('editCardNumber').value, 10);
            const name = document.getElementById('editName').value.trim();
            const phone = document.getElementById('editPhone').value.trim();
            const fuelType = document.getElementById('editFuelType').value.trim();
            const gadudNumber = document.getElementById('editGadudNumber').value;

            if (!newCardNumber || !fuelType) {
                if (statusDiv) manager.setInlineStatus(statusDiv, 'יש למלא מספר כרטיס וסוג דלק', 'error');
                return;
            }

            const cardIndex = manager.fuelCards.findIndex(c => c.cardNumber === originalCardNumber);
            if (cardIndex === -1) {
                if (statusDiv) manager.setInlineStatus(statusDiv, 'כרטיס לא נמצא במערכת', 'error');
                return;
            }

            if (newCardNumber !== originalCardNumber) {
                const existingCard = manager.fuelCards.find(c => c.cardNumber === newCardNumber);
                if (existingCard) {
                    if (statusDiv) manager.setInlineStatus(statusDiv, 'מספר כרטיס זה כבר קיים במערכת', 'error');
                    return;
                }
            }

            manager.fuelCards[cardIndex].cardNumber = newCardNumber;
            manager.fuelCards[cardIndex].name = name || manager.fuelCards[cardIndex].name || '';
            manager.fuelCards[cardIndex].phone = phone || manager.fuelCards[cardIndex].phone || '';
            manager.fuelCards[cardIndex].fuelType = fuelType;
            manager.fuelCards[cardIndex].gadudNumber = gadudNumber || '';
            manager.fuelCards[cardIndex].date = manager.formatDateTime();

            await manager.updateCardInFirebase(manager.fuelCards[cardIndex]);
            manager.renderTable();
            this.cancelEditCard(manager);
            manager.showStatus('כרטיס עודכן בהצלחה', 'success');
        },

        cancelEditCard(manager) {
            const editForm = document.getElementById('editCardFormDialog');
            if (editForm) editForm.style.display = 'none';
            const container = getContainer();
            if (container) container.style.display = 'block';
            try {
                this.clearEditCardForm(manager);
            } catch (e) {
                console.warn('clearEditCardForm בביטול:', e);
            }
        },

        clearEditCardForm(manager) {
            const searchInput = document.getElementById('editCardSearchNumber');
            const cardNumberInput = document.getElementById('editCardNumber');
            const nameInput = document.getElementById('editName');
            const phoneInput = document.getElementById('editPhone');
            const fuelTypeInput = document.getElementById('editFuelType');
            const gadudSelect = document.getElementById('editGadudNumber');
            const formFields = document.getElementById('editCardFormFields');
            const statusDiv = document.getElementById('editCardStatus');

            if (searchInput) searchInput.value = '';
            if (cardNumberInput) cardNumberInput.value = '';
            if (nameInput) nameInput.value = '';
            if (phoneInput) phoneInput.value = '';
            if (fuelTypeInput) {
                fuelTypeInput.value = '';
                if (typeof window.resetFuelTypeSelector === 'function') {
                    try { window.resetFuelTypeSelector('editFuelType'); } catch (e) { console.warn(e); }
                }
            }
            if (gadudSelect) gadudSelect.value = '';
            if (formFields) {
                formFields.style.display = 'none';
                formFields.removeAttribute('data-original-card-number');
            }
            if (statusDiv) manager.hideInlineStatus(statusDiv);
        }
    };
})();
