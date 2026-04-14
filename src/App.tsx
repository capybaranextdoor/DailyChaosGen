/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, History, Flame, Save, CheckCircle2, Trash2, Dices, RefreshCw, Share2, LogOut, Mail, Lock, UserPlus, LogIn, Loader2 } from "lucide-react";
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';
import { auth, db } from "./lib/firebase";
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  sendEmailVerification,
  User,
  reload
} from "firebase/auth";
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc,
  deleteDoc,
  getDocs
} from "firebase/firestore";
import { handleFirestoreError, OperationType } from "./lib/firestoreUtils";

// Predefined list of creative prompts
const PROMPTS = [
  "Write a 3-sentence story about a toaster that gains sentience.",
  "Describe the color 'blue' to someone who has never seen it.",
  "If you could combine two animals to create the ultimate pet, what would they be?",
  "What would you do if you woke up and everyone else on Earth had disappeared for 24 hours?",
  "Write a haiku about your favorite snack.",
  "Invent a new holiday and describe one tradition associated with it.",
  "If you were a ghost, who would you haunt first and why?",
  "What's the most useless superpower you can imagine?",
  "Describe your current mood as a weather system.",
  "If you could only eat one food for the rest of your life, but it had to be a dessert, what would it be?",
  "Write a letter to your future self in exactly 50 words.",
  "What would the world be like if gravity was 20% weaker?",
  "Describe a fictional machine that solves a minor daily inconvenience.",
  "If you could speak to any inanimate object, which one would it be and what would you ask?",
  "Write a short dialogue between a cat and a dog debating philosophy.",
];

interface Entry {
  id?: string;
  date: string;
  prompt: string;
  response: string;
}

