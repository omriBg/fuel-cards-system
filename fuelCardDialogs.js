// UI factory for dialogs used by FuelCardManager.
// Must be loaded before `script-firebase.js`.
(function () {
    'use strict';

    window.FuelCardDialogs = window.FuelCardDialogs || {};

    window.FuelCardDialogs.createGadudCreditConfirmationDialog = function () {
        const dialog = document.createElement('div');
        dialog.id = 'gadudCreditConfirmationDialog';
        dialog.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
            ">
                <div style="
                    background: white;
                    padding: 40px;
                    border-radius: 15px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                    text-align: center;
                    min-width: 500px;
                    max-width: 600px;
                ">
                    <h2 style="color: #2c3e50; margin-bottom: 30px; font-size: 1.5em;">אישור זיכוי גדודי</h2>
                    <div style="
                        background: #fff3cd;
                        border: 2px solid #ffc107;
                        border-radius: 10px;
                        padding: 25px;
                        margin-bottom: 30px;
                        text-align: right;
                        direction: rtl;
                    ">
                        <p style="
                            color: #856404;
                            font-size: 1.1em;
                            line-height: 1.8;
                            margin: 0;
                            font-weight: 500;
                        ">
                            אני מאשר כי בדקתי ווידאתי שאכן הכרטיס נוצל עד תום והוא ריק לגמרי מדלק (או באמצעות האתר הייעודי לכך או באמצעות קבלות).
                        </p>
                    </div>
                    <div style="display: flex; gap: 15px; justify-content: center;">
                        <button data-dialog-action="confirmGadudCredit" style="
                            background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
                            color: white;
                            border: none;
                            padding: 15px 30px;
                            border-radius: 25px;
                            font-size: 16px;
                            cursor: pointer;
                            font-weight: 600;
                            min-width: 120px;
                        ">מאשר</button>
                        <button data-dialog-action="cancelGadudCredit" style="
                            background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
                            color: white;
                            border: none;
                            padding: 15px 30px;
                            border-radius: 25px;
                            font-size: 16px;
                            cursor: pointer;
                            font-weight: 600;
                            min-width: 120px;
                        ">לא מאשר</button>
                    </div>
                </div>
            </div>
        `;
        return dialog;
    };

    window.FuelCardDialogs.createEditCardPasswordDialog = function () {
        const dialog = document.createElement('div');
        dialog.id = 'editCardPasswordDialog';
        dialog.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
            ">
                <div style="
                    background: white;
                    padding: 40px;
                    border-radius: 15px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                    text-align: center;
                    min-width: 400px;
                    direction: rtl;
                ">
                    <h2 style="color: #2c3e50; margin-bottom: 30px;">אימות סיסמה לעריכה</h2>
                    <div style="margin-bottom: 20px;">
                        <input type="password" id="editCardPassword" placeholder="הכנס סיסמה" style="
                            width: 100%;
                            padding: 12px;
                            border: 2px solid #ddd;
                            border-radius: 8px;
                            font-size: 16px;
                            margin-bottom: 15px;
                        ">
                    </div>
                    <div style="display: flex; gap: 15px; justify-content: center;">
                        <button data-dialog-action="verifyEditCardPassword" style="
                            background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
                            color: white;
                            border: none;
                            padding: 15px 30px;
                            border-radius: 25px;
                            font-size: 16px;
                            cursor: pointer;
                            font-weight: 600;
                        ">אישור</button>
                        <button data-dialog-action="cancelEditCardPassword" style="
                            background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%);
                            color: white;
                            border: none;
                            padding: 15px 30px;
                            border-radius: 25px;
                            font-size: 16px;
                            cursor: pointer;
                            font-weight: 600;
                        ">ביטול</button>
                    </div>
                    <div id="editCardPasswordStatus" style="margin-top: 20px; padding: 10px; border-radius: 8px; display: none;"></div>
                </div>
            </div>
        `;
        return dialog;
    };

    window.FuelCardDialogs.createEditCardFormDialog = function () {
        const dialog = document.createElement('div');
        dialog.id = 'editCardFormDialog';
        dialog.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                overflow-y: auto;
                padding: 20px;
            ">
                <div style="
                    background: white;
                    padding: 40px;
                    border-radius: 15px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                    text-align: right;
                    min-width: 500px;
                    max-width: 800px;
                    width: 100%;
                    direction: rtl;
                ">
                    <h2 style="color: #2c3e50; margin-bottom: 30px; text-align: center;">עריכת כרטיס</h2>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #2c3e50;">מספר כרטיס (לחיפוש):</label>
                        <input type="number" id="editCardSearchNumber" placeholder="הכנס מספר כרטיס" style="
                            width: 100%;
                            padding: 12px;
                            border: 2px solid #ddd;
                            border-radius: 8px;
                            font-size: 16px;
                        ">
                        <button data-dialog-action="searchCardForEdit" style="
                            background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
                            color: white;
                            border: none;
                            padding: 10px 20px;
                            border-radius: 8px;
                            font-size: 14px;
                            cursor: pointer;
                            margin-top: 10px;
                            width: 100%;
                        ">חפש כרטיס</button>
                    </div>
                    
                    <div id="editCardFormFields" style="display: none;">
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #2c3e50;">מספר כרטיס:</label>
                            <input type="number" id="editCardNumber" style="
                                width: 100%;
                                padding: 12px;
                                border: 2px solid #ddd;
                                border-radius: 8px;
                                font-size: 16px;
                            ">
                        </div>
                        
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #2c3e50;">שם מלא:</label>
                            <input type="text" id="editName" placeholder="הכנס שם מלא" style="
                                width: 100%;
                                padding: 12px;
                                border: 2px solid #ddd;
                                border-radius: 8px;
                                font-size: 16px;
                            ">
                        </div>
                        
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #2c3e50;">מספר טלפון:</label>
                            <input type="tel" id="editPhone" placeholder="הכנס מספר טלפון" style="
                                width: 100%;
                                padding: 12px;
                                border: 2px solid #ddd;
                                border-radius: 8px;
                                font-size: 16px;
                            ">
                        </div>
                        
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #2c3e50;">סוג דלק:</label>
                            <div class="fuel-type-selector" data-fuel-selector="editFuelType">
                                <div class="fuel-type-buttons">
                                    <button type="button" class="fuel-type-option" data-fuel-value="בנזין">בנזין</button>
                                    <button type="button" class="fuel-type-option" data-fuel-value="סולר">סולר</button>
                                    <button type="button" class="fuel-type-option" data-fuel-value="אוריאה">אוריאה</button>
                                    <button type="button" class="fuel-type-option" data-fuel-value="other">אחר</button>
                                </div>
                                <div class="fuel-type-custom">
                                    <input type="text" id="editFuelType" placeholder="הקלד סוג דלק">
                                </div>
                            </div>
                        </div>
                        
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #2c3e50;">מספר גדוד:</label>
                            <select id="editGadudNumber" style="
                                width: 100%;
                                padding: 12px;
                                border: 2px solid #ddd;
                                border-radius: 8px;
                                font-size: 16px;
                            ">
                                <option value="">בחר מספר גדוד</option>
                                <option value="650">650</option>
                                <option value="703">703</option>
                                <option value="651">651</option>
                                <option value="791">791</option>
                                <option value="652">652</option>
                                <option value="638">638</option>
                                <option value="653">653</option>
                                <option value="674">674</option>
                            </select>
                        </div>
                        
                        <div style="display: flex; gap: 15px; justify-content: center; margin-top: 30px;">
                            <button data-dialog-action="submitEditCard" style="
                                background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
                                color: white;
                                border: none;
                                padding: 15px 30px;
                                border-radius: 25px;
                                font-size: 16px;
                                cursor: pointer;
                                font-weight: 600;
                            ">שמור שינויים</button>
                            <button data-dialog-action="cancelEditCard" style="
                                background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%);
                                color: white;
                                border: none;
                                padding: 15px 30px;
                                border-radius: 25px;
                                font-size: 16px;
                                cursor: pointer;
                                font-weight: 600;
                            ">ביטול</button>
                        </div>
                    </div>
                    
                    <div id="editCardStatus" style="margin-top: 20px; padding: 10px; border-radius: 8px; display: none;"></div>
                </div>
            </div>
        `;
        return dialog;
    };
})();

