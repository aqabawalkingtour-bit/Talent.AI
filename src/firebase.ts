import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';

// Define the Firebase configuration using environment variables
const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "",
};

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
// Use the provided database ID or default to "(default)" if it's missing or looks like a placeholder
const databaseId = (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId.includes('-')) 
  ? firebaseConfig.firestoreDatabaseId 
  : "(default)";

export const db = getFirestore(app, databaseId);
export const auth = getAuth(app);

// Validate Connection to Firestore
async function testConnection() {
  try {
    console.log('Testing Firebase connection...');
    console.log('Firebase Config:', {
      projectId: firebaseConfig.projectId,
      authDomain: firebaseConfig.authDomain,
      apiKey: firebaseConfig.apiKey ? '***' : 'MISSING',
      firestoreDatabaseId: firebaseConfig.firestoreDatabaseId,
    });
    
    // Try to get a test document
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('✓ Firebase connection successful!');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('✗ Firebase connection failed:', errorMessage);
    
    if (errorMessage.includes('the client is offline')) {
      console.error('❌ The client is offline. Please check:');
      console.error('  1. Your internet connection');
      console.error('  2. Firebase environment variables in .env file');
      console.error('  3. Firebase project is active and not deleted');
    } else if (errorMessage.includes('permission-denied')) {
      console.error('❌ Permission denied. Please check:');
      console.error('  1. Firestore security rules');
      console.error('  2. User authentication status');
      console.error('  3. Collection/document access permissions');
    } else if (errorMessage.includes('invalid-api-key')) {
      console.error('❌ Invalid API key. Please check:');
      console.error('  1. VITE_FIREBASE_API_KEY in .env file');
      console.error('  2. API key is correct and active in Firebase Console');
    }
  }
}

// Only test connection in development mode
if (import.meta.env.DEV) {
  testConnection();
}
