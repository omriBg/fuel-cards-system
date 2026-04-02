// Centralized UI/config constants used by the frontend.
// Loaded from index.html before `script-firebase.js`.
window.APP_CONSTANTS = window.APP_CONSTANTS || {};

window.APP_CONSTANTS.ALLOWED_FUELS = window.APP_CONSTANTS.ALLOWED_FUELS || [
    'בנזין',
    'סולר',
    'דיזל',
    'גז',
    'חשמל',
    'היברידי',
    'אוריאה'
];

window.APP_CONSTANTS.ADMIN_GADUD_CONTACTS = window.APP_CONSTANTS.ADMIN_GADUD_CONTACTS || {
    '651': { name: 'דור בן לולו', phone: '054-3091641' },
    '652': { name: 'לי נאגר', phone: '050-5559153' },
    '653': { name: 'אביחי', phone: '050-6909403' },
    '638': { name: 'מירב עדן בניאס', phone: '052-6889285' },
    '674': { name: 'נועה אסולין', phone: '052-7891707' },
    '703': { name: 'תאיר בנימיני', phone: '052-2030798' },
    '791': { name: 'נוי רחמים', phone: '052-4831696' }
};

