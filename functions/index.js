const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// Legacy endpoint kept only to avoid breaking deployments that still reference it.
// This app authenticates users using Firebase Auth email/password directly from the client,
// so we no longer keep any hardcoded passwords in this backend.
exports.verifyGadudPassword = functions.https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated.');
  }

  throw new functions.https.HttpsError(
    'unavailable',
    'This endpoint is no longer used. Login is handled by Firebase Auth email/password on the client.'
  );
});