const ENCOURAGEMENTS = [
  "Your creativity is a force of nature!",
  "Another masterpiece added to the chaos.",
  "The world is a bit more interesting now.",
  "Brilliant work! Keep that streak alive.",
  "You're on fire! (Metaphorically, of course).",
  "Chaos looks good on you.",
  "Your brain is a beautiful place.",
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);

  const [response, setResponse] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [streak, setStreak] = useState(0);
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [isDailyPrompt, setIsDailyPrompt] = useState(true);
  const [hasSubmittedToday, setHasSubmittedToday] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [encouragement, setEncouragement] = useState("");

  const getDailyPrompt = () => {
    const today = new Date();
    const dayOfYear = Math.floor(
      (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000
    );
    return PROMPTS[dayOfYear % PROMPTS.length];
  };

  useEffect(() => {
    // Initialize native features if on a native platform
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: Style.Light });
      StatusBar.setBackgroundColor({ color: '#F4F4F1' });
      SplashScreen.hide();
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !user.emailVerified) {
      setEntries([]);
      setStreak(0);
      setHasSubmittedToday(false);
      return;
    }

    // Set initial prompt to daily
    setCurrentPrompt(getDailyPrompt());

    // Sync User Profile
    const userDocRef = doc(db, "users", user.uid);
    const unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setStreak(data.streak || 0);
        
        const today = new Date().toISOString().split("T")[0];
        if (data.lastDate === today) {
          setHasSubmittedToday(true);
          setEncouragement("Welcome back! Your chaos for today is already secured.");
        } else {
          setHasSubmittedToday(false);
          
          // Check if streak should reset
          if (data.lastDate) {
            const todayDate = new Date();
            todayDate.setHours(0,0,0,0);
            const last = new Date(data.lastDate);
            last.setHours(0,0,0,0);
            const diffTime = Math.abs(todayDate.getTime() - last.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays > 1) {
              setDoc(userDocRef, { streak: 0 }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`));
            }
          }
        }
      } else {
        // Create initial user doc
        setDoc(userDocRef, {
          uid: user.uid,
          email: user.email,
          streak: 0,
          lastDate: null
        }).catch(err => handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`));
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`));

    // Sync Entries
    const entriesRef = collection(db, "users", user.uid, "entries");
    const q = query(entriesRef, orderBy("date", "desc"));
    const unsubscribeEntries = onSnapshot(q, (snapshot) => {
      const newEntries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Entry[];
      setEntries(newEntries);
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/entries`));

    return () => {
      unsubscribeUser();
      unsubscribeEntries();
    };
  }, [user]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCredential.user);
        setVerificationSent(true);
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setVerificationSent(false);
  };

  const checkVerification = async () => {
    if (auth.currentUser) {
      await reload(auth.currentUser);
      setUser({ ...auth.currentUser });
    }
  };

  const resendVerification = async () => {
    if (auth.currentUser) {
      try {
        await sendEmailVerification(auth.currentUser);
        alert("Verification email resent!");
      } catch (err: any) {
        setAuthError(err.message);
      }
    }
  };

  const handleNewChaos = () => {
    let newPrompt;
    do {
      newPrompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
    } while (newPrompt === currentPrompt);
    
    setCurrentPrompt(newPrompt);
    setIsDailyPrompt(false);
  };

  const handleResetToDaily = () => {
    setCurrentPrompt(getDailyPrompt());
    setIsDailyPrompt(true);
  };

  const handleSave = async () => {
    if (!response.trim() || !user) return;

    const today = new Date();
    const dateString = today.toISOString().split("T")[0];
    const userDocRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userDocRef);
    const userData = userSnap.data();
    const lastDate = userData?.lastDate;

    const newEntry = {
      uid: user.uid,
      date: dateString,
      prompt: currentPrompt,
      response: response.trim(),
      createdAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, "users", user.uid, "entries"), newEntry);

      // Update streak and lastDate
      let newStreak = streak;
      if (lastDate !== dateString) {
        if (lastDate) {
          const last = new Date(lastDate);
          last.setHours(0,0,0,0);
          const todayDate = new Date();
          todayDate.setHours(0,0,0,0);
          const diffTime = Math.abs(todayDate.getTime() - last.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            newStreak += 1;
          } else {
            newStreak = 1;
          }
        } else {
          newStreak = 1;
        }
      }

      await setDoc(userDocRef, {
        streak: newStreak,
        lastDate: dateString
      }, { merge: true });

      setEncouragement(ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)]);
      setResponse("");
      
      if ("vibrate" in navigator) {
        navigator.vibrate(50);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/entries`);
    }
  };

  const handleShare = async (entry?: Entry) => {
    const textToShare = entry 
      ? `Chaos Prompt: ${entry.prompt}\nMy Response: ${entry.response}`
      : `Today's Chaos: ${currentPrompt}\nJoin the chaos!`;
      
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Daily Chaos Creator",
          text: textToShare,
          url: window.location.href,
        });
      } catch (err) {
        console.log("Error sharing:", err);
      }
    } else {
      navigator.clipboard.writeText(textToShare);
      alert("Copied to clipboard!");
    }
  };

  const clearHistory = async () => {
    if (!user) return;
    if (confirm("Are you sure you want to clear all your creative chaos?")) {
      try {
        const entriesRef = collection(db, "users", user.uid, "entries");
        const snapshot = await getDocs(entriesRef);
        const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);
        
        await setDoc(doc(db, "users", user.uid), {
          streak: 0,
          lastDate: null
        }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/entries`);
      }
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-chaos-bg flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-chaos-ink" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-chaos-bg font-sans text-chaos-ink p-4 flex items-center justify-center">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-md bg-chaos-surface border-2 border-chaos-ink shadow-[12px_12px_0px_0px_rgba(26,26,26,1)] p-8 md:p-10"
        >
          <div className="text-center mb-10">
            <div className="inline-block border-2 border-chaos-ink p-3 mb-4 bg-chaos-accent -rotate-2">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-black uppercase tracking-tighter leading-none mb-2">
              Daily Chaos<br />Creator
            </h1>
            <p className="text-xs font-bold uppercase tracking-widest opacity-50">Authentication Required</p>
          </div>

          {verificationSent ? (
            <div className="text-center space-y-6">
              <div className="bg-chaos-accent/10 border-2 border-chaos-accent p-6">
                <Mail className="w-12 h-12 text-chaos-accent mx-auto mb-4" />
                <h2 className="text-xl font-black uppercase mb-2">Check Your Inbox</h2>
                <p className="text-sm font-medium">We've sent a verification link to <span className="font-bold">{email}</span>. Please verify your email to start creating chaos.</p>
              </div>
              <button
                onClick={() => setVerificationSent(false)}
                className="text-xs font-black uppercase tracking-widest hover:text-chaos-accent transition-colors underline underline-offset-4"
              >
                Back to Login
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={handleAuth} className="space-y-6">
                <div className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 opacity-40" />
                    <input
                      type="email"
                      required
                      placeholder="Email Address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 border-2 border-chaos-ink font-bold focus:outline-none bg-[#fafafa]"
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 opacity-40" />
                    <input
                      type="password"
                      required
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 border-2 border-chaos-ink font-bold focus:outline-none bg-[#fafafa]"
                    />
                  </div>
                </div>

                {authError && (
                  <div className="bg-red-50 border-2 border-red-600 p-3 text-red-600 text-xs font-bold uppercase">
                    {authError}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-chaos-ink text-white py-4 font-black uppercase tracking-widest border-2 border-chaos-ink hover:bg-chaos-accent hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[4px_4px_0px_var(--color-chaos-ink)] transition-all flex items-center justify-center gap-2"
                >
                  {authMode === 'login' ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                  {authMode === 'login' ? 'Enter the Chaos' : 'Join the Chaos'}
                </button>
              </form>

              <div className="mt-8 pt-6 border-t border-chaos-ink/10 text-center">
                <button
                  onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                  className="text-xs font-black uppercase tracking-widest hover:text-chaos-accent transition-colors underline underline-offset-4"
                >
                  {authMode === 'login' ? "Need an account? Sign Up" : "Already a creator? Log In"}
                </button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    );
  }

  if (!user.emailVerified) {
    return (
      <div className="min-h-screen bg-chaos-bg font-sans text-chaos-ink p-4 flex items-center justify-center">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-md bg-chaos-surface border-2 border-chaos-ink shadow-[12px_12px_0px_0px_rgba(26,26,26,1)] p-8 md:p-10 text-center"
        >
          <div className="bg-chaos-accent/10 border-2 border-chaos-accent p-6 mb-8">
            <Mail className="w-12 h-12 text-chaos-accent mx-auto mb-4" />
            <h2 className="text-2xl font-black uppercase mb-2">Verify Your Email</h2>
            <p className="text-sm font-medium mb-4">Your account is almost ready! Please check your email and click the verification link.</p>
            <div className="text-xs font-bold opacity-50 uppercase tracking-widest">Logged in as: {user.email}</div>
          </div>

          <div className="space-y-4">
            <button
              onClick={checkVerification}
              className="w-full bg-chaos-ink text-white py-4 font-black uppercase tracking-widest border-2 border-chaos-ink hover:bg-chaos-accent transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-5 h-5" /> I've Verified My Email
            </button>

            <button
              onClick={resendVerification}
              className="w-full border-2 border-chaos-ink py-4 font-black uppercase tracking-widest hover:bg-chaos-accent/10 transition-all flex items-center justify-center gap-2"
            >
              <Mail className="w-5 h-5" /> Resend Verification Email
            </button>
            
            <button
              onClick={handleLogout}
              className="w-full border-2 border-chaos-ink py-4 font-black uppercase tracking-widest hover:bg-red-50 hover:text-red-600 transition-all flex items-center justify-center gap-2"
            >
              <LogOut className="w-5 h-5" /> Logout
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-chaos-bg font-sans text-chaos-ink selection:bg-chaos-ink selection:text-chaos-bg flex flex-col pt-safe pb-safe px-safe">
      <div className="flex-1 w-full max-w-[800px] mx-auto bg-chaos-surface border-x-2 md:border-2 border-chaos-ink shadow-none md:shadow-[12px_12px_0px_0px_rgba(26,26,26,1)] p-6 md:p-10 relative flex flex-col">
        {/* Header */}
        <header className="flex justify-between items-end mb-8 border-b-2 border-chaos-ink pb-3">
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
          >
            <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter leading-[0.9]">
              Daily Chaos<br />Creator
            </h1>
          </motion.div>

          <motion.div
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="flex flex-col items-end gap-4"
          >
            <div className="bg-chaos-accent text-white px-4 py-2 font-extrabold text-sm uppercase border-2 border-chaos-ink -rotate-2 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
              STREAK: {streak} DAYS
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="text-[10px] font-bold uppercase tracking-widest hover:text-chaos-accent transition-colors flex items-center gap-1"
              >
                <History className="w-3 h-3" />
                {showHistory ? "Back to Chaos" : "View History"}
              </button>
              <button
                onClick={handleLogout}
                className="text-[10px] font-bold uppercase tracking-widest text-red-600 hover:text-red-800 transition-colors flex items-center gap-1"
              >
                <LogOut className="w-3 h-3" /> Logout
              </button>
            </div>
          </motion.div>
        </header>

        <main className="flex-1 min-h-[400px]">
          <AnimatePresence mode="wait">
            {!showHistory ? (
              <motion.div
                key="main"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {/* Prompt Section */}
                <div className="bg-[#EEE] p-6 border-2 border-chaos-ink">
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-[10px] uppercase tracking-[2px] font-bold text-chaos-accent">
                      {isDailyPrompt ? "Today's Chaos Command" : "Random Chaos Command"}
                    </div>
                    <div className="flex gap-4">
                      {!isDailyPrompt && (
                        <button 
                          onClick={handleResetToDaily}
                          className="text-[10px] font-bold uppercase tracking-widest hover:text-chaos-accent transition-colors flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" /> Back to Daily
                        </button>
                      )}
                      <button 
                        onClick={handleNewChaos}
                        className="text-[10px] font-bold uppercase tracking-widest hover:text-chaos-accent transition-colors flex items-center gap-1"
                      >
                        <Dices className="w-3 h-3" /> New Chaos
                      </button>
                    </div>
                  </div>
                  <h2 className="text-xl md:text-2xl font-medium leading-tight">
                    {currentPrompt}
                  </h2>
                </div>

                {hasSubmittedToday ? (
                  <div className="border-2 border-green-600 bg-green-50 p-8 flex flex-col items-center text-center gap-4">
                    <CheckCircle2 className="w-12 h-12 text-green-600" />
                    <div>
                      <p className="font-bold text-xl text-green-800 uppercase tracking-tight">Chaos Logged Successfully</p>
                      <p className="text-green-700 text-sm">{encouragement || "Your contribution to entropy has been recorded."}</p>
                    </div>
                    <button
                      onClick={() => handleShare()}
                      className="mt-4 border-2 border-green-600 px-6 py-2 font-bold uppercase text-xs text-green-700 hover:bg-green-600 hover:text-white transition-all"
                    >
                      Share Today's Chaos
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="relative">
                      <textarea
                        value={response}
                        onChange={(e) => setResponse(e.target.value)}
                        placeholder="Write your chaotic response here..."
                        className="w-full h-64 p-5 border-2 border-chaos-ink font-mono text-lg focus:outline-none bg-[#fafafa] resize-none"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="text-xs font-bold uppercase opacity-50">
                        {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}
                      </div>
                      <button
                        onClick={handleSave}
                        disabled={!response.trim()}
                        className="bg-chaos-ink text-white px-10 py-4 font-bold uppercase text-sm border-none cursor-pointer transition-all active:scale-95 hover:bg-chaos-accent hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_var(--color-chaos-ink)] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Save Response
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="history"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar"
              >
                <div className="flex justify-between items-center sticky top-0 bg-chaos-surface py-2 z-10 border-b border-chaos-ink/10">
                  <h3 className="text-sm font-black uppercase tracking-widest">Chaos Archive</h3>
                  {entries.length > 0 && (
                    <button
                      onClick={clearHistory}
                      className="text-[10px] font-bold uppercase text-red-600 hover:underline flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Wipe Archive
                    </button>
                  )}
                </div>

                {entries.length === 0 ? (
                  <div className="p-12 text-center border-2 border-dashed border-chaos-ink/20">
                    <p className="text-sm font-bold opacity-30 uppercase tracking-widest">Archive Empty</p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {entries.map((entry, i) => (
                      <div
                        key={entry.id || i}
                        className="border-2 border-chaos-ink p-4 bg-[#fafafa]"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] font-bold uppercase opacity-40">{entry.date}</span>
                          <button 
                            onClick={() => handleShare(entry)}
                            className="text-[10px] font-bold uppercase text-chaos-accent flex items-center gap-1"
                          >
                            <Share2 className="w-3 h-3" /> Share
                          </button>
                        </div>
                        <p className="text-xs font-bold mb-2 italic opacity-60">"{entry.prompt}"</p>
                        <p className="text-sm font-medium leading-relaxed">{entry.response}</p>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
