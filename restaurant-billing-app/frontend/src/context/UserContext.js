import React, { createContext, useContext, useState, useEffect } from "react";

// Create the context
const UserContext = createContext();

// Custom hook to use the UserContext
export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};

// Provider component
export const UserProvider = ({ children }) => {
  const [userInitials, setUserInitials] = useState(
    () => localStorage.getItem("userInitials") || "CLK",
  );
  const [track, setTrack] = useState(() => localStorage.getItem("track") || "");
  const [billingDate, setBillingDate] = useState(() => {
    const stored = localStorage.getItem("billingDate");

    // Helper for local date YYYY-MM-DD
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const today = `${year}-${month}-${day}`;

    // If we have a stored date but it's not today, assume a new day has started
    // and default to today to ensure Recent Bills shows relevant data.
    if (stored && stored !== today) {
      return today;
    }
    return stored || null;
  });
  const [sessionId, setSessionId] = useState(
    () => localStorage.getItem("sessionId") || null,
  );

  // Sync with localStorage whenever values change
  useEffect(() => {
    if (userInitials) {
      localStorage.setItem("userInitials", userInitials);
    } else {
      localStorage.removeItem("userInitials");
    }
  }, [userInitials]);

  useEffect(() => {
    if (track) {
      localStorage.setItem("track", track);
    } else {
      localStorage.removeItem("track");
    }
  }, [track]);

  useEffect(() => {
    if (billingDate) {
      localStorage.setItem("billingDate", billingDate);
    } else {
      localStorage.removeItem("billingDate");
    }
  }, [billingDate]);

  useEffect(() => {
    if (sessionId) {
      localStorage.setItem("sessionId", sessionId);
    } else {
      localStorage.removeItem("sessionId");
    }
  }, [sessionId]);

  const value = {
    userInitials,
    setUserInitials,
    track,
    setTrack,
    billingDate,
    setBillingDate,
    sessionId,
    setSessionId,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};
