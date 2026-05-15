import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type AppOptions,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function buildOptions(): AppOptions {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID is required for the Admin SDK.",
    );
  }

  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n",
  );

  if (clientEmail && privateKey) {
    return {
      projectId,
      credential: cert({ projectId, clientEmail, privateKey }),
    };
  }

  // Fall back to Application Default Credentials:
  //   - locally: `gcloud auth application-default login`
  //   - on Firebase / Cloud Run / Functions: metadata server
  return { projectId, credential: applicationDefault() };
}

const adminApp: App = getApps()[0] ?? initializeApp(buildOptions());

export const adminAuth: Auth = getAuth(adminApp);
export const adminDb: Firestore = getFirestore(adminApp);
