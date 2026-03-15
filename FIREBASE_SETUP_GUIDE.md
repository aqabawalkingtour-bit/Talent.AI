# Firebase Configuration and Troubleshooting Guide

## Problem Summary

The error you're experiencing indicates that Firebase environment variables are not properly configured. The console shows:
- **"Please check your Firebase configuration"** - The client is offline or cannot connect to Firestore
- **"Failed to get document"** - Firestore queries are failing due to authentication/configuration issues

## Root Causes

1. **Missing Environment Variables**: The `.env` file is not created or is missing Firebase configuration keys
2. **Offline Client**: The Firebase SDK cannot connect to Firestore due to missing/invalid credentials
3. **Authentication Issues**: The app is trying to access Firestore without proper authentication
4. **CORS/Network Issues**: Browser may be blocking requests to Firebase servers

## Solution Steps

### Step 1: Create `.env` File with Firebase Configuration

Create a `.env` file in the root directory of the project with your Firebase credentials:

```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your Firebase configuration
```

Your `.env` file should look like:

```
# Gemini API Key
VITE_GEMINI_API_KEY=your_gemini_api_key_here

# Firebase Configuration
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef1234567890
VITE_FIREBASE_API_KEY=AIzaSyD1234567890abcdefghijklmnopqrst
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_FIRESTORE_DATABASE_ID=(default)
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_MEASUREMENT_ID=G-ABCDEFGHIJ
```

### Step 2: Get Your Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click on **Project Settings** (gear icon)
4. Go to the **General** tab
5. Scroll down to find your **Firebase SDK snippet**
6. Copy the configuration object and fill in the `.env` file

### Step 3: Verify Firestore Database Setup

1. In Firebase Console, go to **Firestore Database**
2. Ensure the database is created and in **Production mode**
3. Go to **Rules** tab and verify the security rules are properly set
4. Check that the database location is set correctly

### Step 4: Update Security Rules (If Needed)

If you're testing locally, you can temporarily use permissive rules:

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow all reads and writes for testing
    allow read, write: if true;
  }
}
```

**⚠️ WARNING**: This is only for development/testing. Use proper authentication rules in production.

### Step 5: Rebuild and Test

```bash
# Install dependencies
pnpm install

# Rebuild the application
pnpm build

# Start development server
pnpm dev
```

### Step 6: Check Browser Console

Open your browser's Developer Tools (F12) and check the **Console** tab for:
- Firebase initialization messages
- Connection status
- Any error messages with more details

## Common Error Messages and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "The client is offline" | Firebase cannot connect to servers | Check internet connection and Firebase credentials |
| "Failed to get document" | Authentication/permission denied | Verify Firebase rules and authentication setup |
| "VITE_FIREBASE_* is undefined" | Environment variables not loaded | Create `.env` file and restart dev server |
| "CORS error" | Browser blocking Firebase requests | Check Firebase security rules and allowed domains |
| "Permission denied" | User doesn't have access to collection | Update Firestore security rules |

## Authentication Setup

### For Anonymous Authentication:

```typescript
import { signInAnonymously } from 'firebase/auth';
import { auth } from './firebase';

// Sign in anonymously
await signInAnonymously(auth);
```

### For Email/Password Authentication:

```typescript
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebase';

// Create account
await createUserWithEmailAndPassword(auth, email, password);

// Sign in
await signInWithEmailAndPassword(auth, email, password);
```

## Debugging Steps

1. **Check if Firebase is initialized**:
   ```typescript
   import { db } from './firebase';
   console.log('Firestore DB:', db);
   ```

2. **Test Firestore connection**:
   ```typescript
   import { collection, getDocs } from 'firebase/firestore';
   const snapshot = await getDocs(collection(db, 'candidates'));
   console.log('Candidates:', snapshot.docs);
   ```

3. **Check authentication state**:
   ```typescript
   import { auth } from './firebase';
   console.log('Current user:', auth.currentUser);
   ```

4. **Enable Firebase debug logging**:
   ```typescript
   import { enableLogging } from 'firebase/firestore';
   enableLogging(true);
   ```

## GitHub Actions Deployment

When deploying via GitHub Actions, add these secrets to your repository:

1. Go to **Settings → Secrets and variables → Actions**
2. Add the following secrets:
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_FIRESTORE_DATABASE_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_MEASUREMENT_ID`
   - `VITE_GEMINI_API_KEY`

## Additional Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/start)
- [Firebase Authentication](https://firebase.google.com/docs/auth)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)

## Still Having Issues?

1. Check the browser console for detailed error messages
2. Verify all environment variables are correctly set
3. Ensure your Firebase project is active and not deleted
4. Check your internet connection
5. Try clearing browser cache and restarting the dev server
