import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "./supabaseClient";
import { db, auth } from "../firebase";
import { doc, getDoc, setDoc, updateDoc, runTransaction, collection, getDocs, query, orderBy, deleteDoc, serverTimestamp, where, limit } from "firebase/firestore";

const apiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
if (!apiKey) {
  console.error("GEMINI_API_KEY is not set. Please configure it in your environment variables or GitHub Secrets.");
}

// Initialize with the correct GoogleGenerativeAI client
const genAI = new GoogleGenerativeAI(apiKey);

// Use gemini-1.5-flash which is the recommended model for most tasks
const MODEL_NAME = "gemini-1.5-flash";
console.log("Using Gemini Model:", MODEL_NAME);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface CandidateProfile {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  skills: string[];
  experience: {
    title: string;
    company: string;
    duration: string;
    description: string;
  }[];
  education: {
    degree: string;
    institution: string;
    year: string;
  }[];
  certifications?: string[];
  languages?: string[];
  summary: string;
  match_score?: number;
}

export interface MatchResult {
  score: number;
  strengths: string[];
  gaps: string[];
  reasoning: string;
}

export const scanCV = async (fileData: string, mimeType: string, jobDescription?: string, isRawText: boolean = false): Promise<{profile: CandidateProfile, match?: MatchResult}> => {
  if (!apiKey) {
    throw new Error("API key is missing. Please set the GEMINI_API_KEY in your GitHub repository Secrets (Settings → Secrets and variables → Actions) and redeploy the app.");
  }

  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    
    let prompt = `Extract the candidate's professional profile from this CV with high precision. 
    Include contact details, location, LinkedIn, skills, detailed work experience, education, certifications, and languages.
    
    ${jobDescription ? `Also, perform a deep analysis against this Job Description: "${jobDescription}". 
    Evaluate technical fit, soft skills, and experience level. Provide a match score (0-100).` : ''}
    
    Return the data in a structured JSON format with fields: full_name, email, phone, location, linkedin, skills (array), 
    experience (array with title, company, duration, description), education (array with degree, institution, year), 
    certifications (array), languages (array), summary, and match_score (if JD provided).`;

    let response;
    if (isRawText) {
      response = await model.generateContent([
        { text: `CV Content:\n${fileData}` },
        { text: prompt }
      ]);
    } else {
      // For PDF/file data, use the inlineData format
      const base64Data = fileData.includes(',') ? fileData.split(',')[1] : fileData;
      response = await model.generateContent([
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        },
        { text: prompt }
      ]);
    }

    const responseText = response.response.text();
    const result = JSON.parse(responseText);
    
    const profile: CandidateProfile = {
      id: Math.random().toString(36).substr(2, 9),
      full_name: result.full_name,
      email: result.email,
      phone: result.phone,
      location: result.location,
      linkedin: result.linkedin,
      skills: result.skills || [],
      experience: result.experience || [],
      education: result.education || [],
      certifications: result.certifications,
      languages: result.languages,
      summary: result.summary
    };

    const match: MatchResult | undefined = result.match_score !== undefined ? {
      score: result.match_score,
      strengths: [],
      gaps: [],
      reasoning: "Extracted during initial scan"
    } : undefined;

    return { profile, match };
  } catch (error: any) {
    console.error("Error in scanCV:", error);
    throw error;
  }
};

export const matchCandidate = async (profile: CandidateProfile, jobDescription: string): Promise<MatchResult> => {
  if (!apiKey) {
    throw new Error("API key is missing. Please set the GEMINI_API_KEY in your GitHub repository Secrets (Settings → Secrets and variables → Actions) and redeploy the app.");
  }

  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    
    const prompt = `
      Candidate Profile: ${JSON.stringify(profile)}
      Job Description: ${jobDescription}
      
      Analyze how well this candidate fits the job. Provide a match score (0-100), key strengths, missing gaps, and a brief reasoning.
      Return as JSON with fields: score, strengths (array), gaps (array), reasoning.
    `;

    const response = await model.generateContent(prompt);
    const responseText = response.response.text();
    return JSON.parse(responseText);
  } catch (error: any) {
    console.error("Error in matchCandidate:", error);
    throw error;
  }
};

