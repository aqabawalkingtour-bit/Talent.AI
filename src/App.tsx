import React, { useState, useRef } from 'react';
import { 
  FileText, 
  Upload, 
  Search, 
  User as UserIcon, 
  Briefcase, 
  CheckCircle, 
  XCircle, 
  Printer, 
  Copy, 
  ChevronRight,
  Loader2,
  Plus,
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  Trash2,
  CreditCard,
  Zap,
  Phone,
  MapPin,
  Linkedin,
  Globe,
  Award,
  Edit,
  Save,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import mammoth from 'mammoth';
import { extractTextFromPDF } from './utils/pdfExtractor';
import { 
  scanCV, 
  matchCandidate, 
  generateContract, 
  saveCandidateToFirestore,
  getCandidatesFromFirestore,
  getCandidatesByCreatedBy,
  deleteCandidateFromFirestore,
  getAppStats,
  getUserProfileFirestore,
  deductCreditFirestore,
  addCreditsFirestore,
  getAllUsersFirestore,
  updateUserCreditsFirestore,
  deleteUserFirestore,
  createPendingRecruiterFirestore,
  type CandidateProfile, 
  type MatchResult,
  type UserProfile
} from './services/geminiService';
import { auth } from './firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut, 
  User,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-[#E4E3E0] text-[#141414]">
          <div className="max-w-md w-full bg-white border border-[#141414] p-8 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
            <h2 className="text-2xl font-bold mb-4 uppercase tracking-tighter">Something went wrong</h2>
            <p className="text-sm opacity-70 mb-6">The application encountered an error. This might be due to a database permission issue.</p>
            <div className="bg-red-50 p-4 border border-red-200 mb-6 overflow-auto max-h-48">
              <code className="text-[10px] text-red-600 break-all">
                {typeof this.state.error === 'object' ? JSON.stringify(this.state.error) : String(this.state.error)}
              </code>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-[#141414] text-[#E4E3E0] py-3 font-bold uppercase tracking-widest text-xs"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type View = 'landing' | 'recruiter' | 'candidate' | 'contract' | 'admin';

interface CandidateWithMatch extends CandidateProfile {
  match?: MatchResult;
  isHired?: boolean;
  contract?: string;
  isSynced?: boolean;
}

export default function App() {
  const [view, setView] = useState<View>('landing');
  const [candidates, setCandidates] = useState<CandidateWithMatch[]>([]);
  const [jobDescription, setJobDescription] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanningProgress, setScanningProgress] = useState({ current: 0, total: 0, status: '' });
  const [isMatching, setIsMatching] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [isGeneratingContract, setIsGeneratingContract] = useState(false);
  const [isLoadingFromDB, setIsLoadingFromDB] = useState(false);
  const [isFetchingCandidate, setIsFetchingCandidate] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editedProfile, setEditedProfile] = useState<CandidateProfile | null>(null);
  
  // Auth & Profile State
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [newRecruiterEmail, setNewRecruiterEmail] = useState('');
  const [newRecruiterCredits, setNewRecruiterCredits] = useState(50);
  const [isAddingRecruiter, setIsAddingRecruiter] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [appStats, setAppStats] = useState({ totalCVs: 0, totalRecruiters: 0 });
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const closeConfirmModal = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));

  const triggerConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        closeConfirmModal();
      }
    });
  };

  React.useEffect(() => {
    const fetchStats = async () => {
      setIsLoadingStats(true);
      const stats = await getAppStats();
      setAppStats(stats);
      setIsLoadingStats(false);
    };
    if (view === 'landing') {
      fetchStats();
    }
  }, [view]);

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchProfile(currentUser.uid);
      } else {
        setProfile(null);
      }
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  React.useEffect(() => {
    if (view === 'candidate' && user && !isScanning && candidates.length === 0) {
      const fetchCandidateProfiles = async () => {
        setIsFetchingCandidate(true);
        try {
          const existingProfiles = await getCandidatesByCreatedBy(user.email!);
          if (existingProfiles && existingProfiles.length > 0) {
            setCandidates(existingProfiles.map(p => ({ ...p, isSynced: true })));
          }
        } catch (error) {
          console.error("Error fetching existing candidate profiles:", error);
        } finally {
          setIsFetchingCandidate(false);
        }
      };
      fetchCandidateProfiles();
    }
  }, [view, user, isScanning]);

  const fetchProfile = async (userId: string) => {
    const userProfile = await getUserProfileFirestore(userId);
    if (userProfile) {
      setProfile(userProfile);
      // Sync legacy credits state for UI compatibility
      setCredits(prev => ({
        ...prev,
        scansTotal: userProfile.credits + prev.scansUsed,
      }));
    }
  };

  const fetchAllUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const users = await getAllUsersFirestore();
      setAllUsers(users);
    } catch (error: any) {
      setErrorMessage(`Failed to load users: ${error.message}`);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleUpdateUserCredits = async (userId: string, newCredits: number) => {
    try {
      const success = await updateUserCreditsFirestore(userId, newCredits);
      if (success) {
        setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, credits: newCredits } : u));
        setSuccessMessage("Credits updated successfully!");
      }
    } catch (error: any) {
      setErrorMessage(`Failed to update credits: ${error.message}`);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setIsLoadingUsers(true);
    try {
      const success = await deleteUserFirestore(userId);
      if (success) {
        setAllUsers(prev => prev.filter(u => u.id !== userId));
        setSuccessMessage("Recruiter deleted successfully!");
      }
    } catch (error: any) {
      setErrorMessage(`Failed to delete recruiter: ${error.message}`);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleAddRecruiter = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAddingRecruiter(true);
    try {
      const success = await createPendingRecruiterFirestore(newRecruiterEmail, newRecruiterCredits);
      if (success) {
        setSuccessMessage(`Recruiter ${newRecruiterEmail} added as pending!`);
        setNewRecruiterEmail('');
        setNewRecruiterCredits(50);
        fetchAllUsers();
      }
    } catch (error: any) {
      setErrorMessage(`Failed to add recruiter: ${error.message}`);
    } finally {
      setIsAddingRecruiter(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSigningIn(true);
    setErrorMessage(null);

    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        setSuccessMessage("Account created successfully!");
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
    } catch (error: any) {
      setErrorMessage(error.message);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setErrorMessage(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      setErrorMessage(error.message);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setView('landing');
  };

  // Credit System State (Legacy local state, we'll sync with profile)
  const [credits, setCredits] = useState({
    jobSlots: 5,
    jobSlotsUsed: 1, // Current JD counts as 1
    scansTotal: 100,
    scansUsed: 0
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  React.useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 7000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  const fetchCandidates = async () => {
    setIsLoadingFromDB(true);
    try {
      const dbCandidates = await getCandidatesFromFirestore();
      // Only add candidates that aren't already in the local state
      setCandidates(prev => {
        const existingIds = new Set(prev.map(c => c.id));
        const newOnes = dbCandidates
          .filter(c => !existingIds.has(c.id))
          .map(c => {
            // If the DB has a match score, create a basic match object
            const match = c.match_score !== undefined ? {
              score: c.match_score,
              strengths: [],
              gaps: [],
              reasoning: "Loaded from database"
            } : undefined;
            
            return { ...c, match, isSynced: true };
          });
        return [...prev, ...newOnes];
      });
    } catch (error: any) {
      console.error("Failed to fetch candidates:", error);
      setErrorMessage(`Failed to load candidates from database: ${error.message}`);
    } finally {
      setIsLoadingFromDB(false);
    }
  };

  React.useEffect(() => {
    if (view === 'recruiter') {
      fetchCandidates();
    }
    if (view === 'admin') {
      fetchAllUsers();
    }
  }, [view]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsScanning(true);
    setScanningProgress({ current: 0, total: files.length, status: 'Starting...' });
    setSuccessMessage(null);
    const newCandidates: CandidateWithMatch[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setScanningProgress(prev => ({ ...prev, current: i + 1, status: `Processing ${file.name}...` }));
      
      const isWordDoc = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                        file.name.endsWith('.docx');
      
      const reader = new FileReader();
      
      const filePromise = new Promise<void>((resolve) => {
        reader.onload = async (e) => {
          try {
            let scanData: string;
            let isRawText = false;

            setScanningProgress(prev => ({ ...prev, status: `Extracting text from ${file.name}...` }));
            if (isWordDoc) {
              const arrayBuffer = e.target?.result as ArrayBuffer;
              const result = await mammoth.extractRawText({ arrayBuffer });
              scanData = result.value;
              isRawText = true;
            } else if (file.type === 'application/pdf') {
              const arrayBuffer = e.target?.result as ArrayBuffer;
              scanData = await extractTextFromPDF(arrayBuffer);
              isRawText = true;
            } else {
              scanData = e.target?.result as string;
            }

            setScanningProgress(prev => ({ ...prev, status: `AI Analysis for ${file.name}...` }));
            const { profile, match } = await scanCV(scanData, file.type, jobDescription, isRawText);
            let isSynced = false;
            
            let finalProfile = { ...profile };
            try {
              setScanningProgress(prev => ({ ...prev, status: `Saving ${profile.full_name} to database...` }));
              const dbData = await saveCandidateToFirestore(profile, match?.score || 0, user?.email || undefined);
              if (dbData && dbData.length > 0) {
                finalProfile.id = dbData[0].id.toString();
              }
              isSynced = true;
            } catch (dbError: any) {
              console.error("Firestore save failed:", dbError);
            }

            const candidate: CandidateWithMatch = { ...finalProfile, match, isSynced };
            newCandidates.push(candidate);
          } catch (error) {
            console.error("Error scanning CV:", error);
            setErrorMessage(`Error scanning ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
          resolve();
        };
      });
      
      if (isWordDoc || file.type === 'application/pdf') {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsDataURL(file);
      }
      await filePromise;
    }

    setCandidates(prev => [...prev, ...newCandidates]);
    setIsScanning(false);
    setScanningProgress({ current: 0, total: 0, status: '' });
    if (view === 'landing') setView('recruiter');
  };

  const handleDelete = async (id: string) => {
    triggerConfirm(
      "Remove Candidate",
      "Are you sure you want to remove this candidate from your dashboard?",
      async () => {
        try {
          await deleteCandidateFromFirestore(id);
          setCandidates(prev => prev.filter(c => c.id !== id));
          if (selectedCandidateId === id) setSelectedCandidateId(null);
          setSuccessMessage("Candidate removed successfully.");
        } catch (error: any) {
          console.error("Delete failed:", error);
          setErrorMessage(`Failed to delete candidate: ${error.message}`);
        }
      }
    );
  };
  const handleMatchAll = async () => {
    if (!jobDescription.trim()) {
      setErrorMessage("Please enter a job description first.");
      return;
    }

    if (!user || !profile) {
      setErrorMessage("Please log in to use AI Matching.");
      return;
    }

    if (profile.credits <= 0) {
      setErrorMessage("You've reached your AI Matching limit! Please contact the owner to buy more credits.");
      return;
    }

    setIsMatching(true);
    try {
      const updatedCandidates = await Promise.all(
        candidates.map(async (c) => {
          // Check if we still have credits for this specific candidate
          if (profile.credits <= 0) return c;
          
          try {
            const match = await matchCandidate(c, jobDescription);
            let updated = { ...c, match };
            
            // Deduct credit from Firestore
            const success = await deductCreditFirestore(user.uid);
            if (success) {
              // Refresh profile to get updated credits
              await fetchProfile(user.uid);
            } else {
              console.error("Failed to deduct credit.");
              return c;
            }

            // Save to Firestore
            try {
              const dbData = await saveCandidateToFirestore(updated, match.score);
              if (dbData && dbData.length > 0) {
                updated.id = dbData[0].id.toString();
                updated.isSynced = true;
              }
            } catch (dbError) {
              console.error("Failed to save to Firestore, but continuing UI update:", dbError);
            }
            return updated;
          } catch (error) {
            console.error("Error matching candidate:", error);
            return c;
          }
        })
      );
      setCandidates(updatedCandidates);
    } finally {
      setIsMatching(false);
    }
  };

  const handleHire = (id: string) => {
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, isHired: true } : c));
  };

  const handleStartEdit = (candidate: CandidateProfile) => {
    setEditedProfile({ ...candidate });
    setIsEditingProfile(true);
  };

  const handleSaveEdit = async () => {
    if (!editedProfile) return;
    
    setIsScanning(true); // Reuse scanning state for loading
    try {
      await saveCandidateToFirestore(editedProfile, editedProfile.match_score || 0);
      setCandidates(prev => prev.map(c => c.id === editedProfile.id ? { ...editedProfile, isSynced: true } : c));
      setIsEditingProfile(false);
      setEditedProfile(null);
      setSuccessMessage("Profile updated successfully!");
    } catch (error) {
      console.error("Error updating profile:", error);
      setErrorMessage("Failed to update profile.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleGenerateContract = async (candidate: CandidateWithMatch) => {
    setIsGeneratingContract(true);
    try {
      const contract = await generateContract(candidate, jobDescription);
      setCandidates(prev => prev.map(c => c.id === candidate.id ? { ...c, contract } : c));
      setSelectedCandidateId(candidate.id);
      setView('contract');
    } catch (error) {
      console.error("Error generating contract:", error);
    } finally {
      setIsGeneratingContract(false);
    }
  };

  const selectedCandidate = candidates.find(c => c.id === selectedCandidateId);

  const printContract = () => {
    if (window.self !== window.top) {
      setSuccessMessage("Note: Printing in a preview window might be restricted. If the print dialog doesn't appear, please open the app in a new tab.");
    }
    window.print();
  };

  const copyContract = () => {
    if (selectedCandidate?.contract) {
      navigator.clipboard.writeText(selectedCandidate.contract);
      setSuccessMessage("Contract copied to clipboard!");
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Navigation */}
      <nav className="border-b border-[#141414] px-6 py-4 flex justify-between items-center bg-[#E4E3E0] sticky top-0 z-50 no-print">
        <div 
          className="flex items-center gap-2 cursor-pointer" 
          onClick={() => setView('landing')}
        >
          <div className="w-8 h-8 bg-[#141414] rounded-sm flex items-center justify-center">
            <Briefcase className="text-[#E4E3E0] w-5 h-5" />
          </div>
          <span className="font-bold tracking-tighter text-xl">TALENT.AI</span>
        </div>
        
        {(!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) && (
          <div className="bg-amber-100 text-amber-800 px-4 py-1 rounded text-[10px] font-bold uppercase tracking-widest border border-amber-200">
            Supabase Keys Missing
          </div>
        )}
        
        <AnimatePresence>
          {successMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute left-1/2 -translate-x-1/2 top-20 bg-emerald-600 text-white px-6 py-3 rounded-full shadow-xl font-bold text-xs uppercase tracking-widest flex items-center gap-2 z-[60]"
            >
              <CheckCircle size={16} /> {successMessage}
              <button onClick={() => setSuccessMessage(null)} className="ml-4 opacity-50 hover:opacity-100">×</button>
            </motion.div>
          )}
          {errorMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute left-1/2 -translate-x-1/2 top-20 bg-red-600 text-white px-6 py-3 rounded-full shadow-xl font-bold text-xs uppercase tracking-widest flex items-center gap-2 z-[60]"
            >
              <AlertCircle size={16} /> {errorMessage}
              <button onClick={() => setErrorMessage(null)} className="ml-4 opacity-50 hover:opacity-100">×</button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-8">
          {/* Role Switcher Tabs */}
          <div className="flex bg-[#F5F5F3] border border-[#141414] p-1 rounded-sm">
            <button 
              onClick={() => setView('recruiter')}
              className={cn(
                "px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all",
                view === 'recruiter' ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#141414]/5"
              )}
            >
              Recruiter
            </button>
            <button 
              onClick={() => setView('candidate')}
              className={cn(
                "px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all",
                view === 'candidate' ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#141414]/5"
              )}
            >
              Candidate
            </button>
          </div>

          <div className="flex gap-6 text-xs font-bold uppercase tracking-widest items-center">
            {user ? (
              <>
                {profile?.is_admin && (
                  <button 
                    onClick={() => setView('admin')}
                    className={cn("hover:opacity-50 transition-opacity", view === 'admin' && "underline underline-offset-4")}
                  >
                    Admin
                  </button>
                )}
                <div className="flex flex-col items-end border-l border-[#141414]/10 pl-6">
                  <span className="text-[8px] opacity-50">Account</span>
                  <span className="font-bold lowercase text-[10px]">{user.email}</span>
                </div>
                <button 
                  onClick={handleSignOut}
                  className="hover:bg-[#141414] hover:text-[#E4E3E0] transition-all border border-[#141414] px-3 py-1 text-[10px]"
                >
                  Logout
                </button>
              </>
            ) : (
              <button 
                onClick={() => setView('landing')}
                className={cn("hover:opacity-50 transition-opacity", view === 'landing' && "underline underline-offset-4")}
              >
                Login
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {(!user && !isAuthLoading) ? (
            <motion.div
              key="login"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-md mx-auto mt-20 p-8 bg-white border border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]"
            >
              <h2 className="text-3xl font-bold tracking-tighter mb-6 uppercase">
                {isSignUp ? 'Create Account' : `${view === 'candidate' ? 'Candidate' : 'Recruiter'} Login`}
              </h2>
              <p className="text-xs opacity-60 mb-8 uppercase tracking-widest font-bold">
                {isSignUp 
                  ? `Sign up to start ${view === 'candidate' ? 'managing your profile' : 'scanning candidates'}` 
                  : `Enter your credentials to access the ${view === 'candidate' ? 'candidate portal' : 'recruitment agent'}`}
              </p>
              
              <form onSubmit={handleSignIn} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-50">Email Address</label>
                  <input 
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full p-4 bg-[#F5F5F3] border border-[#141414] focus:outline-none font-mono text-sm"
                    placeholder="name@company.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-50">Password</label>
                  <input 
                    type="password"
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full p-4 bg-[#F5F5F3] border border-[#141414] focus:outline-none font-mono text-sm"
                    placeholder="••••••••"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={isSigningIn}
                  className="w-full bg-[#141414] text-[#E4E3E0] py-4 font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-opacity-90 transition-all disabled:opacity-50"
                >
                  {isSigningIn ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </button>
                
                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#141414]/10"></div></div>
                  <div className="relative flex justify-center text-[10px] uppercase font-bold"><span className="bg-white px-2 opacity-40">Or continue with</span></div>
                </div>

                <button 
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isSigningIn}
                  className="w-full border border-[#141414] py-4 font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-[#F5F5F3] transition-all disabled:opacity-50"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Google Account
                </button>
              </form>
              <div className="mt-8 pt-8 border-t border-[#141414]/10 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">
                  {isSignUp ? 'Already have an account?' : "Don't have an account?"} <br />
                  <button 
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="text-[#141414] underline mt-2"
                  >
                    {isSignUp ? 'Sign In instead' : 'Create a new account'}
                  </button>
                </p>
              </div>
            </motion.div>
          ) : isAuthLoading ? (
            <div className="flex items-center justify-center min-h-[50vh]">
              <Loader2 className="animate-spin text-[#141414]" size={48} />
            </div>
          ) : (
            <>
              {view === 'landing' && (
            <motion.div 
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center min-h-[70vh]"
            >
              <div>
                <h1 className="text-7xl lg:text-8xl font-bold tracking-tighter leading-[0.9] mb-8">
                  HIRE WITH <br />
                  <span className="italic font-serif font-light">PRECISION.</span>
                </h1>
                <p className="text-xl max-w-md mb-12 opacity-70">
                  The AI-powered recruitment agent that scans CVs, matches skills to roles, and automates the hiring workflow.
                </p>
                <div className="flex flex-wrap gap-4">
                  <button 
                    onClick={() => setView('recruiter')}
                    className="bg-[#141414] text-[#E4E3E0] px-8 py-4 font-bold uppercase tracking-widest text-sm hover:bg-opacity-90 transition-all flex items-center gap-2"
                  >
                    Start Recruiting <ChevronRight size={16} />
                  </button>
                  <button 
                    onClick={() => setView('candidate')}
                    className="border border-[#141414] px-8 py-4 font-bold uppercase tracking-widest text-sm hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
                  >
                    Upload My CV
                  </button>
                </div>

                {/* Stats Section */}
                <div className="mt-16 grid grid-cols-2 gap-8 border-t border-[#141414] pt-8">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Total CVs Processed</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold tracking-tighter">
                        {isLoadingStats ? '...' : appStats.totalCVs}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-30">Documents</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Active Recruiters</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold tracking-tighter">
                        {isLoadingStats ? '...' : appStats.totalRecruiters}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-30">Partners</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="relative aspect-square border border-[#141414] p-8 flex flex-col justify-between group overflow-hidden">
                <div className="absolute inset-0 bg-[#141414] translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-in-out" />
                <div className="relative z-10 flex justify-between items-start group-hover:text-[#E4E3E0] transition-colors">
                  <span className="font-mono text-xs">01 / AUTOMATION</span>
                  <FileText size={48} strokeWidth={1} />
                </div>
                <div className="relative z-10 group-hover:text-[#E4E3E0] transition-colors">
                  <h3 className="text-4xl font-bold tracking-tighter mb-4">CV SCANNING</h3>
                  <p className="opacity-70 text-sm max-w-xs">
                    Instant extraction of skills, experience, and education using Gemini 3 Flash.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'recruiter' && (
            <motion.div 
              key="recruiter"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-12"
            >
              <div className="flex justify-between items-end border-b border-[#141414] pb-8">
                <div>
                  <h2 className="text-5xl font-bold tracking-tighter">RECRUITER DASHBOARD</h2>
                  <p className="opacity-60 font-mono text-xs mt-2 uppercase tracking-widest">Manage candidates and job requirements</p>
                </div>
                  <div className="flex flex-col items-end gap-4">
                    {/* Usage Dashboard */}
                    <div className="hidden md:flex items-center gap-6 px-6 py-3 bg-[#F5F5F3] border border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                      <div className="flex flex-col">
                        <span className="text-[8px] uppercase font-bold opacity-40">Job Slots</span>
                        <span className="text-xs font-bold">{credits.jobSlotsUsed}/{credits.jobSlots}</span>
                      </div>
                      <div className="w-px h-6 bg-[#141414]/10" />
                      <div className="flex flex-col">
                        <span className="text-[8px] uppercase font-bold opacity-40">Scan Credits</span>
                        <span className="text-xs font-bold">{profile?.credits ?? 0}</span>
                      </div>
                      {profile?.is_admin && (
                        <button 
                          onClick={async () => {
                            if (user) {
                              const success = await addCreditsFirestore(user.uid, 50);
                              if (success) {
                                await fetchProfile(user.uid);
                                setSuccessMessage("Admin: Added 50 more scan credits!");
                              }
                            }
                          }}
                          className="ml-2 p-1.5 bg-[#141414] text-[#E4E3E0] hover:opacity-80 transition-opacity flex items-center gap-1"
                          title="Admin: Add credits"
                        >
                          <Plus size={10} /> <CreditCard size={10} />
                        </button>
                      )}
                    </div>

                  <div className="flex gap-4">
                    <input 
                      type="file" 
                      multiple 
                      className="hidden" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload}
                      accept=".pdf,.doc,.docx,.txt,image/*"
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="border border-[#141414] px-6 py-3 font-bold uppercase tracking-widest text-xs flex items-center gap-2 hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
                    >
                      <Plus size={16} /> Add CVs
                    </button>
                    <button 
                      onClick={fetchCandidates}
                      disabled={isLoadingFromDB}
                      className="border border-[#141414] px-6 py-3 font-bold uppercase tracking-widest text-xs flex items-center gap-2 hover:bg-[#141414] hover:text-[#E4E3E0] transition-all disabled:opacity-50"
                    >
                      <RefreshCw size={16} className={isLoadingFromDB ? "animate-spin" : ""} /> 
                      {isLoadingFromDB ? "Syncing..." : "Sync DB"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Job Description Panel */}
                <div className="lg:col-span-1 space-y-6">
                  <div className="bg-white p-6 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                    <h3 className="font-bold uppercase tracking-widest text-xs mb-4 flex items-center gap-2">
                      <Briefcase size={14} /> Job Description
                    </h3>
                    <textarea 
                      className="w-full h-64 p-4 bg-[#F5F5F3] border border-[#141414] focus:outline-none font-mono text-sm resize-none"
                      placeholder="Paste the job requirements here..."
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                    />
                    <button 
                      onClick={handleMatchAll}
                      disabled={isMatching || candidates.length === 0 || !jobDescription.trim() || credits.scansUsed >= credits.scansTotal}
                      className="w-full mt-4 bg-[#141414] text-[#E4E3E0] py-4 font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      {isMatching ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                      {candidates.length === 0 ? "Upload CVs First" : 
                       !jobDescription.trim() ? "Enter Job Description" : 
                       credits.scansUsed >= credits.scansTotal ? "Out of Credits" : "Run AI Matching"}
                    </button>
                    {credits.scansUsed < credits.scansTotal && candidates.length > 0 && (
                      <p className="text-[8px] uppercase font-bold opacity-40 mt-2 text-center">
                        Costs {candidates.filter(c => !c.match).length} credits
                      </p>
                    )}
                  </div>
                </div>

                {/* Candidates List */}
                <div className="lg:col-span-2 space-y-4">
                  <h3 className="font-bold uppercase tracking-widest text-xs flex items-center gap-2">
                    <UserIcon size={14} /> Candidates ({candidates.length})
                  </h3>
                  
                  {isScanning && (
                    <div className="p-12 border border-dashed border-[#141414] flex flex-col items-center justify-center gap-4 bg-white/50">
                      <Loader2 className="animate-spin text-[#141414]" size={32} />
                      <div className="text-center space-y-2">
                        <p className="font-bold uppercase tracking-widest text-xs">Scanning CVs...</p>
                        {scanningProgress.total > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-mono opacity-60">
                              File {scanningProgress.current} of {scanningProgress.total}
                            </p>
                            <p className="text-[10px] font-bold text-emerald-600 animate-pulse uppercase tracking-tighter">
                              {scanningProgress.status}
                            </p>
                            <div className="w-48 h-1 bg-[#141414]/10 mx-auto mt-2">
                              <div 
                                className="h-full bg-[#141414] transition-all duration-500" 
                                style={{ width: `${(scanningProgress.current / scanningProgress.total) * 100}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {candidates.length === 0 && !isScanning && (
                    <div className="p-12 border border-dashed border-[#141414] flex flex-col items-center justify-center gap-4 bg-white/50">
                      <Upload className="opacity-20" size={48} />
                      <p className="font-bold uppercase tracking-widest text-xs opacity-40">No candidates uploaded yet</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4">
                    {candidates.sort((a, b) => (b.match?.score || 0) - (a.match?.score || 0)).map((candidate) => (
                      <motion.div 
                        layout
                        key={candidate.id}
                        className={cn(
                          "bg-white border border-[#141414] p-6 transition-all hover:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] group",
                          candidate.isHired && "border-emerald-500 bg-emerald-50/50"
                        )}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex gap-4">
                            <div className="w-12 h-12 bg-[#141414] flex items-center justify-center text-[#E4E3E0] font-bold text-xl">
                              {candidate.full_name?.[0] || '?'}
                            </div>
                            <div>
                              <h4 className="text-xl font-bold tracking-tight flex items-center gap-2">
                                {candidate.full_name}
                                {candidate.isHired && <CheckCircle size={16} className="text-emerald-500" />}
                              </h4>
                              <div className="flex gap-3 mt-1">
                                <p className="text-[10px] font-mono opacity-60">{candidate.email}</p>
                                {candidate.location && (
                                  <p className="text-[10px] font-mono opacity-60 flex items-center gap-1">
                                    <MapPin size={10} /> {candidate.location}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-4 items-start">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(candidate.id);
                              }}
                              className="p-2 text-red-500 hover:bg-red-50 transition-colors border border-transparent hover:border-red-200"
                              title="Delete Candidate"
                            >
                              <Trash2 size={16} />
                            </button>
                            {candidate.match && (
                              <div className="text-right">
                                <div className="text-3xl font-bold tracking-tighter">{candidate.match.score}%</div>
                                <div className="text-[10px] font-bold uppercase tracking-widest opacity-50">Match Score</div>
                              </div>
                            )}
                          </div>
                        </div>

                        {candidate.isSynced && (
                          <div className="mt-4 p-2 bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-widest border border-emerald-200 flex items-center gap-2">
                            <CheckCircle size={12} /> Successfully saved to Firestore!
                          </div>
                        )}

                        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-2">Top Skills</h5>
                            <div className="flex flex-wrap gap-2">
                              {candidate.skills.slice(0, 5).map(skill => (
                                <span key={skill} className="px-2 py-1 bg-[#F5F5F3] border border-[#141414] text-[10px] font-bold uppercase">
                                  {skill}
                                </span>
                              ))}
                            </div>
                          </div>
                          {candidate.match && (
                            <div>
                              <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-2">AI Insights</h5>
                              <div className="space-y-1">
                                {candidate.match.strengths.slice(0, 2).map(s => (
                                  <div key={s} className="text-[10px] flex items-center gap-1 text-emerald-700 font-medium">
                                    <CheckCircle size={10} /> {s}
                                  </div>
                                ))}
                                {candidate.match.gaps.slice(0, 1).map(g => (
                                  <div key={g} className="text-[10px] flex items-center gap-1 text-red-700 font-medium">
                                    <XCircle size={10} /> Missing: {g}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="mt-6 pt-6 border-t border-[#141414]/10 flex justify-between items-center">
                          <div className="flex flex-col">
                            <p className="text-xs italic opacity-60 line-clamp-1 max-w-md">
                              {candidate.summary}
                            </p>
                            {candidate.match && (
                              <span className="text-[8px] font-bold uppercase tracking-widest text-emerald-600 mt-1 flex items-center gap-1">
                                <CheckCircle size={8} /> Synced to Firestore
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {!candidate.isHired ? (
                              <button 
                                onClick={() => handleHire(candidate.id)}
                                className="px-4 py-2 bg-[#141414] text-[#E4E3E0] text-[10px] font-bold uppercase tracking-widest hover:bg-opacity-80 transition-all"
                              >
                                Select Candidate
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleGenerateContract(candidate)}
                                disabled={isGeneratingContract}
                                className="px-4 py-2 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-2"
                              >
                                {isGeneratingContract ? <Loader2 className="animate-spin" size={12} /> : <FileText size={12} />}
                                {candidate.contract ? "View Contract" : "Generate Contract"}
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'candidate' && (
            <motion.div 
              key="candidate"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-2xl mx-auto space-y-12"
            >
              <div className="text-center space-y-4">
                <h2 className="text-5xl font-bold tracking-tighter">CANDIDATE PORTAL</h2>
                <p className="opacity-60 max-w-md mx-auto">
                  Upload your CV to see how our AI Agent analyzes your professional profile and matches you to opportunities.
                </p>
                {!user && (
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">
                    Sign in to retrieve and edit your previously uploaded CVs
                  </p>
                )}
              </div>

              <div 
                className="border-2 border-dashed border-[#141414] p-12 text-center space-y-6 bg-white cursor-pointer hover:bg-[#F5F5F3] transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  className="hidden" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload}
                  accept=".pdf,.doc,.docx,.txt,image/*"
                />
                <div className="w-16 h-16 bg-[#141414] rounded-full flex items-center justify-center mx-auto text-[#E4E3E0]">
                  <Upload size={24} />
                </div>
                <div>
                  <p className="font-bold uppercase tracking-widest text-sm">Click to upload CV</p>
                  <p className="text-xs opacity-50 mt-1">PDF, Word, or Image files supported</p>
                </div>
              </div>

              {isScanning && (
                <div className="flex flex-col items-center justify-center gap-3">
                  <div className="flex items-center gap-3 font-bold uppercase tracking-widest text-xs">
                    <Loader2 className="animate-spin" size={16} /> AI is scanning your profile...
                  </div>
                  {scanningProgress.status && (
                    <p className="text-[10px] font-bold text-emerald-600 animate-pulse uppercase tracking-tighter">
                      {scanningProgress.status}
                    </p>
                  )}
                  {scanningProgress.total > 1 && (
                    <div className="w-48 h-1 bg-[#141414]/10 mt-2">
                      <div 
                        className="h-full bg-[#141414] transition-all duration-500" 
                        style={{ width: `${(scanningProgress.current / scanningProgress.total) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {isFetchingCandidate && (
                <div className="flex items-center justify-center gap-3 font-bold uppercase tracking-widest text-xs">
                  <Loader2 className="animate-spin" size={16} /> Retrieving your profile...
                </div>
              )}

              {candidates.length > 0 && !isScanning && (
                <div className="space-y-6">
                  <h3 className="font-bold uppercase tracking-widest text-xs border-b border-[#141414] pb-2">Your Uploaded CVs ({candidates.length})</h3>
                  {candidates.map(c => (
                    <div key={c.id} className="bg-white border border-[#141414] p-8 space-y-8 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-3xl font-bold tracking-tighter">{c.full_name}</h4>
                          <div className="flex flex-wrap gap-4 mt-2">
                            <p className="font-mono text-[10px] opacity-60 flex items-center gap-1">
                              <FileText size={10} /> {c.email}
                            </p>
                            {c.phone && (
                              <p className="font-mono text-[10px] opacity-60 flex items-center gap-1">
                                <Phone size={10} /> {c.phone}
                              </p>
                            )}
                            {c.location && (
                              <p className="font-mono text-[10px] opacity-60 flex items-center gap-1">
                                <MapPin size={10} /> {c.location}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className="px-3 py-1 bg-[#141414] text-[#E4E3E0] text-[10px] font-bold uppercase tracking-widest">
                            {c.match_score ? `Match: ${c.match_score}%` : 'Profile'}
                          </div>
                          <button 
                            onClick={() => {
                              triggerConfirm(
                                "Delete CV",
                                "Are you sure you want to delete this CV? This action cannot be undone.",
                                async () => {
                                  await deleteCandidateFromFirestore(c.id);
                                  setCandidates(prev => prev.filter(cand => cand.id !== c.id));
                                  setSuccessMessage("CV deleted successfully.");
                                }
                              );
                            }}
                            className="text-[8px] font-bold uppercase tracking-widest text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h5 className="font-bold uppercase tracking-widest text-[10px] opacity-50">Professional Summary</h5>
                        <p className="text-sm leading-relaxed">{c.summary}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <h5 className="font-bold uppercase tracking-widest text-[10px] opacity-50">Expertise</h5>
                          <div className="flex flex-wrap gap-2">
                            {c.skills.map(s => (
                              <span key={s} className="px-2 py-1 border border-[#141414] text-[10px] font-bold uppercase">{s}</span>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-4">
                          <h5 className="font-bold uppercase tracking-widest text-[10px] opacity-50">Education</h5>
                          {c.education.map((e, idx) => (
                            <div key={idx} className="text-xs">
                              <p className="font-bold">{e.degree}</p>
                              <p className="opacity-60">{e.institution}, {e.year}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex justify-end gap-4 border-t border-[#141414] pt-6">
                        <button 
                          onClick={() => handleStartEdit(c)}
                          className="flex items-center gap-2 font-bold uppercase tracking-widest text-[10px] hover:opacity-50 transition-opacity"
                        >
                          <Edit size={14} /> Edit Profile
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isEditingProfile && editedProfile && (
                <div className="fixed inset-0 bg-[#141414]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-white border border-[#141414] w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8 space-y-8 shadow-[16px_16px_0px_0px_rgba(20,20,20,1)]"
                  >
                    <div className="flex justify-between items-center border-b border-[#141414] pb-4">
                      <h3 className="text-2xl font-bold tracking-tighter uppercase">Edit Your Profile</h3>
                      <button onClick={() => setIsEditingProfile(false)} className="hover:opacity-50"><X size={24} /></button>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase opacity-50">Full Name</label>
                        <input 
                          className="w-full p-3 bg-[#F5F5F3] border border-[#141414] focus:outline-none text-sm"
                          value={editedProfile.full_name}
                          onChange={(e) => setEditedProfile({...editedProfile, full_name: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase opacity-50">Email</label>
                        <input 
                          className="w-full p-3 bg-[#F5F5F3] border border-[#141414] focus:outline-none text-sm opacity-50"
                          value={editedProfile.email}
                          disabled
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase opacity-50">Phone</label>
                        <input 
                          className="w-full p-3 bg-[#F5F5F3] border border-[#141414] focus:outline-none text-sm"
                          value={editedProfile.phone || ''}
                          onChange={(e) => setEditedProfile({...editedProfile, phone: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase opacity-50">Location</label>
                        <input 
                          className="w-full p-3 bg-[#F5F5F3] border border-[#141414] focus:outline-none text-sm"
                          value={editedProfile.location || ''}
                          onChange={(e) => setEditedProfile({...editedProfile, location: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase opacity-50">Professional Summary</label>
                      <textarea 
                        className="w-full p-3 bg-[#F5F5F3] border border-[#141414] focus:outline-none text-sm h-32 resize-none"
                        value={editedProfile.summary}
                        onChange={(e) => setEditedProfile({...editedProfile, summary: e.target.value})}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase opacity-50">Skills (Comma separated)</label>
                      <input 
                        className="w-full p-3 bg-[#F5F5F3] border border-[#141414] focus:outline-none text-sm"
                        value={editedProfile.skills.join(', ')}
                        onChange={(e) => setEditedProfile({...editedProfile, skills: e.target.value.split(',').map(s => s.trim())})}
                      />
                    </div>

                    <button 
                      onClick={handleSaveEdit}
                      className="w-full bg-[#141414] text-[#E4E3E0] py-4 font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                    >
                      <Save size={16} /> Save Changes
                    </button>
                  </motion.div>
                </div>
              )}
            </motion.div>
          )}

          {view === 'contract' && selectedCandidate && (
            <motion.div 
              key="contract"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <div className="flex justify-between items-center no-print">
                <button 
                  onClick={() => setView('recruiter')}
                  className="flex items-center gap-2 font-bold uppercase tracking-widest text-xs hover:opacity-50 transition-opacity"
                >
                  <ArrowLeft size={16} /> Back to Dashboard
                </button>
                <div className="flex gap-4">
                  <button 
                    onClick={copyContract}
                    className="border border-[#141414] px-4 py-2 font-bold uppercase tracking-widest text-xs flex items-center gap-2 hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
                  >
                    <Copy size={16} /> Copy Text
                  </button>
                  <button 
                    onClick={printContract}
                    className="bg-[#141414] text-[#E4E3E0] px-6 py-2 font-bold uppercase tracking-widest text-xs flex items-center gap-2 hover:bg-opacity-80 transition-all"
                  >
                    <Printer size={16} /> Print Contract
                  </button>
                </div>
              </div>

              <div 
                id="printable-contract"
                className="bg-white border border-[#141414] p-12 shadow-xl markdown-body min-h-[1000px]"
              >
                <div className="mb-12 border-b-4 border-[#141414] pb-8 flex justify-between items-end">
                  <div>
                    <h1 className="text-4xl font-bold tracking-tighter mb-0">EMPLOYMENT AGREEMENT</h1>
                    <p className="text-xs font-mono opacity-60 uppercase tracking-widest mt-2">Generated by TALENT.AI Agent</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm">DATE: {new Date().toLocaleDateString()}</p>
                    <p className="text-xs opacity-60">REF: {selectedCandidate.id.toUpperCase()}</p>
                  </div>
                </div>
                
                <ReactMarkdown>{selectedCandidate.contract || ''}</ReactMarkdown>

                <div className="mt-24 grid grid-cols-2 gap-24 no-print-signatures">
                  <div className="border-t border-[#141414] pt-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-8">Employer Signature</p>
                    <div className="h-12" />
                    <p className="font-bold">Authorized Representative</p>
                  </div>
                  <div className="border-t border-[#141414] pt-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-8">Employee Signature</p>
                    <div className="h-12" />
                    <p className="font-bold">{selectedCandidate.full_name}</p>
                  </div>
                </div>
              </div>

              <div className="bg-[#141414] text-[#E4E3E0] p-6 no-print">
                <p className="text-xs font-bold uppercase tracking-widest mb-2">Next Steps</p>
                <p className="text-sm opacity-70">
                  Review the generated contract carefully. You can print it directly or copy the text to your preferred document editor for further customization.
                </p>
              </div>
            </motion.div>
          )}

          {view === 'admin' && profile?.is_admin && (
            <motion.div
              key="admin"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-12"
            >
              <div className="flex justify-between items-end border-b border-[#141414] pb-8">
                <div>
                  <h2 className="text-5xl font-bold tracking-tighter uppercase">Admin Dashboard</h2>
                  <p className="opacity-60 font-mono text-xs mt-2 uppercase tracking-widest">Manage recruiters and system credits</p>
                </div>
                <button 
                  onClick={() => setView('recruiter')}
                  className="bg-[#141414] text-[#E4E3E0] px-6 py-2 font-bold uppercase tracking-widest text-xs flex items-center gap-2"
                >
                  <ArrowLeft size={14} /> Back to Dashboard
                </button>
              </div>

              {/* Add New Recruiter Form */}
              <div className="bg-white border border-[#141414] p-8 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
                <h3 className="text-xl font-bold tracking-tighter mb-6 uppercase">Add New Recruiter</h3>
                <form onSubmit={handleAddRecruiter} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-50">Recruiter Email</label>
                    <input 
                      type="email"
                      required
                      value={newRecruiterEmail}
                      onChange={(e) => setNewRecruiterEmail(e.target.value)}
                      className="w-full p-3 bg-[#F5F5F3] border border-[#141414] focus:outline-none font-mono text-xs"
                      placeholder="recruiter@company.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-50">Initial Credits</label>
                    <input 
                      type="number"
                      required
                      min="0"
                      value={newRecruiterCredits}
                      onChange={(e) => setNewRecruiterCredits(parseInt(e.target.value))}
                      className="w-full p-3 bg-[#F5F5F3] border border-[#141414] focus:outline-none font-mono text-xs"
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={isAddingRecruiter}
                    className="bg-[#141414] text-[#E4E3E0] py-3 font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-opacity-90 transition-all disabled:opacity-50"
                  >
                    {isAddingRecruiter ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                    Add Recruiter
                  </button>
                </form>
                <p className="text-[8px] font-bold uppercase tracking-widest opacity-40 mt-4">
                  Note: This creates a pending profile. The recruiter must still sign up with this email to activate their account.
                </p>
              </div>

              {isLoadingUsers ? (
                <div className="flex items-center justify-center py-24">
                  <Loader2 className="animate-spin" size={48} />
                </div>
              ) : (
                <div className="bg-white border border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#F5F5F3] border-b border-[#141414]">
                        <th className="p-4 text-[10px] font-bold uppercase tracking-widest opacity-50">Recruiter Email</th>
                        <th className="p-4 text-[10px] font-bold uppercase tracking-widest opacity-50">User ID</th>
                        <th className="p-4 text-[10px] font-bold uppercase tracking-widest opacity-50">Credits</th>
                        <th className="p-4 text-[10px] font-bold uppercase tracking-widest opacity-50">Role</th>
                        <th className="p-4 text-[10px] font-bold uppercase tracking-widest opacity-50 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allUsers.map((u) => (
                        <tr key={u.id} className="border-b border-[#141414]/10 hover:bg-[#F5F5F3]/50 transition-colors">
                          <td className="p-4 text-sm font-bold">{u.email}</td>
                          <td className="p-4 text-[10px] font-mono opacity-50">{u.id}</td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold">{u.credits}</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={cn(
                              "text-[8px] font-bold uppercase tracking-widest px-2 py-1 border",
                              u.is_admin ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-blue-100 text-blue-800 border-blue-200"
                            )}>
                              {u.is_admin ? 'Admin' : 'Recruiter'}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => handleUpdateUserCredits(u.id, u.credits + 10)}
                                className="p-2 border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
                                title="Add 10 Credits"
                              >
                                <Plus size={14} />
                              </button>
                              <button 
                                onClick={() => {
                                  const amount = prompt("Enter new credit amount:", u.credits.toString());
                                  if (amount !== null) {
                                    handleUpdateUserCredits(u.id, parseInt(amount));
                                  }
                                }}
                                className="p-2 border border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
                                title="Set Custom Credits"
                              >
                                <CreditCard size={14} />
                              </button>
                              <button 
                                onClick={() => handleDeleteUser(u.id)}
                                disabled={isLoadingUsers}
                                className="p-2 border border-red-200 text-red-600 hover:bg-red-600 hover:text-white transition-all disabled:opacity-50"
                                title="Delete Recruiter"
                              >
                                {isLoadingUsers ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  </main>

      <footer className="border-t border-[#141414] px-6 py-12 mt-24 no-print">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-12">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-[#141414] rounded-sm flex items-center justify-center">
                <Briefcase className="text-[#E4E3E0] w-4 h-4" />
              </div>
              <span className="font-bold tracking-tighter text-lg">TALENT.AI</span>
            </div>
            <p className="text-xs opacity-50 max-w-xs">
              Empowering recruitment through advanced generative AI. Built with Gemini 3 Flash.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-12">
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold uppercase tracking-widest opacity-50">Product</h4>
              <ul className="text-xs font-bold space-y-2">
                <li><button className="hover:opacity-50">Features</button></li>
                <li><button className="hover:opacity-50">Pricing</button></li>
                <li><button className="hover:opacity-50">API</button></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold uppercase tracking-widest opacity-50">Company</h4>
              <ul className="text-xs font-bold space-y-2">
                <li><button className="hover:opacity-50">About</button></li>
                <li><button className="hover:opacity-50">Careers</button></li>
                <li><button className="hover:opacity-50">Legal</button></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-12 pt-12 border-t border-[#141414]/10 flex justify-between items-center text-[10px] font-bold uppercase tracking-widest opacity-30">
          <span>© 2026 TALENT.AI AGENT</span>
          <span>STAY HUMAN. HIRE SMART.</span>
        </div>
      </footer>
    </div>
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-[#141414]/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white border border-[#141414] w-full max-w-md p-8 space-y-6 shadow-[16px_16px_0px_0px_rgba(20,20,20,1)]"
          >
            <h3 className="text-2xl font-bold tracking-tighter uppercase">{confirmModal.title}</h3>
            <p className="text-sm opacity-70">{confirmModal.message}</p>
            <div className="flex gap-4 pt-4">
              <button 
                onClick={closeConfirmModal}
                className="flex-1 border border-[#141414] py-3 font-bold uppercase tracking-widest text-[10px] hover:bg-[#F5F5F3] transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={confirmModal.onConfirm}
                className="flex-1 bg-red-600 text-white py-3 font-bold uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all"
              >
                Confirm Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </ErrorBoundary>
  );
}
