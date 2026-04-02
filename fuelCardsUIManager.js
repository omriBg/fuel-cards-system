class FuelCardsUIManager {
    constructor(controller) {
        this.controller = controller;
        this.statusModalTimeout = null;
        this.handleStatusModalKeydown = this.handleStatusModalKeydown.bind(this);
    }

    setupStatusModalListeners() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.attachModalListeners());
        } else {
            this.attachModalListeners();
        }
    }

    attachModalListeners() {
        const modal = document.getElementById('statusModal');
        if (!modal) return;

        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeStatusModal();
        });

        const closeBtn = modal.querySelector('.status-modal__close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeStatusModal();
            });
        }

        const actionBtn = modal.querySelector('.status-modal__action');
        if (actionBtn) {
            actionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeStatusModal();
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('status-modal--visible')) {
                this.closeStatusModal();
            }
        });
    }

    showLoadingState() {
        const tbody = document.getElementById('fuelCardsBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="100%" style="text-align: center; padding: 40px; color: #666;">טוען נתונים...</td></tr>';
        }
    }

    hideLoadingState() {}

    renderTable() {
        this.controller.renderTableCore();
    }

    updateTableHeaders() {
        this.controller.updateTableHeadersCore();
    }

    showStatus(message, type) {
        const statusDiv = document.getElementById('status');
        if (statusDiv) {
            statusDiv.textContent = message;
            statusDiv.className = `status ${type}`;
            statusDiv.style.display = 'block';
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 3000);
        }
        this.openStatusModal(message, type);
    }

    openStatusModal(message, type = 'info') {
        const modal = document.getElementById('statusModal');
        const messageEl = document.getElementById('statusModalMessage');
        const titleEl = document.getElementById('statusModalTitle');
        const iconEl = document.getElementById('statusModalIcon');
        if (!modal || !messageEl) return;

        const titles = { success: 'הפעולה הצליחה', error: 'פעולה נכשלה', processing: 'מעבד בקשה', info: 'עדכון מערכת' };
        const icons = { success: '✓', error: '!', processing: '…', info: 'ℹ' };
        const statusType = titles[type] ? type : 'info';

        if (titleEl) titleEl.textContent = titles[statusType];
        if (iconEl) iconEl.textContent = icons[statusType];
        messageEl.textContent = message;
        modal.style.display = 'flex';
        modal.setAttribute('data-status-type', statusType);
        modal.classList.remove('status-modal--hidden');
        modal.classList.add('status-modal--visible');
        modal.setAttribute('aria-hidden', 'false');

        if (this.statusModalTimeout) clearTimeout(this.statusModalTimeout);
        if (statusType !== 'error') {
            this.statusModalTimeout = setTimeout(() => this.closeStatusModal(), 4500);
        }
    }

    closeStatusModal() {
        const modal = document.getElementById('statusModal');
        if (!modal) return;
        if (this.statusModalTimeout) {
            clearTimeout(this.statusModalTimeout);
            this.statusModalTimeout = null;
        }
        modal.classList.remove('status-modal--visible');
        modal.classList.add('status-modal--hidden');
        modal.setAttribute('aria-hidden', 'true');
        modal.style.display = 'none';
        const messageEl = document.getElementById('statusModalMessage');
        if (messageEl) messageEl.textContent = '';
        const backdrop = modal.querySelector('div[style*="position: fixed"]');
        if (backdrop) backdrop.style.display = 'none';
    }

    handleStatusModalKeydown(event) {
        if (event.key === 'Escape') this.closeStatusModal();
    }

    showLoginForm() {
        const splashScreen = document.getElementById('splashScreen');
        if (splashScreen) {
            splashScreen.classList.add('fade-out');
            setTimeout(() => { splashScreen.style.display = 'none'; }, 600);
        }
        const container = document.querySelector('.container') || document.getElementById('mainContainer');
        if (container) container.style.display = 'none';
        const loginForm = document.getElementById('loginForm');
        if (loginForm) loginForm.style.display = 'block';
    }

    showMainInterface() {
        const splashScreen = document.getElementById('splashScreen');
        if (splashScreen) {
            splashScreen.classList.add('fade-out');
            setTimeout(() => { splashScreen.style.display = 'none'; }, 600);
        }
        const loginForm = document.getElementById('loginForm');
        if (loginForm) loginForm.style.display = 'none';
        const container = document.querySelector('.container') || document.getElementById('mainContainer');
        if (container) container.style.display = 'block';
        this.updateInterfaceByPermissions();
    }

    showLoginStatus(message, type) {
        const statusDiv = document.getElementById('loginStatus');
        if (!statusDiv) return;
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';
        setTimeout(() => { statusDiv.style.display = 'none'; }, 3000);
    }

    updateInterfaceByPermissions() {
        const user = this.controller.currentUser;
        if (!user) return;
        const userInfo = document.getElementById('currentUserInfo');
        const userInfoDiv = document.getElementById('userInfo');
        const adminPanelBtn = document.getElementById('adminPanelBtn');
        const editCardBtn = document.getElementById('editCardBtn');

        if (user.isAdmin) {
            if (userInfo) userInfo.textContent = `${user.name} - מנהל מערכת`;
            if (adminPanelBtn) adminPanelBtn.style.display = 'inline-block';
            if (editCardBtn) editCardBtn.style.display = 'inline-block';
        } else {
            if (userInfo) userInfo.textContent = `${user.name} - גדוד ${user.gadud}`;
            if (adminPanelBtn) adminPanelBtn.style.display = 'none';
            if (editCardBtn) editCardBtn.style.display = 'none';
        }

        if (userInfoDiv) userInfoDiv.style.display = 'block';
        this.updateAdminSortingControls();
        this.updateButtonVisibility();
        this.controller.updateBulkIssueUI();
        this.renderTable();
    }

    updateAdminSortingControls() {
        const adminSortingControls = document.getElementById('adminSortingControls');
        if (adminSortingControls) {
            adminSortingControls.style.display = this.controller.currentUser ? 'block' : 'none';
        }
    }

    updateButtonVisibility() {
        const user = this.controller.currentUser;
        if (!user) return;

        const adminButtons = [
            'button[onclick*="showTypingForm(\'new\')"]',
            'button[onclick*="showTypingForm(\'update\')"]',
            'button[onclick*="showTypingForm(\'return\')"]'
        ];
        const gadudButtons = [
            'button[onclick*="showTypingForm(\'gadud_new\')"]',
            'button[onclick*="showTypingForm(\'gadud_update\')"]',
            'button[onclick*="showTypingForm(\'gadud_return\')"]'
        ];

        const batchCreditBtn = document.getElementById('batchCreditBtn');
        if (batchCreditBtn) batchCreditBtn.style.display = user.isAdmin ? 'block' : 'none';
        const batchReturnBtn = document.getElementById('batchReturnBtn');
        if (batchReturnBtn) batchReturnBtn.style.display = user.isAdmin ? 'block' : 'none';

        const controlCards = document.querySelectorAll('.control-card');
        const adminControlCards = [];
        controlCards.forEach((card) => {
            const h3 = card.querySelector('h3');
            if (!h3) return;
            const title = h3.textContent.trim();
            if (title === 'ניפוק כרטיס חדש' || title === 'עדכון כרטיס' || title === 'החזרת כרטיס') adminControlCards.push(card);
        });

        if (user.isAdmin) {
            adminButtons.forEach((selector) => document.querySelectorAll(selector).forEach((btn) => { btn.style.display = 'block'; }));
            gadudButtons.forEach((selector) => document.querySelectorAll(selector).forEach((btn) => { btn.style.display = 'block'; }));
            adminControlCards.forEach((card) => { card.style.display = 'flex'; });
        } else {
            adminButtons.forEach((selector) => document.querySelectorAll(selector).forEach((btn) => { btn.style.display = 'none'; }));
            gadudButtons.forEach((selector) => document.querySelectorAll(selector).forEach((btn) => { btn.style.display = 'block'; }));
            adminControlCards.forEach((card) => { card.style.display = 'none'; });
        }
    }
}

window.FuelCardsUIManager = FuelCardsUIManager;