export const saveCandidateToFirestore = async (profile: CandidateProfile, matchScore: number, createdByEmail?: string) => {
  const path = `candidates/${profile.id}`;
  try {
    const docRef = doc(db, 'candidates', profile.id);
    const payload = {
      id: profile.id,
      full_name: profile.full_name,
      email: profile.email,
      phone: profile.phone || null,
      location: profile.location || null,
      linkedin: profile.linkedin || null,
      skills: profile.skills,
      experience: profile.experience,
      education: profile.education,
      certifications: profile.certifications || [],
      languages: profile.languages || [],
      summary: profile.summary,
      match_score: matchScore,
      created_by: createdByEmail || null,
      created_at: serverTimestamp()
    };
    await setDoc(docRef, payload, { merge: true });
    return [payload];
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const getCandidatesFromFirestore = async (): Promise<CandidateProfile[]> => {
  const path = 'candidates';
  try {
    const q = query(collection(db, 'candidates'), orderBy('created_at', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: data.id,
        full_name: data.full_name,
        email: data.email,
        phone: data.phone,
        location: data.location,
        linkedin: data.linkedin,
        skills: data.skills || [],
        experience: data.experience || [],
        education: data.education || [],
        certifications: data.certifications || [],
        languages: data.languages || [],
        summary: data.summary || "",
        match_score: data.match_score
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const getCandidatesByCreatedBy = async (email: string): Promise<CandidateProfile[]> => {
  const path = 'candidates';
  try {
    const q = query(collection(db, 'candidates'), where('created_by', '==', email), orderBy('created_at', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: data.id,
        full_name: data.full_name,
        email: data.email,
        phone: data.phone,
        location: data.location,
        linkedin: data.linkedin,
        skills: data.skills || [],
        experience: data.experience || [],
        education: data.education || [],
        certifications: data.certifications || [],
        languages: data.languages || [],
        summary: data.summary || "",
        match_score: data.match_score,
        created_by: data.created_by
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const deleteCandidateFromFirestore = async (id: string) => {
  const path = `candidates/${id}`;
  try {
    await deleteDoc(doc(db, 'candidates', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

export interface UserProfile {
  id: string;
  email: string;
  credits: number;
  is_admin: boolean;
}

export const getUserProfile = async (userId: string) => {
  if (!supabase) {
    console.warn('Supabase is not configured. getUserProfile is unavailable.');
    return null;
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error("Error fetching user profile:", error);
    return null;
  }

  return data;
};

export const deductCredit = async (userId: string): Promise<boolean> => {
  if (!supabase) {
    console.warn('Supabase is not configured. deductCredit is unavailable.');
    return false;
  }
  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', userId)
    .single();

  if (fetchError || !profile) {
    console.error("Error fetching credits for deduction:", fetchError);
    return false;
  }

  if (profile.credits <= 0) return false;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ credits: profile.credits - 1 })
    .eq('id', userId);

  if (updateError) {
    console.error("Error deducting credit:", updateError);
    return false;
  }

  return true;
};

export const getUserProfileFirestore = async (userId: string): Promise<UserProfile | null> => {
  const path = `clients/${userId}`;
  try {
    const docRef = doc(db, 'clients', userId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data() as UserProfile;
    } else {
      // Check if there's a pending profile created by admin for this email
      const userEmail = auth.currentUser?.email;
      if (userEmail) {
        const q = query(collection(db, 'clients'), where('email', '==', userEmail), where('id', '==', 'pending'), limit(1));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const pendingDoc = querySnapshot.docs[0];
          const pendingData = pendingDoc.data() as UserProfile;
          
          // Link this pending profile to the new userId
          const newProfile: UserProfile = {
            ...pendingData,
            id: userId
          };
          
          // Delete the pending doc and create the new one
          await deleteDoc(pendingDoc.ref);
          await setDoc(docRef, newProfile);
          return newProfile;
        }
      }

      // If no pending profile, create a fresh one
      const newProfile: UserProfile = {
        id: userId,
        email: auth.currentUser?.email || "",
        credits: 0,
        is_admin: auth.currentUser?.email === "aqabalocalexperiences@gmail.com"
      };
      await setDoc(docRef, newProfile);
      return newProfile;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
};

export const deductCreditFirestore = async (userId: string): Promise<boolean> => {
  const path = `clients/${userId}`;
  try {
    const docRef = doc(db, 'clients', userId);
    
    return await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (!docSnap.exists()) {
        throw new Error("Profile does not exist");
      }
      
      const data = docSnap.data() as UserProfile;
      if (data.credits <= 0) {
        return false;
      }
      
      transaction.update(docRef, { credits: data.credits - 1 });
      return true;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    return false;
  }
};

export const addCreditsFirestore = async (userId: string, amount: number): Promise<boolean> => {
  const path = `clients/${userId}`;
  try {
    const docRef = doc(db, 'clients', userId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) return false;
    
    const data = docSnap.data() as UserProfile;
    await updateDoc(docRef, { credits: data.credits + amount });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    return false;
  }
};

export const getAllUsersFirestore = async (): Promise<UserProfile[]> => {
  const path = 'clients';
  try {
    const querySnapshot = await getDocs(collection(db, 'clients'));
    return querySnapshot.docs.map(doc => {
      const data = doc.data() as UserProfile;
      return {
        ...data,
        id: doc.id // Ensure we use the actual document ID
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const updateUserCreditsFirestore = async (userId: string, newCredits: number): Promise<boolean> => {
  const path = `clients/${userId}`;
  try {
    const docRef = doc(db, 'clients', userId);
    await updateDoc(docRef, { credits: newCredits });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    return false;
  }
};

export const deleteUserFirestore = async (userId: string): Promise<boolean> => {
  const path = `clients/${userId}`;
  try {
    const docRef = doc(db, 'clients', userId);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    return false;
  }
};

export const getAppStats = async () => {
  try {
    const candidatesSnapshot = await getDocs(collection(db, 'candidates'));
    const recruitersSnapshot = await getDocs(collection(db, 'clients'));
    
    return {
      totalCVs: candidatesSnapshot.size,
      totalRecruiters: recruitersSnapshot.docs.filter(doc => !doc.data().is_admin).length
    };
  } catch (error) {
    console.error("Error fetching app stats:", error);
    return { totalCVs: 0, totalRecruiters: 0 };
  }
};

export const createPendingRecruiterFirestore = async (email: string, initialCredits: number): Promise<boolean> => {
  const path = 'clients/pending';
  try {
    // Check if user already exists
    const q = query(collection(db, 'clients'), where('email', '==', email), limit(1));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      throw new Error("A user with this email already exists.");
    }

    // Create a pending document. We use a random ID but mark it as pending.
    const pendingId = `pending_${Math.random().toString(36).substr(2, 9)}`;
    const docRef = doc(db, 'clients', pendingId);
    const newProfile: UserProfile = {
      id: 'pending', // Special marker
      email: email,
      credits: initialCredits,
      is_admin: false
    };
    await setDoc(docRef, newProfile);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    return false;
  }
};

export const generateContract = async (profile: CandidateProfile, jobDescription: string): Promise<string> => {
  if (!apiKey) {
    throw new Error("API key is missing. Please set the GEMINI_API_KEY in your GitHub repository Secrets (Settings → Secrets and variables → Actions) and redeploy the app.");
  }

  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    
    const prompt = `
      Generate a professional employment contract and company policy document for the following candidate and job role.
      
      Candidate: ${profile.full_name} (${profile.email})
      Job Details: ${jobDescription}
      
      The document should include:
      1. Employment Agreement (Position, Responsibilities, Compensation, Benefits)
      2. Company Policies (Code of Conduct, Confidentiality, Termination)
      3. Signature lines for both parties.
      
      Format the output in Markdown. Use professional language.
    `;

    const response = await model.generateContent(prompt);
    return response.response.text() || "Failed to generate contract.";
  } catch (error: any) {
    console.error("Error in generateContract:", error);
    throw error;
  }
};
