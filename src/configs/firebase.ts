import admin, { ServiceAccount } from 'firebase-admin';
import logger from '../logger';
const serviceAccount: ServiceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
}
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
export const db = admin.firestore();
db.settings({
    ignoreUndefinedProperties: true
});
export default admin;