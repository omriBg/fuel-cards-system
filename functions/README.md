# fuel-card-manager - Functions

This backend exposes a callable function that verifies the user's `loginName` (password) + `loginGadud`,
and returns a Firebase Custom Token with claims used by `firestore.rules`.

## Deploy (from repo root)

1. Install dependencies in `functions/`:
   - `cd functions && npm install`
2. Deploy functions:
   - `firebase deploy --only functions`
3. Deploy Firestore rules (already in `firestore.rules`):
   - `firebase deploy --only firestore:rules`

## Important

For real security, move the password mappings from `functions/index.js` to Secret Manager / Functions config.
They are no longer in the client bundle, but they still exist in the backend code as placeholders.

